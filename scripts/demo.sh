#!/usr/bin/env bash
# Try Gymmy with nothing but Python 3.12+ and Node 20+ installed: no PostgreSQL, no Docker.
# Sets up a local SQLite database with a demo gym, then starts the app.
#
#   ./scripts/demo.sh
#
# Then open http://localhost:3000 and click "View demo"
# (or sign in as owner@demo.gym / demo-pass-1).
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
"$ROOT/scripts/setup.sh" --sqlite --seed
exec "$ROOT/scripts/dev.sh"
