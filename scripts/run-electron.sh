#!/bin/bash
# Ensure a display is available for WSLg / VS Code integrated terminal.
# WSLg sets DISPLAY automatically in native WSL sessions but not always
# in VS Code's integrated terminal — fall back to :0 if unset.
export DISPLAY="${DISPLAY:-:0}"
export NODE_ENV=development

# Also try the WSLg socket path if :0 doesn't work
if [ -z "$WAYLAND_DISPLAY" ]; then
  export WAYLAND_DISPLAY=wayland-0
fi

echo "[electron] DISPLAY=$DISPLAY NODE_ENV=$NODE_ENV"
exec "$(dirname "$0")/../node_modules/.bin/electron" . --no-sandbox --disable-gpu "$@"
