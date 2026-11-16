#!/bin/sh

# Seed the WAHIS fixtures into the raw layout read by transform:wahis:
#   fixtures/event-filtered-list.json        -> raw/wahis/{date}/event-filtered-list.json
#   fixtures/report-{r}.json                 -> raw/wahis/{date}/reports/{r}/report.json
#   fixtures/report-{r}-outbreak-{o}.json    -> raw/wahis/{date}/reports/{r}/outbreaks/{o}.json
# Skip if the fixtures aren't mounted (the shared floci in apha-incubator-core
# doesn't mount them) or are already seeded (floci data persists across restarts).
# floci runs hooks with sh and shuts down if one fails, so keep this POSIX.
BUCKET=apha-insights-ingestion-local
# FIXTURES can be overridden, for test/integration/scripts
FIXTURES=${FIXTURES:-/fixtures/wahis}
DATE=2026-11-09
PREFIX="s3://$BUCKET/raw/wahis/$DATE"
MARKER_KEY="raw/wahis/$DATE/event-filtered-list.json"

if [ ! -f "$FIXTURES/event-filtered-list.json" ]; then
  echo "No WAHIS fixtures at $FIXTURES, skipping seed"
  exit 0
fi

if aws s3api head-object --bucket "$BUCKET" --key "$MARKER_KEY" >/dev/null 2>&1; then
  echo "WAHIS fixtures already seeded, skipping"
  exit 0
fi

for file in "$FIXTURES"/report-*.json; do
  name=$(basename "$file" .json)
  case "$name" in
    report-*-outbreak-*)
      report=$(echo "$name" | sed 's/^report-\([0-9]*\)-outbreak-.*/\1/')
      outbreak=$(echo "$name" | sed 's/.*-outbreak-\([0-9]*\)$/\1/')
      key="reports/$report/outbreaks/$outbreak.json"
      ;;
    *)
      key="reports/${name#report-}/report.json"
      ;;
  esac
  aws s3 cp --quiet "$file" "$PREFIX/$key"
done

# Last, so a partial seed is retried on the next start
aws s3 cp --quiet "$FIXTURES/event-filtered-list.json" "s3://$BUCKET/$MARKER_KEY"

echo "Seeded WAHIS fixtures under $PREFIX/"
