#!/bin/bash
# Runs daily at 9 PM. Checks for new commits. If changed, triggers release.sh

export PATH=$PATH:/usr/local/bin:/usr/bin:/bin
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

# 3. We need to export a PAT for the gh CLI if cron can't access the keyring.
export GH_TOKEN=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

# Run the user's release script
./scripts/release.sh

# 4. The release script modifies package.json, so we should commit and push it
git commit -am "chore: release $(node -p "require('./package.json').version")"
git push origin master

echo "$(date): Nightly release complete."
