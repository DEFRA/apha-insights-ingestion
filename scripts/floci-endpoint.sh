#!/bin/sh
# Prints the S3 endpoint for host-side scripts, in order of precedence:
#   1. S3_ENDPOINT_URL from the shell (empty means real AWS)
#   2. S3_ENDPOINT_URL from .env
#   3. this repo's standalone floci (4567), if it is running
#   4. the shared floci from apha-incubator-core (4566)
# The two stacks never run together, so at most one floci answers.

if [ -n "${S3_ENDPOINT_URL+set}" ]; then
  echo "$S3_ENDPOINT_URL"
elif [ -f .env ] && grep -q '^S3_ENDPOINT_URL=' .env; then
  sed -n 's/^S3_ENDPOINT_URL=//p' .env | tail -n 1
elif curl -s -o /dev/null --max-time 1 http://localhost:4567/; then
  echo 'http://localhost:4567'
else
  echo 'http://localhost:4566'
fi
