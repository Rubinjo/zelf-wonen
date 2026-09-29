#!/usr/bin/env bash
# Exercise deployment safety decisions without contacting Docker or a real VPS.
set -euo pipefail
source_web=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
scratch=$(mktemp -d)
trap 'rm -rf -- "$scratch"' EXIT
mkdir "$scratch/bin"
export PATH="$scratch/bin:$PATH"
export MOCK_TABLES=0 MOCK_FAIL_UP=false MOCK_FAIL_CURL=false

cat > "$scratch/bin/docker" <<'EOF'
#!/usr/bin/env bash
echo "$*" >> "$MOCK_LOG"
if [[ "$*" == *'psql -U houser'* ]]; then
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
deploy() { bash "$release/scripts/deploy-vps.sh" "$1" > "$root/output" 2>&1; }
refuse() {
  if deploy "$1"; then
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
! grep -Eq 'db:seed|db:reset|accept-data-loss' "$MOCK_LOG"
refuse true
: > "$MOCK_LOG"
deploy false
! grep -q 'db:push' "$MOCK_LOG"
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

echo 'Deployment safety checks passed.'
