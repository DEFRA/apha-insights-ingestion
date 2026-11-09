#!/bin/sh
# Opens stu (S3 terminal UI) against the local floci S3 emulator.
# Install stu with: brew install stu
#
# Defaults to the shared floci from apha-incubator-core (4566). For this
# repo's standalone stack (npm run docker:up) use:
#   S3_ENDPOINT_URL=http://localhost:4567 npm run local-s3
# Extra arguments are passed to stu, e.g. npm run local-s3 -- --prefix raw/wahis/
set -e

if ! command -v stu >/dev/null 2>&1; then
  echo 'stu is not installed. Install it with: brew install stu' >&2
  exit 1
fi

# floci accepts any credentials; these match compose/aws.env
export AWS_ACCESS_KEY_ID=test
export AWS_SECRET_ACCESS_KEY=test
export AWS_REGION=eu-west-2
export AWS_DEFAULT_REGION=eu-west-2
export AWS_ENDPOINT_URL="${S3_ENDPOINT_URL:-http://localhost:4566}"

# floci has no wildcard DNS for bucket subdomains, so force path-style
exec stu \
  --endpoint-url "$AWS_ENDPOINT_URL" \
  --region "$AWS_REGION" \
  --path-style always \
  --bucket "${S3_BUCKET:-apha-insights-ingestion-local}" \
  "$@"
