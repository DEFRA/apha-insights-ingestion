#!/usr/bin/env bash
# Weekly Copilot code review -> Jira. Used by the GitHub workflow and run-local.sh.
#
#   review.sh collect   gh: merged PRs + cleaned diffs  -> work/pr-data/
#   review.sh review    copilot -p <prompt>             -> work/findings.json
#   review.sh jira      curl: epic + tasks              (skipped when DRY_RUN=true)
#
# Settings come from config.json next to this script (override path with REVIEW_CONFIG).
# Optional env overrides: REPOS (space-separated), LOOKBACK_DAYS, DRY_RUN.
# Jira site and project come from env JIRA_BASE_URL / JIRA_PROJECT_KEY (GitHub Actions variables),
# falling back to config.json, so team identifiers needn't be committed to a public repo.
# Secrets come from env only: COPILOT_GITHUB_TOKEN (review), JIRA_EMAIL + JIRA_API_TOKEN (jira).
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
CFG="${REVIEW_CONFIG:-$HERE/config.json}"
WORK="${WORK_DIR:-$HERE/work}"
[ -f "$CFG" ] || { echo "Config not found: $CFG"; exit 1; }
jq empty "$CFG" || { echo "Config is not valid JSON: $CFG"; exit 1; }
c() { jq -r "$1" "$CFG"; }

REPOS="${REPOS:-$(c '.review.repos | join(" ")')}"
LOOKBACK_DAYS="${LOOKBACK_DAYS:-$(c '.review.lookback_days // 7')}"
MAX_TASKS="$(c '.review.max_tasks // 3')"
LENSES="$(c '.review.lenses // "refactor"')"
COPILOT_MODEL="$(c '.review.copilot_model // ""')"
DRY_RUN="${DRY_RUN:-true}"
JIRA_BASE_URL="${JIRA_BASE_URL:-$(c '.jira.base_url // ""')}"; JIRA_BASE_URL="${JIRA_BASE_URL%/}"
JIRA_PROJECT_KEY="${JIRA_PROJECT_KEY:-$(c '.jira.project_key // ""')}"
IN_CI="${GITHUB_ACTIONS:-false}"   # public repo: keep logs and summaries free of findings and Jira details
if [ "$IN_CI" = "true" ]; then
  [ -n "$JIRA_BASE_URL" ] && echo "::add-mask::$JIRA_BASE_URL" && echo "::add-mask::${JIRA_BASE_URL#https://}"
  [ -n "$JIRA_PROJECT_KEY" ] && echo "::add-mask::$JIRA_PROJECT_KEY"
fi

days_ago()   { date -u -v-"$1"d +%F 2>/dev/null || date -u -d "-$1 days" +%F; }
week_start() { local d=$(( $(date -u +%u) - 1 )); date -u -v-"${d}"d "+%d %b %Y" 2>/dev/null || date -u -d "-${d} days" "+%d %b %Y"; }
summary()    { [ -n "${GITHUB_STEP_SUMMARY:-}" ] && cat >> "$GITHUB_STEP_SUMMARY" || cat > /dev/null; }

collect() {
  rm -rf "$WORK" && mkdir -p "$WORK/pr-data"
  local since repo base n pr
  since=$(days_ago "$LOOKBACK_DAYS")
  echo "[]" > "$WORK/pr-data/index.json"
  : > "$WORK/pr-data/all-prs.md"
  echo "== Collecting PRs merged since $since"
  for repo in $REPOS; do
    repo="${repo#https://}"; repo="${repo#http://}"; repo="${repo#github.com}"
    repo="${repo#/}"; repo="${repo%/}"; repo="${repo%.git}"
    base=$(gh repo view "$repo" --json defaultBranchRef -q .defaultBranchRef.name)
    gh pr list --repo "$repo" --state merged --base "$base" \
      --search "merged:>=$since" --limit 100 \
      --json number,title,url,author,mergedAt,body > "$WORK/prs.json"
    echo "   $repo: $(jq length "$WORK/prs.json") merged PR(s)"
    jq -c '.[]' "$WORK/prs.json" | while read -r pr; do
      n=$(jq -r .number <<<"$pr")
      {
        echo; echo "################ PR $repo #$n"
        jq -r '"Title: \(.title)\nURL: \(.url)\nAuthor: \(.author.login)\nMerged: \(.mergedAt)\n\nDescription:\n\((.body // "")[:3000])\n"' <<<"$pr"
        { gh pr diff "$n" --repo "$repo" || echo "(diff unavailable)"; } \
          | awk -f "$HERE/annotate-diff.awk" | head -c 150000
      } >> "$WORK/pr-data/all-prs.md"
    done
    jq -s --arg repo "$repo" '.[0] + (.[1] | map({repo: $repo, number, title, url, author: .author.login, mergedAt}))' \
      "$WORK/pr-data/index.json" "$WORK/prs.json" > "$WORK/tmp.json" && mv "$WORK/tmp.json" "$WORK/pr-data/index.json"
  done
  rm -f "$WORK/prs.json"
  local total; total=$(jq length "$WORK/pr-data/index.json")
  echo "   Total: $total PR(s); review input $(wc -c < "$WORK/pr-data/all-prs.md" | tr -d ' ') bytes"
  [ -n "${GITHUB_ENV:-}" ] && echo "TOTAL_PRS=$total" >> "$GITHUB_ENV"
  return 0
}

review() {
  [ "$(jq length "$WORK/pr-data/index.json")" = "0" ] && { echo "No PRs to review."; echo '{"findings":[]}' > "$WORK/findings.json"; return 0; }
  echo "== Sending prompt to Copilot"
  local prompt
  prompt=$(sed -e "s/__MAX_TASKS__/${MAX_TASKS}/g" -e "s/__LENSES__/${LENSES}/g" "$HERE/prompt.md")
  # Copilot never gets the Jira credentials
  run_copilot() {
    ( cd "$WORK" && env -u JIRA_API_TOKEN -u JIRA_EMAIL -u JIRA_BASE_URL -u JIRA_PROJECT_KEY \
        copilot -p "$prompt" --allow-tool=write --deny-tool=shell --no-ask-user \
        ${COPILOT_MODEL:+--model "$COPILOT_MODEL"} )
  }
  if [ "$IN_CI" = "true" ]; then
    # Copilot narrates its findings; keep that out of the (public) job log
    run_copilot > "$WORK/copilot.log" 2>&1 || { echo "::error::copilot failed (see copilot.log)"; tail -5 "$WORK/copilot.log" | grep -i -E "error|denied|auth|licen" || true; exit 1; }
    echo "   Copilot finished"
  else
    run_copilot
  fi
  test -f "$WORK/findings.json" || { echo "::error::Copilot did not write findings.json"; exit 1; }
  jq -e '.findings | type == "array"' "$WORK/findings.json" > /dev/null || { echo "::error::findings.json is not valid"; exit 1; }
}

jira() {
  cd "$WORK"
  jq --argjson max "$MAX_TASKS" '
    .findings
    | map(select((.title // "") != "" and (.repo // "") != "" and (.description // "") != ""))
    | sort_by({"high":0,"medium":1,"low":2}[.severity] // 1)
    | .[:$max]' findings.json > selected.json
  local count week base project
  count=$(jq length selected.json); week=$(week_start)
  base="$JIRA_BASE_URL"; project="$JIRA_PROJECT_KEY"

  echo "== $count task(s) selected"
  if [ "$IN_CI" = "true" ]; then
    echo "   (finding details are not printed in CI; they go to Jira only)"
  else
    jq -r '.[] | "   [\(.severity)] \(.repo) – \(.title)  (\(.file)\(if .line then ":\(.line)" else "" end))"' selected.json
  fi
  {
    echo "## Copilot code review – w/c $week"
    echo "PRs reviewed: $(jq length pr-data/index.json) · tasks raised: $count · dry run: $DRY_RUN"
  } | summary

  if [ "$DRY_RUN" = "true" ]; then echo "Dry run: no Jira issues created."; return 0; fi
  if [ "$count" = "0" ]; then echo "Nothing to raise this week."; return 0; fi
  : "${JIRA_EMAIL:?JIRA_EMAIL not set}" "${JIRA_API_TOKEN:?JIRA_API_TOKEN not set}"
  : "${JIRA_BASE_URL:?JIRA_BASE_URL not set (Actions variable, .env.local or config.json)}"
  : "${JIRA_PROJECT_KEY:?JIRA_PROJECT_KEY not set (Actions variable, .env.local or config.json)}"

  post() {
    curl -sS --fail-with-body -X POST "$base/rest/api/3/issue" \
      -u "$JIRA_EMAIL:$JIRA_API_TOKEN" -H "Content-Type: application/json" -d @-
  }

  local epic
  epic=$(jq -n --slurpfile cfg "$CFG" --slurpfile prs pr-data/index.json \
            --arg week "$week" --argjson n "$count" --arg project "$project" '
    $cfg[0] as $c | $c.jira as $j
    | def t($s): {type:"text", text:(if ($s|tostring) == "" then "-" else ($s|tostring) end)};
      def a($s; $u): {type:"text", text:$s, marks:[{type:"link", attrs:{href:$u}}]};
    {fields:({
      project:{key:$project}, issuetype:{name:$j.epic_issue_type},
      labels:($j.labels // []),
      summary:(($j.epic_summary // "AI code review – w/c {week}") | gsub("\\{week\\}"; $week)),
      description:{type:"doc", version:1, content:[
        {type:"paragraph", content:[t("Copilot review of PRs merged last week. Lenses: \($c.review.lenses). \($n) task(s) raised.")]},
        {type:"heading", attrs:{level:3}, content:[t("PRs reviewed")]},
        {type:"bulletList", content:[ $prs[0][] |
          {type:"listItem", content:[{type:"paragraph", content:[t("\(.repo) "), a("#\(.number) \(.title)"; .url)]}]} ]}
      ]}} + ($j.epic_extra_fields // {}))}' | post | jq -r .key)
  if [ "$IN_CI" = "true" ]; then echo "Created epic"; else echo "Created epic $epic: $base/browse/$epic"; fi

  local f key
  jq -c '.[]' selected.json | while read -r f; do
    key=$(jq -n --slurpfile cfg "$CFG" --argjson f "$f" --arg epic "$epic" --arg project "$project" '
      $cfg[0].jira as $j
      | def t($s): {type:"text", text:(if ($s // "" | tostring) == "" then "-" else ($s|tostring) end)};
        def para($xs): {type:"paragraph", content:$xs};
        def h($s): {type:"heading", attrs:{level:3}, content:[t($s)]};
      ($f.repo | split("/") | last) as $short
      | ($f.file + (if $f.line then ":\($f.line)" else "" end)) as $loc
      | {fields:({
          project:{key:$project}, issuetype:{name:$j.task_issue_type}, parent:{key:$epic},
          summary:((if ($j.task_summary_prefix_repo // true) then "[\($short)] " else "" end) + $f.title)[:250],
          labels:(($j.labels // []) + (if ($j.add_lens_repo_severity_labels // true)
                    then ["lens:\($f.lens // "refactor")", "repo:\($short)", "severity:\($f.severity // "medium")"] else [] end)),
          description:{type:"doc", version:1, content:[
            para([t("PR: "), (if $f.pr_url then {type:"text", text:"#\($f.pr_number) \($f.pr_title // "")",
                  marks:[{type:"link", attrs:{href:$f.pr_url}}]} else t($f.pr_number) end)]),
            para([t("Location: \($loc)   Severity: \($f.severity // "medium")")]),
            h("Finding"), para([t($f.description)]),
            h("Why it matters"), para([t($f.why_it_matters)]),
            h("Suggested fix"), para([t($f.suggested_fix)]),
            h("Triage"), para([t($j.triage_instructions // "Add label accepted to action it, or rejected and close.")])
          ]}}
          + (if $j.assignee_account_id then {assignee:{accountId:$j.assignee_account_id}} else {} end)
          + ($j.task_extra_fields // {}))}' | post | jq -r .key)
    if [ "$IN_CI" = "true" ]; then echo "  created task"; else echo "  $key: $(jq -r .title <<<"$f")  $base/browse/$key"; fi
  done
}

case "${1:-}" in
  collect) collect ;;
  review)  review ;;
  jira)    jira ;;
  *) echo "usage: $0 collect|review|jira"; exit 2 ;;
esac
