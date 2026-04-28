#!/usr/bin/env bash
# ----------------------------------------------------------------------------
#  Casinoo  —  Setup macOS
#
#  Pendant local du WinSETUP.bat. Trois modes :
#    1) Local        : serveur + client en 2 onglets de Terminal
#    2) Host+tunnel  : serveur + client + Cloudflare Tunnel public (3 onglets)
#    3) Guest        : client seul, vers l'URL d'un hôte distant
# ----------------------------------------------------------------------------

set -euo pipefail

# ---------- Couleurs / helpers d'affichage -----------------------------------
if [[ -t 1 ]]; then
  BOLD="$(tput bold)"; DIM="$(tput dim)"; RESET="$(tput sgr0)"
  RED="$(tput setaf 1)"; GREEN="$(tput setaf 2)"; YELLOW="$(tput setaf 3)"
  BLUE="$(tput setaf 4)"; MAGENTA="$(tput setaf 5)"; CYAN="$(tput setaf 6)"
else
  BOLD=""; DIM=""; RESET=""; RED=""; GREEN=""; YELLOW=""; BLUE=""; MAGENTA=""; CYAN=""
fi

ok()    { echo "  ${GREEN}✔${RESET} $*"; }
info()  { echo "  ${CYAN}›${RESET} $*"; }
skip()  { echo "  ${DIM}↷ $*${RESET}"; }
warn()  { echo "  ${YELLOW}!${RESET} $*"; }
err()   { echo "  ${RED}✘${RESET} $*" >&2; }

hr() {
  echo "${DIM}───────────────────────────────────────────────────${RESET}"
}

step() {
  echo
  echo "${BOLD}${BLUE}$1${RESET}  ${DIM}$2${RESET}"
  hr
}

banner() {
  echo
  echo "${BOLD}${MAGENTA}╔═════════════════════════════════════════════════╗${RESET}"
  echo "${BOLD}${MAGENTA}║${RESET}            ${BOLD}Casinoo  —  Setup macOS${RESET}             ${BOLD}${MAGENTA}║${RESET}"
  echo "${BOLD}${MAGENTA}╚═════════════════════════════════════════════════╝${RESET}"
}

die() { err "$*"; exit 1; }

# ---------- Ancrage du workspace --------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# ---------- Ouvre une commande dans un nouvel onglet de Terminal -------------
# Si iTerm est installé et lancé, on l'utilise — sinon Terminal.app par défaut.
open_in_new_tab() {
  local title="$1"
  local workdir="$2"
  local cmd="$3"

  # Echappe les apostrophes pour AppleScript.
  local esc_workdir="${workdir//\'/\'\\\'\'}"
  local esc_cmd="${cmd//\'/\'\\\'\'}"

  if pgrep -x "iTerm2" >/dev/null 2>&1 || [[ -d "/Applications/iTerm.app" ]]; then
    osascript <<APPLESCRIPT >/dev/null
tell application "iTerm"
  activate
  if (count of windows) = 0 then
    create window with default profile
  end if
  tell current window
    create tab with default profile
    tell current session
      set name to "$title"
      write text "cd '$esc_workdir' && clear && printf '\\033]0;$title\\007' && $esc_cmd"
    end tell
  end tell
end tell
APPLESCRIPT
  else
    osascript <<APPLESCRIPT >/dev/null
tell application "Terminal"
  activate
  do script "cd '$esc_workdir' && clear && printf '\\033]0;$title\\007' && $esc_cmd"
end tell
APPLESCRIPT
  fi
}

# ============================================================================
banner

# ---------- 0) Prérequis -----------------------------------------------------
step "0/3" "Vérification des prérequis"

if ! command -v node >/dev/null 2>&1; then
  err "Node.js introuvable."
  echo "       Installe-le via ${BOLD}https://nodejs.org${RESET} ou ${BOLD}brew install node${RESET}."
  exit 1
fi
if ! command -v npm >/dev/null 2>&1; then
  die "npm introuvable. Réinstalle Node.js."
fi

ok "Node.js $(node --version) détecté."
ok "npm $(npm --version) détecté."

# ---------- 1) Dépendances ---------------------------------------------------
step "1/3" "Installation des dépendances"

if [[ ! -d "server/node_modules" ]]; then
  info "server: npm install …"
  ( cd server && npm install ) || die "npm install a échoué côté serveur."
  ok "server: dépendances installées."
else
  skip "server/node_modules déjà présent."
fi

if [[ ! -d "client/node_modules" ]]; then
  info "client: npm install …"
  ( cd client && npm install ) || die "npm install a échoué côté client."
  ok "client: dépendances installées."
else
  skip "client/node_modules déjà présent."
fi

# ---------- 2) Fichiers .env -------------------------------------------------
step "2/3" "Fichiers d'environnement (.env)"

if [[ ! -f "server/.env" ]]; then
  cp "server/.env.example" "server/.env"
  ok "server/.env créé depuis .env.example"
else
  skip "server/.env existe déjà."
fi

if [[ ! -f "client/.env" ]]; then
  cp "client/.env.example" "client/.env"
  ok "client/.env créé depuis .env.example"
else
  skip "client/.env existe déjà."
fi

# ---------- 3) Mode de démarrage --------------------------------------------
step "3/3" "Mode de démarrage"

cat <<MENU

   ${BOLD}[1]${RESET} Local             ${DIM}— serveur + client (1 Mac, 2 onglets)${RESET}
   ${BOLD}[2]${RESET} Host + tunnel     ${DIM}— server + client + Cloudflare Tunnel public${RESET}
   ${BOLD}[3]${RESET} Guest             ${DIM}— rejoindre l'hôte d'un ami (client seul)${RESET}
   ${BOLD}[4]${RESET} Stop all          ${DIM}— tuer ce qui tourne sur :3001 / :5173 + tunnel${RESET}
   ${BOLD}[5]${RESET} Quitter           ${DIM}— ne rien démarrer${RESET}

MENU

read -r -p "  Choix [1-5] : " mode
echo

case "$mode" in
  # ===== MODE 1 : Local ======================================================
  1)
    info "Lancement du serveur sur ${BOLD}http://localhost:3001${RESET} …"
    open_in_new_tab "Casinoo – Server" "$SCRIPT_DIR/server" "npm run dev"
    sleep 2
    info "Lancement du client  sur ${BOLD}http://localhost:5173${RESET} …"
    open_in_new_tab "Casinoo – Client" "$SCRIPT_DIR/client" "npm run dev"
    echo
    ok  "Serveur et client lancés dans des onglets séparés."
    info "Ouvre ${BOLD}http://localhost:5173${RESET} dans ton navigateur."
    ;;

  # ===== MODE 2 : Host + Cloudflare tunnel ===================================
  2)
    info "Vérification de cloudflared …"
    if ! command -v cloudflared >/dev/null 2>&1; then
      warn "cloudflared introuvable."
      if ! command -v brew >/dev/null 2>&1; then
        err "Homebrew (brew) n'est pas installé."
        echo "       Installe-le via ${BOLD}https://brew.sh${RESET} puis relance le script."
        exit 1
      fi
      info "Installation via brew …"
      brew install cloudflared || die "Échec d'installation de cloudflared."
      ok "cloudflared installé."
    else
      ok "cloudflared OK."
    fi

    info "Lancement du serveur sur ${BOLD}http://localhost:3001${RESET} …"
    open_in_new_tab "Casinoo – Server" "$SCRIPT_DIR/server" "npm run dev"
    sleep 2

    info "Lancement du client  sur ${BOLD}http://localhost:5173${RESET} …"
    open_in_new_tab "Casinoo – Client" "$SCRIPT_DIR/client" "npm run dev"
    sleep 1

    info "Lancement du tunnel Cloudflare (URL publique dans l'onglet Tunnel) …"
    open_in_new_tab \
      "Casinoo – Cloudflare Tunnel" \
      "$SCRIPT_DIR" \
      "cloudflared tunnel --url http://localhost:3001 --no-autoupdate"

    echo
    ok "3 onglets lancés : Server, Client, Tunnel."
    echo
    echo "  ${BOLD}À faire :${RESET}"
    echo "  ${DIM}1.${RESET} Dans l'onglet ${BOLD}Cloudflare Tunnel${RESET}, récupère l'URL :"
    echo "       ${CYAN}https://xxxx-xxxx-xxxx.trycloudflare.com${RESET}"
    echo "  ${DIM}2.${RESET} Ton ami la met dans son ${BOLD}client/.env${RESET} :"
    echo "       ${CYAN}VITE_SERVER_URL=https://xxxx-xxxx-xxxx.trycloudflare.com${RESET}"
    echo "       ${DIM}(ou il utilise le mode 3 « Guest » de ce script).${RESET}"
    ;;

  # ===== MODE 3 : Guest ======================================================
  3)
    echo "  Demande à l'hôte son URL Cloudflare"
    echo "  ${DIM}(ex: https://abc-def-123.trycloudflare.com)${RESET}"
    echo
    read -r -p "  URL du serveur distant : " remote_url

    if [[ -z "${remote_url:-}" ]]; then
      die "URL vide, abandon."
    fi

    echo "VITE_SERVER_URL=${remote_url}" > "client/.env"
    ok "client/.env mis à jour : VITE_SERVER_URL=${remote_url}"

    info "Lancement du client uniquement sur ${BOLD}http://localhost:5173${RESET} …"
    open_in_new_tab "Casinoo – Client (guest)" "$SCRIPT_DIR/client" "npm run dev"

    echo
    ok "Client lancé. Ouvre ${BOLD}http://localhost:5173${RESET},"
    info "puis utilise « Rejoindre » avec le code de room donné par l'hôte."
    ;;

  # ===== MODE 4 : Stop all ===================================================
  4)
    info "Recherche des processus à tuer …"

    killed_any=0
    for port in 3001 5173; do
      pids="$(lsof -ti tcp:"$port" 2>/dev/null || true)"
      if [[ -n "$pids" ]]; then
        # shellcheck disable=SC2086
        kill -9 $pids 2>/dev/null || true
        ok  "Port :$port libéré (PID(s): $(echo $pids | tr '\n' ' '))"
        killed_any=1
      else
        skip "Port :$port — rien à tuer."
      fi
    done

    tunnel_pids="$(pgrep -f 'cloudflared tunnel' 2>/dev/null || true)"
    if [[ -n "$tunnel_pids" ]]; then
      # shellcheck disable=SC2086
      kill -9 $tunnel_pids 2>/dev/null || true
      ok  "cloudflared tunnel arrêté (PID(s): $(echo $tunnel_pids | tr '\n' ' '))"
      killed_any=1
    else
      skip "cloudflared tunnel — pas en cours d'exécution."
    fi

    echo
    if [[ "$killed_any" -eq 1 ]]; then
      ok "Tout est nettoyé."
    else
      info "Rien ne tournait. Tu peux relancer un mode."
    fi
    ;;

  # ===== MODE 5 : Quitter ====================================================
  5)
    info "Aucun service démarré. Bye 👋"
    ;;

  *)
    err "Choix invalide : '$mode'."
    exit 1
    ;;
esac

echo
hr
echo "  ${GREEN}${BOLD}Terminé.${RESET}"
echo
