#!/usr/bin/env bash
# Run from an uploaded release. Secrets and volumes live outside release directories.
set -euo pipefail
umask 077

release_web=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)
deploy_root=$(cd -- "$release_web/../../.." && pwd -P)
initialize=${1:-false}
[[ "$initialize" == true || "$initialize" == false ]] || exit 2
env_mode=${2:-existing}
[[ "$env_mode" == existing || "$env_mode" == --env-stdin ]] || exit 2
cd "$release_web"

exec 9>"$deploy_root/.maintenance.lock"
flock --exclusive --wait 3600 9

if [[ -e "$deploy_root/web" && ! -L "$deploy_root/web" ]]; then
  echo "$deploy_root/web must be a symlink, not an existing checkout." >&2
  exit 1
fi

env_source="$deploy_root/.env.production"
staged_env=
cleanup() {
  if [[ -n "$staged_env" ]]; then
    rm -f -- "$staged_env"
  fi
}
trap cleanup EXIT
trap 'exit 143' TERM
trap 'exit 130' INT
if [[ "$env_mode" == --env-stdin ]]; then
  staged_env=$(mktemp "$deploy_root/.env.production.XXXXXX")
  # Normalize Windows line endings without interpreting shell syntax in secrets.
  sed 's/\r$//' > "$staged_env"
  env_source="$staged_env"
fi
if [[ ! -s "$env_source" ]] || ! grep -q '[^[:space:]]' "$env_source"; then
  echo 'PRODUCTION_ENV is missing or empty. The existing environment was not replaced.' >&2
  exit 1
fi
if grep -Eq '^[[:space:]]*(export[[:space:]]+)?VPS_PASSWORD[[:space:]]*=' "$env_source"; then
  echo 'Remove VPS_PASSWORD from the server application environment.' >&2
  exit 1
fi
chmod 600 "$env_source"
ln -sfn "$deploy_root/.env.production" .env.production
ln -sfn "$deploy_root/.maintenance.lock" .maintenance.lock

# Reject mutable tags and accidental local images before touching running services.
for image_var in WEB_IMAGE ESTIMATOR_IMAGE AGGREGATOR_IMAGE; do
  grep -Eq "^${image_var}=ghcr.io/[a-z0-9_./-]+@sha256:[a-f0-9]{64}$" .release.env || {
    echo "Missing immutable $image_var in release manifest." >&2
    exit 1
  }
done
export APP_ENV_FILE="$env_source"
compose=(docker compose --env-file "$env_source" --env-file .release.env -p zelfwonen-production)
# Parser diagnostics can contain secret values; report only a generic error.
if ! "${compose[@]}" config --quiet > /dev/null 2>&1; then
  echo 'Invalid production configuration. Check PRODUCTION_ENV against the example file.' >&2
  exit 1
fi

# A renamed volume must never make an existing installation appear empty.
volumes=$(docker volume ls --format '{{.Name}}')
if grep -qx 'zelfwonen-production_houser_postgres_data' <<< "$volumes" && \
   ! grep -qx 'zelfwonen-production_zelfwonen_postgres_data' <<< "$volumes"; then
  echo 'Legacy PostgreSQL storage found. Migrate the database/user and volume before deploying; do not initialize a replacement database.' >&2
  exit 1
fi

schema_hash=$(cat prisma/schema.prisma prisma/immutability.sql | sha256sum | cut -d ' ' -f 1)
if [[ -f "$deploy_root/schema.sha256" ]]; then
  if [[ "$initialize" == true ]]; then
    echo 'Database initialization was already completed. Disable initialize_database.' >&2
    exit 1
  fi
  if [[ "$(cat "$deploy_root/schema.sha256")" != "$schema_hash" ]]; then
    echo 'Schema changed: apply a reviewed database upgrade before deploying this release.' >&2
    exit 1
  fi
elif [[ "$initialize" != true ]]; then
  echo 'First deployment requires initialize_database=true for an empty database.' >&2
  exit 1
fi

# Pull everything before any service is replaced. GHCR packages must be public.
"${compose[@]}" --profile aggregator pull web estimator aggregator postgres caddy
if [[ -n "$staged_env" ]]; then
  mv -f -- "$staged_env" "$deploy_root/.env.production"
  staged_env=
fi
export APP_ENV_FILE="$deploy_root/.env.production"
compose=(docker compose --env-file "$APP_ENV_FILE" --env-file .release.env -p zelfwonen-production)
"${compose[@]}" up -d --no-build --wait --wait-timeout 120 postgres

if [[ "$initialize" == true ]]; then
  tables=$("${compose[@]}" exec -T postgres psql -U zelfwonen -d zelfwonen -Atc \
    "SELECT count(*) FROM pg_tables WHERE schemaname = 'public';")
  if [[ "$tables" != 0 ]]; then
    echo 'Refusing to initialize a nonempty database. No schema changes were made.' >&2
    exit 1
  fi
  "${compose[@]}" run --rm --no-deps -T web npm run db:push
  "${compose[@]}" run --rm --no-deps -T web npm run db:immutability
  printf '%s\n' "$schema_hash" > "$deploy_root/schema.sha256"
fi

"${compose[@]}" up -d --no-build --wait --wait-timeout 180
# Compose recreates Caddy when its release-specific bind mount changes.
"${compose[@]}" exec -T caddy caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
curl --fail --silent --show-error --retry 12 --retry-delay 5 --retry-all-errors \
  --connect-timeout 10 --max-time 30 https://zelf-wonen.online/ > /dev/null

# Timer invocations resolve this link only after a successful deployment.
ln -sfn "$release_web" "$deploy_root/.web-next"
mv -Tf "$deploy_root/.web-next" "$deploy_root/web"
if [[ -f "$deploy_root/current-release" ]]; then
  cp "$deploy_root/current-release" "$deploy_root/previous-release"
fi
printf '%s\n' "$release_web" > "$deploy_root/current-release"
echo "Deployed $release_web"
