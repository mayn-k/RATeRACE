#!/usr/bin/env bash
set -e

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND="$ROOT/backend"
LOG_DIR="$ROOT/.logs"
BACKEND_PORT=3000
FRONTEND_PORT=8000

# ── colours ──────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
info()    { echo -e "${CYAN}[raterace]${NC} $*"; }
success() { echo -e "${GREEN}[raterace]${NC} $*"; }
warn()    { echo -e "${YELLOW}[raterace]${NC} $*"; }
error()   { echo -e "${RED}[raterace]${NC} $*"; }

# ── nvm / node ────────────────────────────────────────────────────────────────
export NVM_DIR="$HOME/.nvm"
# shellcheck disable=SC1091
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

if ! command -v node &>/dev/null; then
  error "Node.js not found. Install via nvm: https://github.com/nvm-sh/nvm"
  exit 1
fi

# ── .env check ────────────────────────────────────────────────────────────────
if [ ! -f "$BACKEND/.env" ]; then
  error "backend/.env not found. Copy backend/.env.example and fill in the values."
  exit 1
fi

REQUIRED_VARS=(MONGODB_URI JWT_SECRET ADMIN_SECRET GEMINI_API_KEY CLOUDINARY_CLOUD_NAME CLOUDINARY_API_KEY CLOUDINARY_API_SECRET)
MISSING=()
for var in "${REQUIRED_VARS[@]}"; do
  val=$(grep "^${var}=" "$BACKEND/.env" | cut -d= -f2- | tr -d '"' | tr -d "'")
  [ -z "$val" ] && MISSING+=("$var")
done
if [ ${#MISSING[@]} -gt 0 ]; then
  error "Missing required env vars in backend/.env:"
  for v in "${MISSING[@]}"; do echo "  - $v"; done
  exit 1
fi

# ── kill anything on our ports ────────────────────────────────────────────────
for port in $BACKEND_PORT $FRONTEND_PORT; do
  pid=$(lsof -ti tcp:"$port" 2>/dev/null || true)
  if [ -n "$pid" ]; then
    warn "Port $port in use (PID $pid) — stopping it."
    kill "$pid" 2>/dev/null || true
    sleep 0.5
  fi
done

# ── install deps if needed ────────────────────────────────────────────────────
if [ ! -d "$BACKEND/node_modules" ]; then
  info "Installing backend dependencies…"
  (cd "$BACKEND" && npm install --silent)
fi

# ── log directory ─────────────────────────────────────────────────────────────
mkdir -p "$LOG_DIR"

# ── start backend ─────────────────────────────────────────────────────────────
info "Starting backend on port $BACKEND_PORT…"
(cd "$BACKEND" && npm start >> "$LOG_DIR/backend.log" 2>&1) &
BACKEND_PID=$!

# wait up to 15 s for the backend to be ready
READY=0
for i in $(seq 1 15); do
  sleep 1
  if curl -sf "http://localhost:$BACKEND_PORT/healthz" &>/dev/null; then
    READY=1; break
  fi
done

if [ $READY -ne 1 ]; then
  error "Backend failed to start. Check .logs/backend.log for details."
  kill "$BACKEND_PID" 2>/dev/null || true
  exit 1
fi
success "Backend ready  → http://localhost:$BACKEND_PORT"

# ── start frontend ────────────────────────────────────────────────────────────
info "Starting frontend on port $FRONTEND_PORT…"
python3 -m http.server "$FRONTEND_PORT" --directory "$ROOT" >> "$LOG_DIR/frontend.log" 2>&1 &
FRONTEND_PID=$!
sleep 1
success "Frontend ready → http://localhost:$FRONTEND_PORT"

# ── open browser (best-effort) ────────────────────────────────────────────────
if command -v xdg-open &>/dev/null; then
  xdg-open "http://localhost:$FRONTEND_PORT" &>/dev/null &
elif command -v open &>/dev/null; then
  open "http://localhost:$FRONTEND_PORT" &>/dev/null &
fi

echo ""
echo -e "  ${GREEN}✔ Both servers are running.${NC}"
echo -e "  Frontend : ${CYAN}http://localhost:$FRONTEND_PORT${NC}"
echo -e "  Backend  : ${CYAN}http://localhost:$BACKEND_PORT${NC}"
echo -e "  Logs     : ${CYAN}$LOG_DIR/${NC}"
echo ""
echo "  Press Ctrl+C to stop both servers."
echo ""

# ── trap Ctrl-C ───────────────────────────────────────────────────────────────
cleanup() {
  echo ""
  info "Shutting down…"
  kill "$BACKEND_PID" "$FRONTEND_PID" 2>/dev/null || true
  success "Done."
}
trap cleanup INT TERM

# keep the script alive so Ctrl-C works
wait
