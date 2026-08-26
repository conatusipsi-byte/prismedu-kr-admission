#!/usr/bin/env bash
# db.sh — run the Supabase CLI for THIS repo using the token in .env.local.
# Usage: ./db.sh <supabase args>     e.g.  ./db.sh db push     ./db.sh functions deploy myfn
# SUPABASE_ACCESS_TOKEN is exported from .env.local and read by the Supabase CLI
# from the environment. Never echoed nor passed as an argument.
# If SUPABASE_PROJECT_REF is set in .env.local it is appended as --project-ref.
set -euo pipefail
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
[[ -f .env.local ]] || { echo "db.sh: .env.local not found in $(pwd)" >&2; exit 1; }
set -a; source ./.env.local; set +a
: "${SUPABASE_ACCESS_TOKEN:?db.sh: SUPABASE_ACCESS_TOKEN is not set in .env.local}"
if [[ $# -eq 0 ]]; then
  echo "db.sh: usage: ./db.sh <supabase command> [args]   e.g. ./db.sh db push" >&2
  exit 2
fi
ref_args=()
if [[ -n "${SUPABASE_PROJECT_REF:-}" ]]; then
  ref_args+=(--project-ref "$SUPABASE_PROJECT_REF")
fi
echo "db.sh: running 'supabase $*' (access token loaded from .env.local; not shown)"
exec supabase "$@" "${ref_args[@]}"
