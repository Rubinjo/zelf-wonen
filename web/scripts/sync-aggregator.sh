#!/usr/bin/env bash
# Run from the host timer; use the same lock as the VM backup script.
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.."
exec 9>.maintenance.lock
flock --exclusive --wait 3600 9
container_name="zelfwonen-aggregator-${INVOCATION_ID:-manual-$$}"
cleanup() {
  docker stop -t 30 "$container_name" >/dev/null 2>&1 || true
}
trap cleanup EXIT
trap 'exit 143' TERM
trap 'exit 130' INT
docker compose --env-file .env.production --profile aggregator \
  run --rm --no-deps -T --name "$container_name" aggregator sync
