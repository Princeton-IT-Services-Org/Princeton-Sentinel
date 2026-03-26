#!/usr/bin/env bash

set -euo pipefail

client_id="${1:-${AZURE_CLIENT_ID:-}}"
tenant_id="${2:-${AZURE_TENANT_ID:-}}"
subscription_id="${3:-${AZURE_SUBSCRIPTION_ID:-}}"
audience="${4:-api://AzureADTokenExchange}"

if [[ -z "${client_id}" || -z "${tenant_id}" || -z "${subscription_id}" ]]; then
  echo "Usage: azure-oidc-login.sh <client_id> <tenant_id> <subscription_id> [audience]" >&2
  exit 1
fi

if [[ -z "${ACTIONS_ID_TOKEN_REQUEST_TOKEN:-}" || -z "${ACTIONS_ID_TOKEN_REQUEST_URL:-}" ]]; then
  echo "GitHub OIDC environment variables are missing; ensure id-token: write is enabled." >&2
  exit 1
fi

oidc_response="$(curl -fsSL --get \
  -H "Authorization: bearer ${ACTIONS_ID_TOKEN_REQUEST_TOKEN}" \
  --data-urlencode "audience=${audience}" \
  "${ACTIONS_ID_TOKEN_REQUEST_URL}")"

federated_token="$(python3 -c 'import json,sys; print(json.load(sys.stdin)["value"])' <<< "${oidc_response}")"

az login \
  --service-principal \
  --username "${client_id}" \
  --tenant "${tenant_id}" \
  --federated-token "${federated_token}" \
  --output none

az account set --subscription "${subscription_id}"

echo "Authenticated to Azure with GitHub OIDC."
az account show \
  --query "{subscriptionId:id, tenantId:tenantId, environment:name, user:user.name}" \
  --output table
