#!/usr/bin/env bash

set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "${script_dir}/../.." && pwd)"

standalone_dir="${repo_root}/web/.next/standalone"
static_dir="${repo_root}/web/.next/static"
public_dir="${repo_root}/web/public"
runtime_dir="${repo_root}/.dist/web-runtime"

if [[ ! -f "${standalone_dir}/server.js" ]]; then
  echo "Missing standalone server output at ${standalone_dir}/server.js" >&2
  exit 1
fi

if [[ ! -d "${static_dir}" ]]; then
  echo "Missing Next static output at ${static_dir}" >&2
  exit 1
fi

rm -rf "${runtime_dir}"
mkdir -p "${runtime_dir}/.next"

cp -R "${standalone_dir}/." "${runtime_dir}/"
cp -R "${static_dir}" "${runtime_dir}/.next/static"

if [[ -d "${public_dir}" ]]; then
  cp -R "${public_dir}" "${runtime_dir}/public"
fi

cat > "${runtime_dir}/Dockerfile" <<'EOF'
FROM node:24-alpine

WORKDIR /app

ENV HOSTNAME=0.0.0.0
ENV PORT=3000

COPY . ./

EXPOSE 3000

CMD ["node", "server.js"]
EOF

if [[ ! -f "${runtime_dir}/server.js" ]]; then
  echo "Packaged web runtime is missing server.js" >&2
  exit 1
fi

if [[ ! -d "${runtime_dir}/.next/static" ]]; then
  echo "Packaged web runtime is missing .next/static" >&2
  exit 1
fi

if [[ ! -d "${runtime_dir}/public" ]]; then
  echo "Packaged web runtime is missing public assets" >&2
  exit 1
fi

for disallowed_dir in app components tests; do
  if [[ -e "${runtime_dir}/${disallowed_dir}" ]]; then
    echo "Packaged web runtime should not include ${disallowed_dir}/" >&2
    exit 1
  fi
done

echo "Packaged web runtime at ${runtime_dir}"
