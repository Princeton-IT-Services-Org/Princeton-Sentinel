#!/usr/bin/env bash

set -euo pipefail

event_name="${1:-}"
before_sha="${2:-}"

if [[ -z "${event_name}" ]]; then
  echo "Usage: detect-staging-targets.sh <event_name> [before_sha]" >&2
  exit 1
fi

if [[ -z "${GITHUB_OUTPUT:-}" ]]; then
  echo "GITHUB_OUTPUT is required" >&2
  exit 1
fi

deploy_web=false
deploy_worker=false
any=false
db_sql_changed=false
reason=""
changed_paths=""

if [[ "${event_name}" == "workflow_dispatch" ]]; then
  deploy_web=true
  deploy_worker=true
  any=true
  reason="workflow_dispatch"
  changed_paths="workflow_dispatch"
else
  if [[ -z "${before_sha}" || "${before_sha}" == "0000000000000000000000000000000000000000" ]]; then
    deploy_web=true
    deploy_worker=true
    any=true
    reason="no before SHA available; defaulting to full deploy"
    changed_paths="unknown"
  elif ! git cat-file -e "${before_sha}^{commit}" 2>/dev/null; then
    deploy_web=true
    deploy_worker=true
    any=true
    reason="before SHA missing locally; defaulting to full deploy"
    changed_paths="unknown"
  else
    while IFS= read -r path; do
      if [[ -z "${path}" ]]; then
        continue
      fi

      if [[ "${path}" == web/* ]]; then
        deploy_web=true
      fi

      if [[ "${path}" == worker/* ]]; then
        deploy_worker=true
      fi

      if [[ "${path}" =~ ^db/.+\.sql$ ]]; then
        db_sql_changed=true
      fi

      if [[ -z "${changed_paths}" ]]; then
        changed_paths="${path}"
      else
        changed_paths="${changed_paths},${path}"
      fi
    done < <(git diff --name-only "${before_sha}" "${GITHUB_SHA}")

    if [[ "${deploy_web}" == "true" || "${deploy_worker}" == "true" ]]; then
      any=true
    fi

    reason="deploy_web=${deploy_web} deploy_worker=${deploy_worker} for diff ${before_sha}..${GITHUB_SHA}"
  fi
fi

{
  echo "deploy_web=${deploy_web}"
  echo "deploy_worker=${deploy_worker}"
  echo "any=${any}"
  echo "db_sql_changed=${db_sql_changed}"
  echo "reason=${reason}"
  echo "changed_paths=${changed_paths}"
} >> "${GITHUB_OUTPUT}"
