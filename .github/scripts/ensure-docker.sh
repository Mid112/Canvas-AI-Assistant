#!/usr/bin/env bash
# Ensure the Docker daemon is reachable on macOS self-hosted runners.
# Docker Desktop often sleeps or is quit between CI jobs; start it and wait.
# Also reclaim disk from prior CI containers — a full Docker VM causes
# postgres init to die with "No space left on device" and makes jobs look
# like flaky port / readiness failures.
set -euo pipefail

if ! docker info >/dev/null 2>&1; then
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
      break
    fi
    sleep 2
  done
fi

if ! docker info >/dev/null 2>&1; then
  echo "Timed out waiting for Docker daemon after ~3 minutes"
  echo "Socket candidates:"
  ls -la "$HOME/.docker/run/docker.sock" 2>/dev/null || true
  ls -la /var/run/docker.sock 2>/dev/null || true
  exit 1
fi

echo "Docker daemon is ready"
docker version --format '{{.Server.Version}}' 2>/dev/null || true

# Drop exited CI postgres containers / dangling volumes from prior runs so
# concurrent self-hosted jobs do not fill the Docker Desktop disk.
echo "Reclaiming stale CI Docker resources..."
for filter in "name=ci-postgres-" "name=ci-e2e-postgres-"; do
  ids=$(docker ps -aq --filter "$filter" --filter "status=exited" 2>/dev/null || true)
  if [ -n "$ids" ]; then
    # -v removes anonymous volumes attached to those containers.
    # shellcheck disable=SC2086
    docker rm -fv $ids >/dev/null 2>&1 || true
  fi
done
# Only remove CI networks / volumes — avoid global prune touching unrelated
# runner state (other jobs or local Docker Desktop usage on this host).
nets=$(docker network ls --format '{{.Name}}' 2>/dev/null | grep -E '^ci-net-' || true)
if [ -n "$nets" ]; then
  # In-use networks fail rm; ignore so concurrent jobs keep theirs.
  # shellcheck disable=SC2086
  docker network rm $nets >/dev/null 2>&1 || true
fi
vols=$(docker volume ls -q 2>/dev/null | grep -E 'ci-postgres|ci-e2e-postgres' || true)
if [ -n "$vols" ]; then
  # shellcheck disable=SC2086
  docker volume rm $vols >/dev/null 2>&1 || true
fi
docker system df || true
