#!/usr/bin/env bash
# Run the weekly review on your machine, exactly as the GitHub workflow does.
#
#   .github/copilot-review/run-local.sh            dry run: no Jira issues
#   .github/copilot-review/run-local.sh --live     also create the Jira epic + tasks
#
# Settings: config.json (this folder). One-off overrides: LOOKBACK_DAYS=30 REPOS="DEFRA/x" ...
# .env.local in this folder (git-ignored), using `export` lines:
#   JIRA_BASE_URL, JIRA_PROJECT_KEY, JIRA_EMAIL, JIRA_API_TOKEN
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"

export DRY_RUN=true; [ "${1:-}" = "--live" ] && DRY_RUN=false
[ -f "$HERE/.env.local" ] && source "$HERE/.env.local"

for tool in gh jq copilot; do
  command -v "$tool" >/dev/null || { echo "Missing $tool (brew install gh jq node; npm i -g @github/copilot)"; exit 1; }
done

bash "$HERE/review.sh" collect
bash "$HERE/review.sh" review
bash "$HERE/review.sh" jira
[ "$DRY_RUN" = "true" ] && echo "Full output: $HERE/work/findings.json · add --live to create the issues."
