#!/usr/bin/env bash
# ============================================================
# JACK-AGENT Install Script (Unix — Linux & macOS)
# Usage: curl -fsSL https://raw.githubusercontent.com/prastya-dev/jack-agent/main/scripts/install.sh | bash
# ============================================================

set -e

REPO="prastya-dev/jack-agent"
BIN_NAME="jack"
INSTALL_DIR="/usr/local/bin"
CYAN="\033[96m"
RED="\033[91m"
GREEN="\033[32m"
GRAY="\033[90m"
RESET="\033[0m"

banner() {
  echo -e "${CYAN}"
  echo -e "${GRAY}  JACK-AGENT Installer — by prastya-dev${RESET}\n"
}

error() {
  echo -e "${RED}  ✗ Error: $1${RESET}" >&2
  exit 1
}

info() {
  echo -e "${CYAN}  ➜${RESET} $1" >&2
}

success() {
  echo -e "${GREEN}  ✓ $1${RESET}" >&2
}

# ── Detect Platform ──────────────────────────────────────────

detect_platform() {
  OS=$(uname -s | tr '[:upper:]' '[:lower:]')
  ARCH=$(uname -m)

  case "$OS" in
    linux)  PLATFORM="linux" ;;
    darwin) PLATFORM="macos" ;;
    *)      error "Unsupported OS: $OS. Please download manually from GitHub Releases." ;;
  esac

  case "$ARCH" in
    x86_64 | amd64) ARCH_TAG="x64" ;;
    aarch64 | arm64) ARCH_TAG="arm64" ;;
    *) error "Unsupported architecture: $ARCH" ;;
  esac
}

# ── Get Latest Release Tag ────────────────────────────────────

get_latest_version() {
  if command -v curl &>/dev/null; then
    VERSION=$(curl -fsSL "https://api.github.com/repos/${REPO}/releases/latest" | grep '"tag_name"' | sed -E 's/.*"([^"]+)".*/\1/')
  elif command -v wget &>/dev/null; then
    VERSION=$(wget -qO- "https://api.github.com/repos/${REPO}/releases/latest" | grep '"tag_name"' | sed -E 's/.*"([^"]+)".*/\1/')
  else
    error "Neither curl nor wget found. Please install one and retry."
  fi

  if [ -z "$VERSION" ]; then
    error "Could not fetch latest version. Check your internet connection."
  fi
}

# ── Download Binary ───────────────────────────────────────────

download_binary() {
  BINARY_URL="https://github.com/${REPO}/releases/download/${VERSION}/jack-${PLATFORM}-${ARCH_TAG}"
  TMP_FILE=$(mktemp)

  info "Downloading jack ${VERSION} for ${PLATFORM}/${ARCH_TAG}..."

  if command -v curl &>/dev/null; then
    curl -fL --progress-bar "$BINARY_URL" -o "$TMP_FILE" || error "Download failed. URL: $BINARY_URL"
  else
    wget --progress=bar:force:noscroll "$BINARY_URL" -O "$TMP_FILE" || error "Download failed."
  fi

  chmod +x "$TMP_FILE"
  echo "$TMP_FILE"
}

# ── Install ────────────────────────────────────────────────────

install_binary() {
  local tmp_file="$1"

  if [ -w "$INSTALL_DIR" ]; then
    mv "$tmp_file" "${INSTALL_DIR}/${BIN_NAME}"
  else
    info "Requesting sudo to install to ${INSTALL_DIR}..."
    sudo mv "$tmp_file" "${INSTALL_DIR}/${BIN_NAME}"
  fi

  # Linux File Manager Context Menu (Run JACK Here)
  if [ "$PLATFORM" = "linux" ]; then
    info "Setting up 'Run JACK Here' context menu for Linux..."
    ICON_DIR="${HOME}/.local/share/icons/hicolor/256x256/apps"
    mkdir -p "$ICON_DIR"
    if command -v curl &>/dev/null; then
      curl -fsSL "https://raw.githubusercontent.com/${REPO}/main/icon.png" -o "${ICON_DIR}/jack.png" || true
    else
      wget -q "https://raw.githubusercontent.com/${REPO}/main/icon.png" -O "${ICON_DIR}/jack.png" || true
    fi

    # KDE/Dolphin
    KDE_DIR="${HOME}/.local/share/kio/servicemenus"
    mkdir -p "$KDE_DIR"
    cat <<EOF > "${KDE_DIR}/jack.desktop"
[Desktop Entry]
Type=Service
ServiceTypes=KonqPopupMenu/Plugin
MimeType=inode/directory;
Actions=runJack;
X-KDE-Priority=TopLevel

[Desktop Action runJack]
Name=Run JACK Here
Icon=jack
Exec=konsole --workdir %f -e jack || gnome-terminal --working-directory=%f -- jack || xterm -e "cd %f && jack"
EOF

    # Nautilus/Nemo
    FM_DIR="${HOME}/.local/share/file-manager/actions"
    mkdir -p "$FM_DIR"
    cat <<EOF > "${FM_DIR}/jack.desktop"
[Desktop Entry]
Type=Action
Name=Run JACK Here
Icon=jack
Profiles=profile-zero;

[X-Action-Profile profile-zero]
Exec=gnome-terminal --working-directory=%f -- jack || konsole --workdir %f -e jack || xterm -e "cd %f && jack"
Name=Default profile
EOF

    # Application Launcher Shortcut
    APP_DIR="${HOME}/.local/share/applications"
    mkdir -p "$APP_DIR"
    cat <<EOF > "${APP_DIR}/jack.desktop"
[Desktop Entry]
Name=JACK Agent
Comment=AI CLI Terminal Interface
Exec=jack
Icon=jack
Terminal=true
Type=Application
Categories=Utility;Development;TerminalEmulator;
EOF
  fi
}

# ── npm alternative ────────────────────────────────────────────

try_npm_install() {
  if command -v npm &>/dev/null; then
    info "npm detected. Installing via npm..."
    npm install -g @prastya-dev/jack-agent
    success "Installed via npm!"
    return 0
  fi
  return 1
}

# ── Main ───────────────────────────────────────────────────────

main() {
  banner

  select_language() {
    local options=("English" "Bahasa Indonesia")
    local selected=1 # Default: Bahasa Indonesia

    if [ ! -c /dev/tty ]; then
      IS_EN=false
      return
    fi

    # Hide cursor
    echo -ne "\033[?25l"

    print_menu() {
      for i in "${!options[@]}"; do
        if [ $i -eq $selected ]; then
          echo -e "  \033[96m▶ ${options[$i]}\033[0m\033[K"
        else
          echo -e "    \033[90m${options[$i]}\033[0m\033[K"
        fi
      done
    }

    print_menu

    while true; do
      local key=""
      read -rsn1 key </dev/tty 2>/dev/null || break
      if [[ $key == $'\x1b' ]]; then
        read -rsn2 -t 0.1 key </dev/tty 2>/dev/null || true
        if [[ $key == "[A" ]]; then # Up arrow
          selected=$(( (selected - 1 + 2) % 2 ))
        elif [[ $key == "[B" ]]; then # Down arrow
          selected=$(( (selected + 1) % 2 ))
        fi
      elif [[ $key == "" || $key == $'\n' || $key == $'\r' ]]; then # Enter
        break
      elif [[ $key == "1" ]]; then
        selected=0
        break
      elif [[ $key == "2" ]]; then
        selected=1
        break
      fi

      # Move cursor up 2 lines to redraw menu
      echo -ne "\033[2A"
      print_menu
    done

    # Restore cursor
    echo -ne "\033[?25h"

    if [ $selected -eq 0 ]; then
      IS_EN=true
    else
      IS_EN=false
    fi
  }

  select_language

  # Try npm first if available
  if try_npm_install; then
    if [ "$IS_EN" = true ]; then
      echo -e "\n${CYAN}  Installation complete, please close this tab and try 'jack' in your terminal!${RESET}\n"
    else
      echo -e "\n${CYAN}  Instalasi selesai silahkan close tab ini dan coba di terminal anda jack${RESET}\n"
    fi
    exit 0
  fi

  detect_platform
  get_latest_version
  TMP=$(download_binary)
  install_binary "$TMP"

  if [ "$IS_EN" = true ]; then
    success "jack ${VERSION} installed to ${INSTALL_DIR}/${BIN_NAME}"
    echo -e "\n${CYAN}  Installation complete, please close this tab and try 'jack' in your terminal!${RESET}\n"
  else
    success "jack ${VERSION} berhasil diinstal ke ${INSTALL_DIR}/${BIN_NAME}"
    echo -e "\n${CYAN}  Instalasi selesai silahkan close tab ini dan coba di terminal anda jack${RESET}\n"
  fi
}

main "$@"
