#!/usr/bin/env bash
set -euo pipefail

mkdir -p logs

{
  echo "== node =="; node -v
  echo "== npm =="; npm -v

  # Install policy:
  # - If node_modules exists: don't touch dependencies (fast + offline-friendly)
  # - Else if lockfile exists: npm ci (deterministic)
  # - Else: npm install to create lockfile (best effort)
  if [[ -d node_modules ]]; then
    echo "== install =="; echo "SKIP (node_modules already present)"
  else
    if [[ -f package-lock.json ]]; then
      echo "== install =="; npm ci --no-audit --fund=false --ignore-scripts
    else
      echo "== install =="; echo "WARNING: package-lock.json missing; generating lockfile via npm install"
      npm install --legacy-peer-deps --no-audit --fund=false --ignore-scripts
    fi
  fi

  echo "== lint =="; npm run lint
  echo "== test =="; npm test

  # Keep Vite cache and build artifacts out of repo
  echo "== build =="; VITE_CACHE_DIR=logs/.vite npm run build -- --outDir logs/build --emptyOutDir

  echo "VERIFY_OK"
} 2>&1 | tee logs/verify.log
