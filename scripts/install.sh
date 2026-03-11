#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${BASH_VERSION:-}" ]]; then
  echo "Please run this installer with bash (e.g. curl ... | bash)." >&2
  exit 1
fi

PREFIX="${PREFIX:-/usr/local}"
INSTALL_DIR="${INSTALL_DIR:-$HOME/.local/share/playwright-native-ai-ide}"
REPO_URL="${REPO_URL:-https://github.com/elevate-foundry/ai-native-ide.git}"
BRANCH="${BRANCH:-main}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --prefix)
      PREFIX="$2"
      shift 2
      ;;
    --install-dir)
      INSTALL_DIR="$2"
      shift 2
      ;;
    --repo-url)
      REPO_URL="$2"
      shift 2
      ;;
    --branch)
      BRANCH="$2"
      shift 2
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

if ! command -v git >/dev/null 2>&1; then
  echo "git is required" >&2
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "node is required" >&2
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "npm is required" >&2
  exit 1
fi

echo "Installing Playwright-Native AI IDE..."
echo "  repo: $REPO_URL"
echo "  branch: $BRANCH"
echo "  install dir: $INSTALL_DIR"
echo "  prefix: $PREFIX"

mkdir -p "$(dirname "$INSTALL_DIR")"
if [[ -d "$INSTALL_DIR/.git" ]]; then
  git -C "$INSTALL_DIR" fetch origin "$BRANCH"
  git -C "$INSTALL_DIR" checkout "$BRANCH"
  git -C "$INSTALL_DIR" pull --ff-only origin "$BRANCH"
else
  rm -rf "$INSTALL_DIR"
  git clone --branch "$BRANCH" "$REPO_URL" "$INSTALL_DIR"
fi

cd "$INSTALL_DIR"

echo "Configuring npm maxsockets=10"
npm config set maxsockets 10
npm install

mkdir -p "$PREFIX/bin"
cat > "$PREFIX/bin/ai-native-ide" <<'LAUNCHER'
#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${BASH_VERSION:-}" ]]; then
  echo "Please run this installer with bash (e.g. curl ... | bash)." >&2
  exit 1
fi

INSTALL_DIR="${INSTALL_DIR:-__INSTALL_DIR__}"

if [[ ! -d "$INSTALL_DIR" ]]; then
  echo "Install directory not found: $INSTALL_DIR" >&2
  exit 1
fi

cd "$INSTALL_DIR"

COMMAND="${1:-dev}"
shift || true

case "$COMMAND" in
  dev)
    if command -v tauri >/dev/null 2>&1; then
      npm run tauri:dev -- "$@"
    else
      echo "Tauri CLI not installed; starting web preview at http://127.0.0.1:4173"
      npm run tauri:web -- "$@"
    fi
    ;;
  web)
    npm run tauri:web -- "$@"
    ;;
  test)
    npm test -- "$@"
    ;;
  sockets)
    npm run monitor:sockets -- "$@"
    ;;
  sockets:once)
    npm run monitor:sockets:once -- "$@"
    ;;
  tune)
    npm run npm:maxsockets -- "$@"
    ;;
  *)
    echo "Usage: ai-native-ide [dev|web|test|sockets|sockets:once|tune] [args...]" >&2
    exit 1
    ;;
esac
LAUNCHER

escaped_install_dir=$(printf '%s' "$INSTALL_DIR" | sed 's/[\/&]/\\&/g')
launcher_tmp="$(mktemp)"
sed "s/__INSTALL_DIR__/${escaped_install_dir}/g" "$PREFIX/bin/ai-native-ide" > "$launcher_tmp"
cat "$launcher_tmp" > "$PREFIX/bin/ai-native-ide"
rm -f "$launcher_tmp"
chmod +x "$PREFIX/bin/ai-native-ide"

echo "Done."
echo "Run: ai-native-ide dev"
