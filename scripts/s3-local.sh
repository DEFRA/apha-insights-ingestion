#!/bin/sh
# Opens stu (S3 terminal UI) against the local floci S3 emulator.
# Install stu with: brew install stu
#
# Finds the running floci (standalone 4567 or shared 4566) via
# floci-endpoint.sh. Override with S3_ENDPOINT_URL=... npm run s3:local
# Extra arguments are passed to stu, e.g. npm run s3:local -- --prefix raw/wahis/
set -e

if ! command -v stu >/dev/null 2>&1; then
  echo 'stu is not installed. Install it with: brew install stu' >&2
  exit 1
fi

# npm doesn't load .env, so read S3_BUCKET from it like the node scripts do
# (--env-file-if-exists). Values already in the shell win.
if [ -z "$S3_BUCKET" ] && [ -f .env ]; then
  S3_BUCKET=$(sed -n 's/^S3_BUCKET=//p' .env | tail -n 1)
fi

# floci accepts any credentials; these match compose/aws.env
export AWS_ACCESS_KEY_ID=test
export AWS_SECRET_ACCESS_KEY=test
export AWS_REGION=eu-west-2
export AWS_DEFAULT_REGION=eu-west-2
export AWS_ENDPOINT_URL="$(sh scripts/floci-endpoint.sh)"

# floci has no wildcard DNS for bucket subdomains, so force path-style
exec stu \
  --endpoint-url "$AWS_ENDPOINT_URL" \
  --region "$AWS_REGION" \
  --path-style always \
  --bucket "${S3_BUCKET:-apha-insights-ingestion-local}" \
  "$@"
