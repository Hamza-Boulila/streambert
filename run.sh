#!/usr/bin/env bash
# ==============================================================================
# Streambert Universal One-Click Launcher
# Supports: macOS, Linux, and Windows (via WSL / Git Bash / MSYS)
# ==============================================================================

set -e

# Change to script directory regardless of where it was launched from
cd "$(dirname "$0")"

# Colors for terminal output
BOLD="\033[1m"
GREEN="\033[0;32m"
CYAN="\033[0;36m"
YELLOW="\033[1;33m"
RED="\033[0;31m"
RESET="\033[0m"

echo -e "${CYAN}${BOLD}"
echo "  ╔══════════════════════════════════════════════════════════════╗"
echo "  ║             STREAMBERT WEB — ONE-CLICK LAUNCHER              ║"
echo "  ║      Self-Hosted Streaming for Movies, TV Shows & Anime      ║"
echo "  ╚══════════════════════════════════════════════════════════════╝"
echo -e "${RESET}"

# Function to open URL in default browser across different OS
open_browser() {
  local url="$1"
  if [[ "$OSTYPE" == "darwin"* ]]; then
    open "$url" >/dev/null 2>&1 &
  elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    if command -v xdg-open >/dev/null 2>&1; then
      xdg-open "$url" >/dev/null 2>&1 &
    elif command -v gnome-open >/dev/null 2>&1; then
      gnome-open "$url" >/dev/null 2>&1 &
    elif command -v sensible-browser >/dev/null 2>&1; then
      sensible-browser "$url" >/dev/null 2>&1 &
    fi
  elif [[ "$OSTYPE" == "msys" || "$OSTYPE" == "cygwin" || "$OSTYPE" == "win32" ]]; then
    start "$url" >/dev/null 2>&1 &
  elif grep -qi microsoft /proc/version 2>/dev/null; then
    # WSL
    cmd.exe /c start "$url" >/dev/null 2>&1 &
  fi
}

# 1. Ensure an environment file exists
if [ ! -f .env ] && [ ! -f .env.local ]; then
  if [ -f .env.example ]; then
    echo -e "${YELLOW}ℹ No .env file found. Creating .env from .env.example...${RESET}"
    cp .env.example .env
  fi
fi

# Detect which env file to use if available
ENV_FLAG=""
if [ -f .env.local ]; then
  ENV_FLAG="--env-file .env.local"
elif [ -f .env ]; then
  ENV_FLAG="--env-file .env"
fi

# 2. Check if Docker is installed and running
DOCKER_AVAILABLE=false
if command -v docker >/dev/null 2>&1; then
  if docker info >/dev/null 2>&1; then
    DOCKER_AVAILABLE=true
  fi
fi

# Determine docker compose command (v2 'docker compose' or v1 'docker-compose')
COMPOSE_CMD=""
if [ "$DOCKER_AVAILABLE" = true ]; then
  if docker compose version >/dev/null 2>&1; then
    COMPOSE_CMD="docker compose"
  elif command -v docker-compose >/dev/null 2>&1; then
    COMPOSE_CMD="docker-compose"
  fi
fi

# 3. Launch via Docker or Node fallback
if [ "$DOCKER_AVAILABLE" = true ] && [ -n "$COMPOSE_CMD" ]; then
  echo -e "${GREEN}✔ Docker is running.${RESET}"
  echo -e "${CYAN}🚀 Starting Streambert container...${RESET}"

  $COMPOSE_CMD $ENV_FLAG up -d --build

  PORT=3000
  APP_URL="http://localhost:${PORT}"

  echo -e "${CYAN}⏳ Waiting for Streambert to be ready...${RESET}"
  READY=false
  for i in {1..30}; do
    if curl -s "http://127.0.0.1:${PORT}/api/health" | grep -q '"status":"ok"'; then
      READY=true
      break
    fi
    sleep 1
  done

  if [ "$READY" = true ]; then
    echo -e "\n${GREEN}${BOLD}✔ Streambert is ready and running!${RESET}"
    echo -e "${BOLD}🌐 Open in browser: ${CYAN}${APP_URL}${RESET}\n"
    open_browser "$APP_URL"
  else
    echo -e "\n${YELLOW}⚠ Container started, but healthcheck took longer than expected.${RESET}"
    echo -e "${BOLD}🌐 Try opening: ${CYAN}${APP_URL}${RESET}\n"
    open_browser "$APP_URL"
  fi

  echo "------------------------------------------------------------------"
  echo " Commands:"
  echo "   - View logs:    $COMPOSE_CMD logs -f"
  echo "   - Stop app:     $COMPOSE_CMD down"
  echo "   - Restart app:  $COMPOSE_CMD restart"
  echo "------------------------------------------------------------------"

else
  # Fallback to local Node.js environment
  echo -e "${YELLOW}ℹ Docker is not running or not installed. Falling back to local Node.js...${RESET}"

  if ! command -v node >/dev/null 2>&1; then
    echo -e "${RED}✖ Error: Neither Docker nor Node.js was found on your system.${RESET}"
    echo "Please install Docker Desktop (https://www.docker.com/) or Node.js (https://nodejs.org/) to run Streambert."
    read -p "Press Enter to exit..."
    exit 1
  fi

  echo -e "${GREEN}✔ Node.js $(node -v) detected.${RESET}"

  if [ ! -d "node_modules" ]; then
    echo -e "${CYAN}📦 Installing dependencies (npm install)...${RESET}"
    npm install
  fi

  if [ ! -d "dist" ]; then
    echo -e "${CYAN}🔨 Building frontend bundle (npm run build)...${RESET}"
    npm run build
  fi

  PORT="${PORT:-3000}"
  APP_URL="http://localhost:${PORT}"

  echo -e "${GREEN}${BOLD}✔ Starting server at ${APP_URL}...${RESET}"
  open_browser "$APP_URL" &
  npm start
fi
