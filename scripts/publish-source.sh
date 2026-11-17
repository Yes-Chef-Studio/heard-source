#!/usr/bin/env bash
# Publishes the source of the running Heard version to the public source repository, as the
# AGPL-3.0 (section 13) requires for software people use over a network. Run it whenever you
# deploy a new version. Publishes a snapshot (one commit per run), not this repo's history.
#
#   scripts/publish-source.sh            # publishes the current HEAD
#   SOURCE_REPO=owner/name scripts/publish-source.sh
set -euo pipefail

SOURCE_REPO="${SOURCE_REPO:-Yes-Chef-Studio/heard-source}"
ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
  echo "Commit or stash your changes first: the published source must match a commit." >&2
  exit 1
fi

SHA="$(git rev-parse HEAD)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

gh repo clone "$SOURCE_REPO" "$WORK/repo" -- --quiet --depth 1 2>/dev/null || {
  echo "Can't clone $SOURCE_REPO. Create it first (public), then rerun." >&2
  exit 1
}

# Replace everything except .git with the tracked files at HEAD.
find "$WORK/repo" -mindepth 1 -maxdepth 1 ! -name .git -exec rm -rf {} +
git archive HEAD | tar -x -C "$WORK/repo"
cp app/LICENSE "$WORK/repo/LICENSE"
cat > "$WORK/repo/SOURCE.md" <<EOF
# Heard source

Heard is Yes Chef Studio's client feedback tool. It is a modified version of
[Crikket](https://github.com/redpangilinan/crikket) and is licensed under the
GNU Affero General Public License v3.0 (see LICENSE).

This repository holds the complete source of the version currently in use.

Published from commit \`$SHA\` on $(date -u +%Y-%m-%d).
EOF

cd "$WORK/repo"
git add -A
if git diff --cached --quiet; then
  echo "Already up to date with $SHA."
  exit 0
fi
GIT_AUTHOR_NAME="Yes Chef Studio" GIT_AUTHOR_EMAIL="brandonhorvaticpersonal@users.noreply.github.com" \
GIT_COMMITTER_NAME="Yes Chef Studio" GIT_COMMITTER_EMAIL="brandonhorvaticpersonal@users.noreply.github.com" \
  git commit --quiet -m "Heard source at ${SHA:0:12}"
git push --quiet origin HEAD
echo "Published $SHA to https://github.com/$SOURCE_REPO"
