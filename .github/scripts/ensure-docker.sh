#!/usr/bin/env bash
# Ensure the Docker daemon is reachable on macOS self-hosted runners.
# Docker Desktop often sleeps or is quit between CI jobs; start it and wait.
set -euo pipefail

if docker info >/dev/null 2>&1; then
  echo "Docker daemon is already ready"
  docker version --format '{{.Server.Version}}' 2>/dev/null || true
  exit 0
fi

echo "Docker daemon not reachable at ${DOCKER_HOST:-default socket}"
echo "Attempting to start Docker Desktop..."

if [ -d "/Applications/Docker.app" ]; then
  open -a Docker
elif [ -d "/Applications/Docker Desktop.app" ]; then
  open -a "Docker Desktop"
else
  echo "Docker Desktop app not found under /Applications"
  echo "Install Docker Desktop on this runner, or start the daemon manually."
  exit 1
fi

# Cold start on Apple Silicon can take well over a minute.
for i in $(seq 1 90); do
  if docker info >/dev/null 2>&1; then
    echo "Docker daemon is ready (waited ~$((i * 2))s)"
    docker version --format 'Server {{.Server.Version}}' 2>/dev/null || true
    exit 0
  fi
  sleep 2
done

echo "Timed out waiting for Docker daemon after ~3 minutes"
echo "Socket candidates:"
ls -la "$HOME/.docker/run/docker.sock" 2>/dev/null || true
ls -la /var/run/docker.sock 2>/dev/null || true
exit 1
