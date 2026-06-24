#!/usr/bin/env bash
# caldo installer — fresh pod → playable evolving town with LLM-voiced NPCs, in one command.
# Builds the app, ensures Ollama + a chat model, and serves both (app + Ollama proxy) on ONE port.
# Coexists with Puglit's Ollama: it does NOT restart a running ollama, and proxies server-side (no CORS).
#
#   bash setup.sh            # default port 4321, model qwen2.5:7b
#   PORT=8080 CALDO_MODEL=llama3.2:3b bash setup.sh
set -u

PORT="${PORT:-4321}"
MODEL="${CALDO_MODEL:-qwen2.5:7b}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

g(){ printf "\n\033[1;32m▶ %s\033[0m\n" "$1"; }
y(){ printf "\033[1;33m  %s\033[0m\n" "$1"; }

# ── 1) Node 18+ ──
g "Node"
if ! command -v node >/dev/null 2>&1 || [ "$(node -v 2>/dev/null | sed 's/v//;s/\..*//')" -lt 18 ]; then
  y "instalando Node 20…"
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash - >/dev/null 2>&1 && apt-get install -y nodejs >/dev/null 2>&1 || y "instalá Node 18+ a mano y reintentá"
fi
echo "  $(node -v 2>/dev/null) · npm $(npm -v 2>/dev/null)"

# ── 2) build caldo ──
g "Dependencias + build"
npm install --no-audit --no-fund >/tmp/caldo-install.log 2>&1 && echo "  deps ok" || { y "falló npm install (ver /tmp/caldo-install.log)"; exit 1; }
npm run build >/tmp/caldo-build.log 2>&1 && echo "  dist/ listo" || { y "falló el build (ver /tmp/caldo-build.log)"; exit 1; }

# ── 3) Ollama + chat model (server-side proxy → no CORS, no restart of a running Ollama) ──
g "Ollama"
if ! command -v ollama >/dev/null 2>&1; then
  y "instalando Ollama…"; curl -fsSL https://ollama.com/install.sh | sh >/dev/null 2>&1 || y "instalá Ollama a mano"
fi
MODELS_DIR="$HOME/.ollama"; [ -d /workspace ] && MODELS_DIR="/workspace/.ollama"
if ! pgrep -f "ollama serve" >/dev/null 2>&1; then
  y "arrancando ollama serve…"
  OLLAMA_MODELS="$MODELS_DIR" nohup ollama serve >/tmp/caldo-ollama.log 2>&1 &
  sleep 4
else
  echo "  ollama ya corriendo (no lo toco)"
fi
g "Bajando el modelo de chat: $MODEL  (puede tardar la primera vez)"
OLLAMA_MODELS="$MODELS_DIR" ollama pull "$MODEL" >/dev/null 2>&1 && echo "  $MODEL listo" || y "no se pudo bajar $MODEL — elegí otro en ⚙ (ej llama3.2:3b)"

# ── 4) serve caldo + ollama proxy on one port ──
g "Sirviendo"
pkill -f "serve.mjs" 2>/dev/null || true
PORT="$PORT" nohup node serve.mjs >/tmp/caldo-serve.log 2>&1 &
sleep 2

POD="${RUNPOD_POD_ID:-<TU-POD>}"
URL="https://${POD}-${PORT}.proxy.runpod.net"
printf "\n\033[1;32m✅ caldo corriendo\033[0m\n"
printf "  1) Exponé el puerto \033[1m%s\033[0m en RunPod (Edit Pod → HTTP Ports → %s)\n" "$PORT" "$PORT"
printf "  2) Abrí:   \033[1m%s\033[0m\n" "$URL"
printf "  3) Voz IA: en ⚙ poné  URL = \033[1m%s/ollama\033[0m  ·  Modelo = \033[1m%s\033[0m  → probar → guardar\n" "$URL" "$MODEL"
printf "     (sin eso igual juega con la voz simple)\n\n"
printf "  logs:  tail -f /tmp/caldo-serve.log  ·  /tmp/caldo-ollama.log\n"
printf "  parar: pkill -f serve.mjs\n"
