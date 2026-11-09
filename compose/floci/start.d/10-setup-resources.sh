#!/bin/bash

# S3 buckets
# Single bucket for the service; key prefixes separate the data
# (e.g. raw/wahis/ for upstream API responses stored as fetched).
# Skip if it exists: floci data persists across restarts, and a failing
# script stops apha-incubator-core running the other services' scripts
BUCKET=apha-insights-ingestion-local
aws s3api head-bucket --bucket "$BUCKET" >/dev/null 2>&1 || aws s3 mb "s3://$BUCKET"

# SQS queues
#aws sqs create-queue --queue-name my-queue
