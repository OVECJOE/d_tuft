#!/usr/bin/env bash
set -euo pipefail

# ============= CONFIG =============

GITHUB_USER="OVECJOE"
GITHUB_REPO="d_tuft"
TOOL_NAME="d_tuft" # pronounced as D-TUF
INSTALL_DIR="/usr/local/bin"

REPO_URL="https://github.com/${GITHUB_USER}/${GITHUB_REPO}"
RAW_URL="https://raw.githubusercontent.com/${GITHUB_USER}/${GITHUB_REPO}/main"

# ============= HELPERS ==============

info() { printf "\033[0;34m[INFO]\033[0m %s\n" "$*"; }
success() { printf "\033[0;32m[OK]\033[0m %s\n" "$*"; }
warn() { printf "\033[0;33m[WARN]\033[0m %s\n" "$*"; }
die() { printf "\033[0;31m[ERROR]\033[0m %s\n" "$*"; }

# ============= SYSTEM CHECKS ============

info "Checking system requirements..."

OS="$(uname -s)"
case "$OS" in
  Linux|Darwin) ;;
  *) die "Unsupported OS: $OS. Only Linux and macOS are supported." ;;
esac

ARCH="$(uname -m)"
case "$ARCH" in
  x86_64|amd64) BUN_ARCH="x64" ;;
  arm64|aarch64) BUN_ARCH="aarch64" ;;
  *) die "Unsupported architecture: $ARCH" ;;
esac

# ============== INSTALL BUN IF NECESSARY ===============
if ! command -v bun &>/dev/null; then
  info "Bun not found - installing Bun..."

  if command -v curl &>/dev/null; then
    curl -fsSL https://bun.sh/install | bash
  elif command -v wget &>/dev/null; then
    wget -q0- https://bun.sh/install | bash
  else
    die "Neither curl nor wget found. Please install one and retry"
  fi

  # Bring bun into the current shell's PATH
  export BUN_INSTALL="${HOME}/.bun"
  export PATH="${BUN_INSTALL}/bin:${PATH}"

  command -v bun &>/dev/null || die "Bun installation succeeded but 'bun' is still missing from PATH. Open a new shell or re-run this script."
  success "Bun installed: $(bun --version)"
else
  success "Bun already installed: $(bun --version)"
fi 

# =============== CLONE REPO =================

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

info "Downloading ${TOOL_NAME} from ${REPO_URL}..."

if command -v git &>/dev/null; then
  git clone --depth 1 "$REPO_URL" "$TMP_DIR/repo" &>/dev/null
else
  # Fallback: download archive without git
  ARCHIVE_URL="${REPO_URL}/archive/refs/heads/main.tar.gz"
  wget -q0 "$TMP_DIR/repo.tar.gz" "$ARCHIVE_URL" || \
    curl -fsSL "$ARCHIVE_URL" -0 "$TMP_DIR/repo.tar.gz" || \
    die "Could not download repository. Make sure it is public."
  mkdir -p "$TMP_DIR/repo"
  tar -xzf "$TMP_DIR/repo.tar.gz" -C "$TMP_DIR/repo" --strip-components=1
fi

REPO_DIR="$TMP_DIR/repo"

# ==================== INSTALL DEPENDENCIES =====================

info "Installing dependencies..."
(cd "$REPO_DIR" && bun install --frozen-lockfile 2>/dev/null || bun install)

# ==================== COMPILE TO A SINGLE EXECUTABLE ================

info "Compiling standalone executable..."
BINARY="$TMP_DIR/${TOOL_NAME}"

(cd "$REPO_DIR" && bun build ./src/cli/index.ts \
  --compile \
  --outfile "$BINARY" \
  --target "bun-${OS,,}-${BUN_ARCH}")

[[ -f "$BINARY" ]] || die "Compilation failed - binary not produced."
chmod +x "$BINARY"

# ================== CHOOSE INSTALL LOCATION AND COPY BINARY ==================

if [[ -w "$INSTALL_DIR" ]]; then
  DEST="${INSTALL_DIR}/${TOOL_NAME}"
elif sudo -n true 2>/dev/null; then
  DEST="${INSTALL_DIR}/${TOOL_NAME}"
  USE_SUDO=true
else
  warn "No write access to ${INSTALL_DIR} and sudo not available"
  warn "Falling back to ~/.local/bin (will prompt for sudo if it's also not writable"
  INSTALL_DIR="${HOME}/.local/bin"
  mkdir -p "$INSTALL_DIR"
  DEST="${INSTALL_DIR}/${TOOL_NAME}"
fi

info "Installing ${TOOL_NAME} to ${DEST}..."
if [[ "${USE_SUDO:-false}" == "true" ]]; then
  sudo cp "$BINARY" "$DEST"
  sudo chmod +x "$DEST"
else
  cp "$BINARY" "$DEST"
  chmod +x "$DEST"
fi

# ================== CHECK PATH =================
if ! echo ":${PATH}:" | grep -q ":${INSTALL_DIR}:"; then
  warn "${INSTALL_DIR} is not in your PATH."
  warn "Add this line to your shell config (~/.bashrc, ~/.zshrc, etc.):"
  warn ""
  warn "  export PATH=\"${INSTALL_DIR}:\$PATH\""
  warn ""
  warn "Then restart your shell or run: source ~/.bashrc (or equivalent)"
fi

# ================== MAN PAGE INSTALLATION =================
MAN_DIR="/usr/local/share/man/man1"
MAN_PAGE_SRC="$REPO_DIR/man/${TOOL_NAME}.1"
if [[ ! -f "$MAN_PAGE_SRC" ]]; then
  warn "Man page source $MAN_PAGE_SRC not found, skipping man page installation."
else
  if [[ ! -d "$MAN_DIR" ]]; then
    warn "Man directory ${MAN_DIR} does not exist. Creating it..."
    if [[ -w "/usr/local/share/man" ]]; then
      mkdir -p "$MAN_DIR"
      success "Created man directory at ${MAN_DIR}"
    elif command -v sudo &>/dev/null; then
      sudo mkdir -p "$MAN_DIR"
      success "Created man directory at ${MAN_DIR} (with sudo)"
    else
      die "Cannot create man directory at ${MAN_DIR}. Please create it manually and re-run the script to install the man page."
    fi
  fi

  # Always use sudo if not writable
  if [[ -w "$MAN_DIR" ]]; then
    cp "$MAN_PAGE_SRC" "$MAN_DIR/"
    chmod 644 "$MAN_DIR/${TOOL_NAME}.1"
    mandb &>/dev/null || true
    success "Man page installed to ${MAN_DIR}/${TOOL_NAME}.1"
  elif command -v sudo &>/dev/null; then
    sudo cp "$MAN_PAGE_SRC" "$MAN_DIR/"
    sudo chmod 644 "$MAN_DIR/${TOOL_NAME}.1"
    sudo mandb &>/dev/null || true
    success "Man page installed to ${MAN_DIR}/${TOOL_NAME}.1 (with sudo)"
  else
    warn "No write access to ${MAN_DIR} and sudo not available, skipping man page installation."
    warn "You can manually copy ${MAN_PAGE_SRC} to a directory in your MANPATH to enable 'man ${TOOL_NAME}'"
  fi
fi

success "${TOOL_NAME} installed successfully!"
success "Run '${TOOL_NAME} --help' to get started."
