#!/bin/sh
set -e

# Railway injects PORT for public HTTP→container. TLS stays at the edge (no 443 here).
export PORT="${PORT:-80}"
export API_UPSTREAM="${API_UPSTREAM:-backend.railway.internal:8080}"

# Reject accidental SSL listen configs: this image has no certificates.
case "$PORT" in
  443)
    echo "[web] PORT=443 is invalid inside the container (Railway terminates HTTPS)." >&2
    echo "[web] Use the Railway-assigned PORT and leave public HTTPS to Railway." >&2
    exit 1
    ;;
esac

echo "[web] Listening on HTTP port ${PORT}; upstream API → ${API_UPSTREAM}"

# Official nginx image entrypoint runs envsubst on /etc/nginx/templates → conf.d
exec /docker-entrypoint.sh nginx -g 'daemon off;'

