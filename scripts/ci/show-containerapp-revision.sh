#!/usr/bin/env bash

set -euo pipefail

app_name="${1:-}"

if [[ -z "${app_name}" ]]; then
  echo "Usage: show-containerapp-revision.sh <app_name>" >&2
  exit 1
fi

az containerapp show \
  --name "${app_name}" \
  --resource-group "${AZ_RESOURCE_GROUP}" \
  --query "{app:name,latestRevision:properties.latestRevisionName}" \
  --output table
