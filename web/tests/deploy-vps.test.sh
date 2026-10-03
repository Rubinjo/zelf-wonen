#!/usr/bin/env bash
# Exercise deployment safety decisions without contacting Docker or a real VPS.
set -euo pipefail
source_web=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
scratch=$(mktemp -d)
trap 'rm -rf -- "$scratch"' EXIT
mkdir "$scratch/bin"
export PATH="$scratch/bin:$PATH"
export MOCK_TABLES=0 MOCK_FAIL_UP=false MOCK_FAIL_CURL=false
export MOCK_FAIL_CONFIG=false MOCK_FAIL_PULL=false MOCK_VOLUMES=

cat > "$scratch/bin/docker" <<'EOF'
#!/usr/bin/env bash
echo "$*" >> "$MOCK_LOG"
if [[ "$*" == 'volume ls '* ]]; then
  printf '%s\n' "$MOCK_VOLUMES"
elif [[ "$*" == *'config --quiet'* && "$MOCK_FAIL_CONFIG" == true ]]; then
  echo 'parser-error-containing-a-secret' >&2
  exit 1
elif [[ "$*" == *'pull web estimator'* && "$MOCK_FAIL_PULL" == true ]]; then
  exit 1
elif [[ "$*" == *'psql -U zelfwonen'* ]]; then
  echo "$MOCK_TABLES"
elif [[ "$*" == *'--wait-timeout 180'* && "$MOCK_FAIL_UP" == true ]]; then
  exit 1
fi
EOF
cat > "$scratch/bin/curl" <<'EOF'
#!/usr/bin/env bash
[[ "$MOCK_FAIL_CURL" == false ]]
EOF
chmod +x "$scratch/bin/"*

fixture() {
  root="$scratch/$1"
  release="$root/releases/first/web"
  mkdir -p "$release/scripts" "$release/prisma"
  cp "$source_web/scripts/deploy-vps.sh" "$release/scripts/"
  printf 'schema\n' > "$release/prisma/schema.prisma"
  printf 'triggers\n' > "$release/prisma/immutability.sql"
  printf 'APP_DOMAIN=zelf-wonen.online\n' > "$root/.env.production"
  for name in WEB_IMAGE ESTIMATOR_IMAGE AGGREGATOR_IMAGE; do
    printf '%s=ghcr.io/rubinjo/example@sha256:%064d\n' "$name" 0
  done > "$release/.release.env"
  export MOCK_LOG="$root/docker.log"
  : > "$MOCK_LOG"
}
deploy() { bash "$release/scripts/deploy-vps.sh" "$@" > "$root/output" 2>&1; }
refuse() {
  if deploy "$@"; then
    echo "Expected deployment refusal: $root" >&2
    exit 1
  fi
}

fixture missing-env
rm "$root/.env.production"
refuse true
test ! -s "$MOCK_LOG"

fixture server-password
echo 'VPS_PASSWORD=must-not-enter-container' >> "$root/.env.production"
refuse true
test ! -s "$MOCK_LOG"

fixture missing-initialization
refuse false
test ! -e "$root/schema.sha256"

fixture nonempty
export MOCK_TABLES=3
refuse true
! grep -q 'db:push' "$MOCK_LOG"
test ! -e "$root/schema.sha256"
export MOCK_TABLES=0

fixture initial
deploy true
test -L "$root/web"
test -f "$root/schema.sha256"
grep -q 'db:push' "$MOCK_LOG"
grep -q 'db:immutability' "$MOCK_LOG"
grep -q 'pull web estimator aggregator postgres caddy' "$MOCK_LOG"
grep -q 'stop -t 60 aggregator' "$MOCK_LOG"
# Pull first, stop imports before database replacement, and start the full stack
# only after initialization. No optional profile should exclude the worker.
pull_line=$(grep -n 'pull web estimator aggregator postgres caddy' "$MOCK_LOG" | cut -d: -f1)
stop_line=$(grep -n 'stop -t 60 aggregator' "$MOCK_LOG" | cut -d: -f1)
postgres_line=$(grep -n 'up -d.*120 postgres' "$MOCK_LOG" | cut -d: -f1)
setup_line=$(grep -n 'db:immutability' "$MOCK_LOG" | cut -d: -f1)
stack_line=$(grep -n 'up -d.*180$' "$MOCK_LOG" | cut -d: -f1)
test "$pull_line" -lt "$stop_line"
test "$stop_line" -lt "$postgres_line"
test "$setup_line" -lt "$stack_line"
! grep -q -- '--profile' "$MOCK_LOG"
! grep -Eq 'db:seed|db:reset|accept-data-loss' "$MOCK_LOG"
refuse true
: > "$MOCK_LOG"
deploy false
! grep -q 'db:push' "$MOCK_LOG"
grep -q 'stop -t 60 aggregator' "$MOCK_LOG"
echo 'changed schema' >> "$release/prisma/schema.prisma"
refuse false
grep -q 'Schema changed' "$root/output"

fixture unhealthy
export MOCK_FAIL_UP=true
refuse true
test ! -e "$root/web"
test -f "$root/schema.sha256"
export MOCK_FAIL_UP=false
deploy false

fixture public-check-failure
export MOCK_FAIL_CURL=true
refuse true
test ! -e "$root/web"
export MOCK_FAIL_CURL=false

fixture mutable-image
echo 'WEB_IMAGE=ghcr.io/rubinjo/example:latest' > "$release/.release.env"
refuse true
test ! -s "$MOCK_LOG"

fixture transferred-env
rm "$root/.env.production"
cat > "$root/expected" <<'EOF'
APP_DOMAIN=zelf-wonen.online
SPECIAL='spaces $dollar #hash "quotes" $(touch should-not-exist)'
MULTILINE='first line
second line'
EOF
sed 's/$/\r/' "$root/expected" | deploy true --env-stdin
cmp "$root/expected" "$root/.env.production"
test "$(stat -c %a "$root/.env.production")" == 600
test ! -e "$release/should-not-exist"
! compgen -G "$root/.env.production.*" > /dev/null
! grep -q 'SPECIAL=' "$root/output" "$MOCK_LOG"

fixture empty-transfer
cp "$root/.env.production" "$root/original"
refuse true --env-stdin < /dev/null
cmp "$root/original" "$root/.env.production"
! compgen -G "$root/.env.production.*" > /dev/null

fixture forbidden-transfer
cp "$root/.env.production" "$root/original"
printf 'VPS_PASSWORD=secret-do-not-log\n' | refuse true --env-stdin
cmp "$root/original" "$root/.env.production"
! grep -q 'secret-do-not-log' "$root/output"
! compgen -G "$root/.env.production.*" > /dev/null

fixture invalid-config
cp "$root/.env.production" "$root/original"
export MOCK_FAIL_CONFIG=true
printf 'INVALID=configuration\n' | refuse true --env-stdin
cmp "$root/original" "$root/.env.production"
! grep -q 'parser-error-containing-a-secret' "$root/output"
! compgen -G "$root/.env.production.*" > /dev/null
export MOCK_FAIL_CONFIG=false

fixture failed-pull
cp "$root/.env.production" "$root/original"
export MOCK_FAIL_PULL=true
printf 'APP_DOMAIN=zelf-wonen.online\nUPDATED=true\n' | refuse true --env-stdin
cmp "$root/original" "$root/.env.production"
! compgen -G "$root/.env.production.*" > /dev/null
export MOCK_FAIL_PULL=false
! grep -q 'stop -t 60 aggregator' "$MOCK_LOG"

fixture legacy-storage
cp "$root/.env.production" "$root/original"
export MOCK_VOLUMES=zelfwonen-production_houser_postgres_data
printf 'APP_DOMAIN=zelf-wonen.online\nUPDATED=true\n' | refuse true --env-stdin
cmp "$root/original" "$root/.env.production"
! grep -q 'up -d' "$MOCK_LOG"
grep -q 'Legacy PostgreSQL storage found' "$root/output"
export MOCK_VOLUMES=

echo 'Deployment safety checks passed.'
