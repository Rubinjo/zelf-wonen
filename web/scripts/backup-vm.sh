#!/usr/bin/env bash
# Run on the Linux VM. Briefly stop file/database writers for a consistent backup.
set -euo pipefail
umask 077
cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.."
exec 9>.maintenance.lock
flock --exclusive --wait 86400 9
compose=(docker compose --env-file .env.production --profile aggregator --profile maintenance)
backup_root=${1:-.backups}
mkdir -p -- "$backup_root"
backup_dir=$(mktemp -d "$backup_root/$(date -u +%Y%m%dT%H%M%SZ)-XXXXXX")

# Restart exactly the services that were running, including after a failed backup.
running=$("${compose[@]}" ps --services --status running)
writers=()
while IFS= read -r service; do
    case "$service" in web|aggregator) writers+=("$service");; esac
done <<< "$running"
restart_writers() {
    if ((${#writers[@]})); then
        "${compose[@]}" start "${writers[@]}"
    fi
}
trap restart_writers EXIT
if ((${#writers[@]})); then
    "${compose[@]}" stop "${writers[@]}"
fi
"${compose[@]}" exec -T postgres pg_dump -U zelfwonen -d zelfwonen -Fc > "$backup_dir/database.dump"
"${compose[@]}" run --rm --no-deps -T storage-maintenance \
    -czf - .data public/uploads public/aggregated-media > "$backup_dir/files.tar.gz"
"${compose[@]}" exec -T postgres pg_restore --list < "$backup_dir/database.dump" > /dev/null
tar -tzf "$backup_dir/files.tar.gz" > /dev/null
(cd -- "$backup_dir" && sha256sum database.dump files.tar.gz > SHA256SUMS)
touch "$backup_dir/COMPLETE"
printf 'Backup complete: %s\nCopy this directory to private off-server storage.\n' "$backup_dir"
