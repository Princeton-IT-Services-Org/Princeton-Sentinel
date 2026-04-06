#!/usr/bin/env bash

set -euo pipefail

app_name="${1:-}"
expected_image="${2:-}"

if [[ -z "${app_name}" ]]; then
  echo "Usage: show-containerapp-revision.sh <app_name> [expected_image]" >&2
  exit 1
fi

app_state="$(
  az containerapp show \
    --name "${app_name}" \
    --resource-group "${AZ_RESOURCE_GROUP}" \
    --query "[name, properties.latestRevisionName, properties.latestReadyRevisionName, properties.template.containers[0].image, properties.configuration.ingress.fqdn]" \
    --output tsv
)"
IFS=$'\t' read -r resolved_app_name latest_revision ready_revision image fqdn <<< "${app_state}"

image_matches_expected=false
if [[ -n "${expected_image}" && "${image}" == "${expected_image}" ]]; then
  image_matches_expected=true
fi

if [[ -n "${GITHUB_OUTPUT:-}" ]]; then
  {
    echo "app_name=${resolved_app_name}"
    echo "latest_revision=${latest_revision}"
    echo "ready_revision=${ready_revision}"
    echo "image=${image}"
    echo "expected_image=${expected_image}"
    echo "fqdn=${fqdn}"
    echo "image_matches_expected=${image_matches_expected}"
  } >> "${GITHUB_OUTPUT}"
fi

az containerapp show \
  --name "${app_name}" \
  --resource-group "${AZ_RESOURCE_GROUP}" \
  --query "{app:name,latestRevision:properties.latestRevisionName,readyRevision:properties.latestReadyRevisionName,image:properties.template.containers[0].image,ingressFqdn:properties.configuration.ingress.fqdn}" \
  --output table
