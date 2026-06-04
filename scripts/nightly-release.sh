#!/bin/bash
# Runs daily at 9 PM. Checks for new commits. If changed, triggers release.sh

export PATH=$PATH:/usr/local/bin:/usr/bin:/bin
[ -f "$HOME/.bashrc" ] && source "$HOME/.bashrc" || true
cd /home/papajoe/projects/redivivus

# 1. Ensure we have the latest tags
git fetch --tags origin

# 2. Check if the current commit already has a release tag
CURRENT_COMMIT=$(git rev-parse HEAD)
LAST_TAG=$(git describe --tags --abbrev=0 2>/dev/null || echo "")

if [ -n "$LAST_TAG" ]; then
    LAST_TAG_COMMIT=$(git rev-list -n 1 "$LAST_TAG")
    if [ "$LAST_TAG_COMMIT" == "$CURRENT_COMMIT" ]; then
        echo "$(date): No new commits since $LAST_TAG. Skipping."
        exit 0
    fi
fi

echo "$(date): New commits detected. Triggering release..."

# 3. GH_TOKEN must be set in the environment (e.g. ~/.bashrc) — never hardcoded here.
if [ -z "$GH_TOKEN" ]; then echo "ERROR: GH_TOKEN not set — skipping release."; exit 1; fi

# Run the user's release script
./scripts/release.sh

# 4. The release script modifies package.json, so we should commit and push it
git commit -am "chore: release $(node -p "require('./package.json').version")"
git push origin master

echo "$(date): Nightly release complete."
