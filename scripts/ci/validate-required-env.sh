#!/usr/bin/env bash

set -euo pipefail

if [[ $# -eq 0 ]]; then
  echo "Usage: validate-required-env.sh <ENV_VAR> [ENV_VAR...]" >&2
  exit 1
fi

for name in "$@"; do
  if [[ -z "${!name:-}" ]]; then
    echo "Missing required environment variable: ${name}" >&2
    exit 1
  fi
done
