#!/usr/bin/env bash

set -euo pipefail

WEB_FQDN="$(az containerapp show \
  --name "${AZ_WEB_APP_NAME}" \
  --resource-group "${AZ_RESOURCE_GROUP}" \
  --query "properties.configuration.ingress.fqdn" \
  --output tsv)"

WORKER_HEARTBEAT_URL="${STG_WORKER_HEARTBEAT_URL:-https://${WEB_FQDN}/api/internal/worker-heartbeat}"

az containerapp secret set \
  --name "${AZ_WORKER_APP_NAME}" \
  --resource-group "${AZ_RESOURCE_GROUP}" \
  --secrets \
    appinsightsapikey="${STG_APPINSIGHTS_API_KEY}" \
    dburl="${STG_DATABASE_URL}" \
    entrasecret="${STG_ENTRA_CLIENT_SECRET}" \
    workerinternaltoken="${STG_WORKER_INTERNAL_API_TOKEN}" \
    workerheartbeattoken="${STG_WORKER_HEARTBEAT_TOKEN}"

az containerapp update \
  --name "${AZ_WORKER_APP_NAME}" \
  --resource-group "${AZ_RESOURCE_GROUP}" \
  --set-env-vars \
    APP_VERSION="${APP_VERSION}" \
    APPINSIGHTS_APP_ID="${STG_APPINSIGHTS_APP_ID}" \
    APPINSIGHTS_API_KEY=secretref:appinsightsapikey \
    DATABASE_URL=secretref:dburl \
    DATAVERSE_URL="${STG_DATAVERSE_URL}" \
    WORKER_INTERNAL_API_TOKEN=secretref:workerinternaltoken \
    WORKER_HEARTBEAT_TOKEN=secretref:workerheartbeattoken \
    DB_CONNECT_TIMEOUT_SECONDS="${STG_DB_CONNECT_TIMEOUT_SECONDS}" \
    SCHEDULER_POLL_SECONDS="${STG_SCHEDULER_POLL_SECONDS}" \
    ENTRA_TENANT_ID="${STG_ENTRA_TENANT_ID}" \
    ENTRA_CLIENT_ID="${STG_ENTRA_CLIENT_ID}" \
    ENTRA_CLIENT_SECRET=secretref:entrasecret \
    INTERNAL_EMAIL_DOMAINS="${STG_INTERNAL_EMAIL_DOMAINS}" \
    GRAPH_BASE="${STG_GRAPH_BASE}" \
    GRAPH_MAX_CONCURRENCY="${STG_GRAPH_MAX_CONCURRENCY}" \
    GRAPH_MAX_RETRIES="${STG_GRAPH_MAX_RETRIES}" \
    GRAPH_CONNECT_TIMEOUT="${STG_GRAPH_CONNECT_TIMEOUT}" \
    GRAPH_READ_TIMEOUT="${STG_GRAPH_READ_TIMEOUT}" \
    GRAPH_PAGE_SIZE="${STG_GRAPH_PAGE_SIZE}" \
    GRAPH_PERMISSIONS_BATCH_SIZE="${STG_GRAPH_PERMISSIONS_BATCH_SIZE}" \
    GRAPH_PERMISSIONS_STALE_AFTER_HOURS="${STG_GRAPH_PERMISSIONS_STALE_AFTER_HOURS}" \
    FLUSH_EVERY="${STG_FLUSH_EVERY}" \
    LICENSE_PUBLIC_KEY_PATH="${STG_LICENSE_PUBLIC_KEY_PATH}" \
    LICENSE_CACHE_TTL_SECONDS="${STG_LICENSE_CACHE_TTL_SECONDS}" \
    WORKER_HEARTBEAT_URL="${WORKER_HEARTBEAT_URL}"
