#!/usr/bin/env bash
# Gymmy: one-command local setup without Docker (Linux, macOS, WSL).
#
#   ./scripts/setup.sh            set everything up
#   ./scripts/setup.sh --seed     ...and load a demo gym you can sign in to
#   ./scripts/setup.sh --test     ...and run the backend test suite
#
# Safe to re-run. Override defaults with environment variables:
#   DB_HOST=127.0.0.1 DB_PORT=5432 DB_NAME=gymmy DB_USER=gymmy DB_PASSWORD=gymmy
#   API_PORT=8000 WEB_PORT=3000
#   PG_ADMIN_USER=postgres PG_ADMIN_PASSWORD=...   (only if the script can't get admin access itself)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND="$ROOT/backend"
FRONTEND="$ROOT/frontend"

DB_HOST="${DB_HOST:-127.0.0.1}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-gymmy}"
DB_TEST_NAME="${DB_TEST_NAME:-${DB_NAME}_test}"
DB_USER="${DB_USER:-gymmy}"
DB_PASSWORD="${DB_PASSWORD:-gymmy}"
API_PORT="${API_PORT:-8000}"
WEB_PORT="${WEB_PORT:-3000}"
PG_ADMIN_USER="${PG_ADMIN_USER:-postgres}"

SEED=0; RUN_TESTS=0; SKIP_FRONTEND=0
for arg in "$@"; do
  case "$arg" in
    --seed) SEED=1 ;;
    --test) RUN_TESTS=1 ;;
    --skip-frontend) SKIP_FRONTEND=1 ;;
    -h|--help) sed -n '2,13p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "Unknown option: $arg (try --help)"; exit 2 ;;
  esac
done

if [ -t 1 ]; then B=$'\e[1m'; G=$'\e[32m'; Y=$'\e[33m'; R=$'\e[31m'; D=$'\e[2m'; N=$'\e[0m'; else B= G= Y= R= D= N=; fi
step() { printf "\n${B}==> %s${N}\n" "$*"; }
ok()   { printf "  ${G}✓${N} %s\n" "$*"; }
info() { printf "  ${D}%s${N}\n" "$*"; }
warn() { printf "  ${Y}!${N} %s\n" "$*"; }
die()  { printf "\n${R}✗ %s${N}\n" "$*" >&2; exit 1; }

OS="$(uname -s)"
pkg_hint() {
  case "$1" in
    python) echo "Ubuntu/Debian: sudo apt install python3 python3-venv   macOS: brew install python@3.12" ;;
    node)   echo "Install Node.js 20+ from https://nodejs.org or with nvm (nvm install 22)" ;;
    postgres) echo "Ubuntu/Debian: sudo apt install postgresql   Fedora: sudo dnf install postgresql-server   macOS: brew install postgresql@16 && brew services start postgresql@16" ;;
  esac
}

# --------------------------------------------------------------------------- tools
step "Checking tools"
PYTHON=""
for candidate in python3.14 python3.13 python3.12 python3 python; do
  if command -v "$candidate" >/dev/null 2>&1 &&
     "$candidate" -c 'import sys; sys.exit(0 if sys.version_info >= (3, 12) else 1)' 2>/dev/null; then
    PYTHON="$(command -v "$candidate")"; break
  fi
done
[ -n "$PYTHON" ] || die "Python 3.12 or newer is required. $(pkg_hint python)"
ok "Python $("$PYTHON" -c 'import platform; print(platform.python_version())') ($PYTHON)"

if [ "$SKIP_FRONTEND" = 0 ]; then
  command -v node >/dev/null 2>&1 || die "Node.js is required. $(pkg_hint node)"
  NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
  [ "$NODE_MAJOR" -ge 20 ] || die "Node.js 20+ is required (found $(node -v)). $(pkg_hint node)"
  command -v npm >/dev/null 2>&1 || die "npm is required. $(pkg_hint node)"
  ok "Node $(node -v), npm $(npm -v)"
fi

command -v psql >/dev/null 2>&1 || die "PostgreSQL client (psql) not found. $(pkg_hint postgres)"
ok "$(psql --version)"

# --------------------------------------------------------------------------- postgres
step "PostgreSQL at $DB_HOST:$DB_PORT"
pg_up() { pg_isready -h "$DB_HOST" -p "$DB_PORT" >/dev/null 2>&1; }
if ! pg_up; then
  warn "PostgreSQL isn't answering — trying to start it"
  if [ "$OS" = "Darwin" ] && command -v brew >/dev/null 2>&1; then
    svc="$(brew services list 2>/dev/null | awk '/^postgresql/{print $1; exit}')"
    [ -n "$svc" ] && info "brew services start $svc" && brew services start "$svc" >/dev/null || true
  elif command -v systemctl >/dev/null 2>&1; then
    info "sudo systemctl start postgresql"; sudo systemctl start postgresql || true
  elif command -v service >/dev/null 2>&1; then
    info "sudo service postgresql start"; sudo service postgresql start || true
  fi
  for _ in $(seq 1 15); do pg_up && break; sleep 1; done
  pg_up || die "PostgreSQL is not running on $DB_HOST:$DB_PORT. Start it, or set DB_HOST/DB_PORT. $(pkg_hint postgres)"
fi
ok "server is accepting connections"

as_app() { PGPASSWORD="$DB_PASSWORD" psql -X -q -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -v ON_ERROR_STOP=1 "$@"; }

# Find a way to run admin SQL: password login, local peer auth as 'postgres', or your own
# OS user (Homebrew makes that a superuser).
ADMIN=""
try_admin() {
  case "$1" in
    password) PGPASSWORD="${PG_ADMIN_PASSWORD:-}" psql -X -q -w -h "$DB_HOST" -p "$DB_PORT" -U "$PG_ADMIN_USER" -d postgres -tAc 'select 1' >/dev/null 2>&1 ;;
    peer)
      [ "$OS" != "Darwin" ] || return 1
      command -v sudo >/dev/null 2>&1 && id postgres >/dev/null 2>&1 || return 1
      sudo -u postgres psql -X -q -p "$DB_PORT" -d postgres -tAc 'select 1' >/dev/null 2>&1 ;;
    self) psql -X -q -w -h "$DB_HOST" -p "$DB_PORT" -d postgres -tAc 'select rolsuper from pg_roles where rolname = current_user' 2>/dev/null | grep -q t ;;
  esac
}
admin_sql() {
  case "$ADMIN" in
    password) PGPASSWORD="${PG_ADMIN_PASSWORD:-}" psql -X -q -w -h "$DB_HOST" -p "$DB_PORT" -U "$PG_ADMIN_USER" -v ON_ERROR_STOP=1 "$@" ;;
    peer) sudo -u postgres psql -X -q -p "$DB_PORT" -v ON_ERROR_STOP=1 "$@" ;;
    self) psql -X -q -w -h "$DB_HOST" -p "$DB_PORT" -v ON_ERROR_STOP=1 "$@" ;;
  esac
}

need_admin=0
if as_app -d postgres -tAc 'select 1' >/dev/null 2>&1; then
  ok "login works for database user '$DB_USER'"
  for db in "$DB_NAME" "$DB_TEST_NAME"; do
    as_app -d postgres -tAc "select 1 from pg_database where datname = '$db'" | grep -q 1 || need_admin=1
  done
else
  need_admin=1
fi

if [ "$need_admin" = 1 ]; then
  for method in self password peer; do
    if [ "$method" = peer ] && [ "$OS" != "Darwin" ]; then
      info "Trying sudo -u postgres (you may be asked for your password)"
    fi
    if try_admin "$method"; then ADMIN="$method"; break; fi
  done
  [ -n "$ADMIN" ] || die "Couldn't get admin access to PostgreSQL to create the '$DB_USER' user.
  Re-run with an admin login, e.g.:  PG_ADMIN_USER=postgres PG_ADMIN_PASSWORD=yourpassword ./scripts/setup.sh"
  ok "admin access via $ADMIN"

  admin_sql -d postgres -v u="$DB_USER" -v p="$DB_PASSWORD" <<'SQL'
SELECT format('CREATE ROLE %I LOGIN PASSWORD %L', :'u', :'p')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'u') \gexec
SELECT format('ALTER ROLE %I WITH LOGIN PASSWORD %L', :'u', :'p') \gexec
SQL
  ok "database user '$DB_USER' ready"
  for db in "$DB_NAME" "$DB_TEST_NAME"; do
    admin_sql -d postgres -v d="$db" -v u="$DB_USER" <<'SQL'
SELECT format('CREATE DATABASE %I OWNER %I', :'d', :'u')
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = :'d') \gexec
SQL
    # Tests drop and recreate the public schema, so the app user must own it.
    admin_sql -d "$db" -v u="$DB_USER" <<'SQL'
SELECT format('ALTER SCHEMA public OWNER TO %I', :'u') \gexec
SQL
    ok "database '$db'"
  done
  as_app -d "$DB_NAME" -tAc 'select 1' >/dev/null 2>&1 ||
    die "Created the user, but logging in as '$DB_USER' with a password still fails.
  Check pg_hba.conf allows password (scram-sha-256 or md5) logins for host $DB_HOST."
else
  ok "databases '$DB_NAME' and '$DB_TEST_NAME' exist"
fi

DATABASE_URL="postgresql+psycopg://$DB_USER:$DB_PASSWORD@$DB_HOST:$DB_PORT/$DB_NAME"
TEST_DATABASE_URL="postgresql+psycopg://$DB_USER:$DB_PASSWORD@$DB_HOST:$DB_PORT/$DB_TEST_NAME"

# --------------------------------------------------------------------------- backend
step "Backend (FastAPI)"
cd "$BACKEND"
if [ -x .venv/bin/python ] && ! .venv/bin/python -c 'import sys; sys.exit(0 if sys.version_info >= (3, 12) else 1)' 2>/dev/null; then
  warn "existing .venv uses an old Python — recreating it"; rm -rf .venv
fi
if [ ! -x .venv/bin/python ]; then
  if command -v uv >/dev/null 2>&1; then uv venv -q --python "$PYTHON" .venv
  else "$PYTHON" -m venv .venv || die "Couldn't create a virtualenv. $(pkg_hint python)"; fi
  ok "created backend/.venv"
fi
if command -v uv >/dev/null 2>&1; then
  uv pip install -q --python .venv/bin/python -e ".[dev]"
else
  .venv/bin/python -m pip install -q --upgrade pip
  .venv/bin/python -m pip install -q -e ".[dev]"
fi
ok "Python packages installed"

set_env() {  # set_env FILE KEY VALUE — add or replace KEY=VALUE
  local file="$1" key="$2" value="$3"
  touch "$file"
  if grep -q "^$key=" "$file"; then
    "$PYTHON" - "$file" "$key" "$value" <<'PY'
import sys
path, key, value = sys.argv[1:]
lines = open(path).read().splitlines()
open(path, "w").write("\n".join(f"{key}={value}" if l.startswith(f"{key}=") else l for l in lines) + "\n")
PY
  else
    printf '%s=%s\n' "$key" "$value" >> "$file"
  fi
}
if [ ! -f .env ]; then
  cp .env.example .env
  set_env .env JWT_SECRET "$("$PYTHON" -c 'import secrets; print(secrets.token_urlsafe(48))')"
  ok "created backend/.env with a random JWT secret"
fi
set_env .env DATABASE_URL "$DATABASE_URL"
set_env .env CORS_ORIGINS "http://localhost:$WEB_PORT,http://127.0.0.1:$WEB_PORT"
ok "backend/.env points at $DB_NAME on $DB_HOST:$DB_PORT"

if ! out="$(.venv/bin/alembic upgrade head 2>&1)"; then
  echo "$out"; die "Database migration failed"
fi
echo "$out" | grep -E "Running upgrade" | sed 's/^.*Running/  Running/' || true
ok "database schema up to date"

if [ "$SEED" = 1 ]; then
  if out="$(.venv/bin/python -m app.cli seed-demo 2>&1)"; then ok "demo gym loaded"
  elif echo "$out" | grep -q "already exists"; then ok "demo gym already loaded"
  else echo "$out"; die "Loading the demo gym failed"; fi
fi

# --------------------------------------------------------------------------- frontend
if [ "$SKIP_FRONTEND" = 0 ]; then
  step "Frontend (Next.js)"
  cd "$FRONTEND"
  if [ -f package-lock.json ]; then npm ci --no-audit --no-fund --loglevel=error; else npm install --no-audit --no-fund --loglevel=error; fi
  ok "npm packages installed"
  set_env .env.local API_ORIGIN "http://127.0.0.1:$API_PORT"
  ok "frontend/.env.local proxies /api/v1 to http://127.0.0.1:$API_PORT"
fi

# --------------------------------------------------------------------------- tests
if [ "$RUN_TESTS" = 1 ]; then
  step "Backend tests"
  cd "$BACKEND"
  DATABASE_URL="$TEST_DATABASE_URL" .venv/bin/pytest -q -p no:warnings
fi

step "All set"
cat <<EOF
  Start both servers:   ${B}./scripts/dev.sh${N}
  Then open:            ${B}http://localhost:$WEB_PORT${N}  (click "View demo" to explore)
EOF
[ "$SEED" = 1 ] && echo "  Demo logins:          owner@demo.gym / receptionist@demo.gym, password demo-pass-1"
echo
