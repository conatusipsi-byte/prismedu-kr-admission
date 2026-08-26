#!/usr/bin/env bash
# deploy.sh — deploy THIS repo to Vercel production using the token in .env.local.
# Usage: ./deploy.sh [extra vercel args]
# VERCEL_TOKEN is exported from .env.local and read by the Vercel CLI from the
# environment. It is never echoed nor passed as an argument.
set -euo pipefail
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
[[ -f .env.local ]] || { echo "deploy.sh: .env.local not found in $(pwd)" >&2; exit 1; }
set -a; source ./.env.local; set +a
: "${VERCEL_TOKEN:?deploy.sh: VERCEL_TOKEN is not set in .env.local}"
echo "deploy.sh: running 'vercel --prod' (token loaded from .env.local; not shown)"
exec vercel --prod "$@"
