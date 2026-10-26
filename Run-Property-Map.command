#!/bin/zsh

# Product HeatMap - one-click macOS launcher.
# Double-click this file in Finder to start the local shared server.

SCRIPT_DIR="${0:A:h}"
cd "$SCRIPT_DIR" || exit 1

clear
echo
echo "============================================================"
echo "  Product HeatMap - Local Shared Server"
echo "============================================================"
echo

if command -v python3 >/dev/null 2>&1; then
  PYTHON_EXE="python3"
elif command -v python >/dev/null 2>&1; then
  PYTHON_EXE="python"
else
  echo "ERROR: Python 3.10 or newer was not found."
  echo "Install Python from https://www.python.org/downloads/macos/"
  echo
  read "REPLY?Press Return to close..."
  exit 1
fi

if ! "$PYTHON_EXE" -c 'import sys; raise SystemExit(0 if sys.version_info >= (3, 10) else 1)' >/dev/null 2>&1; then
  echo "ERROR: Product HeatMap requires Python 3.10 or newer."
  "$PYTHON_EXE" --version
  echo
  read "REPLY?Press Return to close..."
  exit 1
fi

export PROPERTY_MAP_MODE="shared"
export PROPERTY_MAP_DATA="$SCRIPT_DIR/shared-data"
export PROPERTY_MAP_ADMIN_EMAIL="admin@igt.com"
export PROPERTY_MAP_SECURE_COOKIE="0"
unset PROPERTY_MAP_ADMIN_PASSWORD

mkdir -p "$PROPERTY_MAP_DATA"

# Check for a completed administrator setup. This also recovers safely if an
# earlier first run stopped after SQLite created an incomplete database.
NEEDS_SETUP=1
if [[ -f "$PROPERTY_MAP_DATA/property-map.sqlite3" ]]; then
  if "$PYTHON_EXE" -c "import os,sqlite3; p=os.path.join(os.environ['PROPERTY_MAP_DATA'],'property-map.sqlite3'); c=sqlite3.connect(p); ok=c.execute('SELECT 1 FROM users WHERE role=? AND password<>? LIMIT 1',('admin','')).fetchone(); raise SystemExit(0 if ok else 1)" >/dev/null 2>&1; then
    NEEDS_SETUP=0
  fi
fi

if [[ "$NEEDS_SETUP" == "1" ]]; then
  echo "First-time setup"
  echo "Create an administrator password containing at least 12 characters."
  echo "The password will not be displayed or saved in this launcher."
  echo

  while true; do
    read -s "PROPERTY_MAP_ADMIN_PASSWORD?Administrator password: "
    echo
    if (( ${#PROPERTY_MAP_ADMIN_PASSWORD} >= 12 )); then
      break
    fi
    echo "The password must contain at least 12 characters. Please try again."
    echo
  done
  export PROPERTY_MAP_ADMIN_PASSWORD
fi

echo "Starting Product HeatMap..."
echo "Member URL: http://127.0.0.1:8000/"
echo "Admin URL:  http://127.0.0.1:8000/admin"
echo
echo "Keep this window open while using Product HeatMap."
echo "Press Control+C in this window to stop the server."
echo

# Wait until the server responds before opening the browser.
(
  for attempt in {1..40}; do
    if curl -fsS "http://127.0.0.1:8000/" >/dev/null 2>&1; then
      open "http://127.0.0.1:8000/"
      exit 0
    fi
    sleep 0.25
  done
) &
BROWSER_WAITER=$!

"$PYTHON_EXE" server.py --host 127.0.0.1 --port 8000
SERVER_EXIT=$?

kill "$BROWSER_WAITER" >/dev/null 2>&1 || true
unset PROPERTY_MAP_ADMIN_PASSWORD

echo
if [[ "$SERVER_EXIT" -eq 0 || "$SERVER_EXIT" -eq 130 ]]; then
  echo "Product HeatMap stopped."
else
  echo "Product HeatMap stopped with error code $SERVER_EXIT."
fi
echo
read "REPLY?Press Return to close..."
exit "$SERVER_EXIT"
