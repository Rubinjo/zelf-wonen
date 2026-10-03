#!/usr/bin/env bash
# Validate the actual production worker configuration without starting containers.
set -euo pipefail
source_web=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
scratch=$(mktemp -d)
trap 'rm -rf -- "$scratch"' EXIT
cat > "$scratch/.env.production" <<'EOF'
APP_DOMAIN=example.test
POSTGRES_PASSWORD=test-only
BETTER_AUTH_SECRET=test-only
IP_HASH_SALT=test-only
ML_ESTIMATOR_TOKEN=test-only
EOF
# The web service resolves env_file relative to the Compose project directory.
APP_ENV_FILE="$scratch/.env.production" docker compose \
  --env-file "$scratch/.env.production" -f "$source_web/compose.yaml" \
  config --format json > "$scratch/compose.json"
python3 - "$scratch/compose.json" <<'PY'
import json
import sys

with open(sys.argv[1], encoding="utf-8") as config_file:
    config = json.load(config_file)
worker = config["services"]["aggregator"]
assert not worker.get("profiles"), "Daily imports must start without an optional profile"
assert worker["command"] == ["run"]
assert worker["restart"] == "unless-stopped"
assert worker["environment"]["AGGREGATOR_SYNC_INTERVAL_SECONDS"] == "86400"
assert worker["depends_on"]["postgres"]["condition"] == "service_healthy"
assert worker["depends_on"]["web"]["condition"] == "service_healthy"
assert set(worker["networks"]) == {"backend", "outbound"}
assert any(volume["target"] == "/app/state" for volume in worker["volumes"])
print("Production daily import configuration verified.")
PY
