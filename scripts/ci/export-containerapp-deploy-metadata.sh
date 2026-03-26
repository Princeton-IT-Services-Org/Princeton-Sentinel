#!/usr/bin/env bash

set -euo pipefail

app_name="${1:-}"

if [[ -z "${app_name}" ]]; then
  echo "Usage: export-containerapp-deploy-metadata.sh <app_name>" >&2
  exit 1
fi

if [[ -z "${GITHUB_OUTPUT:-}" ]]; then
  echo "GITHUB_OUTPUT is required" >&2
  exit 1
fi

app_json="$(az containerapp show \
  --name "${app_name}" \
  --resource-group "${AZ_RESOURCE_GROUP}" \
  --output json)"

APP_JSON="${app_json}" python3 - "${GITHUB_OUTPUT}" <<'PY'
import json
import os
import sys

output_path = sys.argv[1]
payload = json.loads(os.environ["APP_JSON"])

name = payload.get("name", "")
properties = payload.get("properties") or {}
config = properties.get("configuration") or {}
ingress = config.get("ingress") or {}
template = properties.get("template") or {}
containers = template.get("containers") or []

revision = properties.get("latestRevisionName") or ""
fqdn = ingress.get("fqdn") or ""
url = f"https://{fqdn}" if fqdn else ""
image = ""
if containers:
    image = containers[0].get("image") or ""

with open(output_path, "a", encoding="utf-8") as fh:
    fh.write(f"app_name={name}\n")
    fh.write(f"revision={revision}\n")
    fh.write(f"fqdn={fqdn}\n")
    fh.write(f"url={url}\n")
    fh.write(f"image={image}\n")
PY
