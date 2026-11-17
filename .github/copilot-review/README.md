# Copilot weekly review → Jira

Every Monday, a GitHub Action asks the **GitHub Copilot CLI agent** to review the PRs merged into
`main` in the last 7 days. It raises the most valuable refactor opportunities (up to 3 by default) as
**Jira tasks under a weekly epic**. A person then triages each task: label it `accepted` to action it,
or `rejected` and close it.

```text
Mon 07:00 cron (.github/workflows/copilot-weekly-review.yml)
  1. collect  gh CLI      → merged PRs + cleaned diffs (lockfiles/fixtures removed, real line numbers)
  2. review   copilot -p  → prompt.md → findings.json
  3. jira     curl + jq   → one epic + tasks
```

**The workflow is off by default.** It runs only once the repo variable `COPILOT_REVIEW_ENABLED`
is set to `true`.

## Files

| File                | Purpose                                                          |
| ------------------- | ---------------------------------------------------------------- |
| `config.json`       | Review and Jira settings (task cap, lenses, issue types, labels) |
| `prompt.md`         | The prompt sent to Copilot; edit freely                          |
| `review.sh`         | The three steps, shared by the workflow and local runs           |
| `annotate-diff.awk` | Strips noisy files from diffs and adds new-file line numbers     |
| `run-local.sh`      | Run the same thing on your machine                               |

## Repo settings (Settings → Secrets and variables → Actions)

The Jira site and project key are not committed, because this repo is public.

| Kind     | Name                              | Value                                                                       |
| -------- | --------------------------------- | --------------------------------------------------------------------------- |
| Variable | `COPILOT_REVIEW_ENABLED`          | `true` to switch the workflow on; delete it or set `false` to turn it off   |
| Variable | `JIRA_BASE_URL`                   | Your Jira site, e.g. `https://<site>.atlassian.net`                         |
| Variable | `JIRA_PROJECT_KEY`                | The Jira project key                                                        |
| Variable | `COPILOT_REVIEW_UPLOAD_ARTIFACTS` | Optional. `true` uploads the working files; only use this in a private repo |
| Secret   | `COPILOT_GITHUB_TOKEN`            | Fine-grained PAT with the **Copilot Requests** account permission           |
| Secret   | `JIRA_EMAIL`                      | Atlassian login email of the account that raises tickets                    |
| Secret   | `JIRA_API_TOKEN`                  | API token for that account                                                  |

## Config

`config.json` holds the settings that aren't sensitive. For example, `task_extra_fields` and
`epic_extra_fields` are passed straight to Jira, such as `{"components":[{"name":"..."}]}`.
`jira.base_url` and `jira.project_key` are left blank and are supplied through the variables above,
or through `.env.local` when you run it locally.

## Running it

- **In GitHub:** set the variables and secrets, then go to Actions → _Copilot weekly review -> Jira_ →
  Run workflow. It's a dry run by default. The schedule only runs once this is on `main`.
- **Locally:** run `.github/copilot-review/run-local.sh` for a dry run, or add `--live` to create the issues.
  It needs `gh`, `jq` and `copilot`. Create `.github/copilot-review/.env.local` (git-ignored) with
  `export JIRA_BASE_URL=…`, `JIRA_PROJECT_KEY`, `JIRA_EMAIL` and `JIRA_API_TOKEN`.

## Safety and public logs

- Copilot runs with **file write only and shell denied**, and the Jira credentials and site are never in its environment.
- PR content is treated as untrusted. `jq` validates Copilot's output and builds the Jira requests, and the number of tasks is capped.
- In CI, the Jira site and project are masked. Finding details and Copilot's own narration stay out of the
  job log and run summary (logs are public on a public repo). The findings go to Jira only.
- Keep the `security` lens off while this runs from a public repo. Its findings would describe
  possible vulnerabilities, and the working files could disclose them if artifacts were enabled.
