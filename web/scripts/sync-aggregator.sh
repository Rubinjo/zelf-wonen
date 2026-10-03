#!/usr/bin/env bash
# Run from the host timer; use the same lock as the VM backup script.
set -euo pipefail
script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -L)
cd -- "$script_dir/.."
exec 9>.maintenance.lock
flock --exclusive --wait 3600 9
# A deployment may have moved the current-release symlink while we waited.
cd -- "$script_dir/.."
container_name="zelfwonen-aggregator-${INVOCATION_ID:-manual-$$}"
cleanup() {
  docker stop -t 30 "$container_name" >/dev/null 2>&1 || true
}
trap cleanup EXIT
trap 'exit 143' TERM
trap 'exit 130' INT
compose=(docker compose --env-file .env.production)
# Published deployments keep the exact image digests beside the release files.
if [[ -f .release.env ]]; then
  compose+=(--env-file .release.env -p zelfwonen-production)
fi
if [[ $# == 0 ]]; then
  set -- sync
fi
"${compose[@]}" --profile aggregator \
  run --rm --no-deps -T --name "$container_name" aggregator "$@"
