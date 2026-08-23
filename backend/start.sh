#!/bin/sh
# Railpack looks for start.sh when Dockerfile builder is not used.
# Delegate to the same production entrypoint used by the Dockerfile CMD.
set -eu
APP_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
exec /bin/sh "$APP_DIR/docker-entrypoint.sh" "$@"
