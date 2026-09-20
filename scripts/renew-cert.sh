#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

HOSTNAME="desktop.tailf98c53.ts.net"

tailscale cert "$HOSTNAME"
mv "$HOSTNAME.crt" server/cert/tailscale.crt
mv "$HOSTNAME.key" server/cert/tailscale.key

docker compose restart server
echo "Renewed cert and restarted the peario server."
