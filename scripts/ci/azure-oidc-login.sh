#!/usr/bin/env bash

set -euo pipefail

: "${AZURE_CLIENT_ID:?AZURE_CLIENT_ID is required}"
: "${AZURE_TENANT_ID:?AZURE_TENANT_ID is required}"
: "${AZURE_SUBSCRIPTION_ID:?AZURE_SUBSCRIPTION_ID is required}"
: "${ACTIONS_ID_TOKEN_REQUEST_URL:?ACTIONS_ID_TOKEN_REQUEST_URL is required}"
: "${ACTIONS_ID_TOKEN_REQUEST_TOKEN:?ACTIONS_ID_TOKEN_REQUEST_TOKEN is required}"

audience="${AZURE_OIDC_AUDIENCE:-api://AzureADTokenExchange}"

request_url="$(python3 - "${ACTIONS_ID_TOKEN_REQUEST_URL}" "${audience}" <<'PY'
import sys
import urllib.parse

base_url = sys.argv[1]
audience = sys.argv[2]
separator = "&" if "?" in base_url else "?"

print(f"{base_url}{separator}audience={urllib.parse.quote(audience, safe='')}")
PY
)"

oidc_response="$(curl --fail --silent --show-error \
  -H "Authorization: bearer ${ACTIONS_ID_TOKEN_REQUEST_TOKEN}" \
  "${request_url}")"

oidc_token="$(python3 -c 'import json, sys; print(json.load(sys.stdin)["value"])' <<<"${oidc_response}")"

if [[ -z "${oidc_token}" ]]; then
  echo "Failed to obtain a GitHub OIDC token for Azure login." >&2
  exit 1
fi

az login \
  --service-principal \
  --username "${AZURE_CLIENT_ID}" \
  --tenant "${AZURE_TENANT_ID}" \
  --federated-token "${oidc_token}" \
  --output none

az account set --subscription "${AZURE_SUBSCRIPTION_ID}"

echo "Azure CLI login succeeded for subscription ${AZURE_SUBSCRIPTION_ID}."
