// Transform raw WAHIS outbreaks in S3 into v2 outbreak records.
//
//   npm run transform:wahis -- --key <rawOutbreakKey>   one record
//   npm run transform:wahis -- --limit 5                first 5 raw keys
//   npm run transform:wahis -- --dry-run                print, don't write
//   npm run transform:wahis                             everything
//
// Reads and writes S3_BUCKET at S3_ENDPOINT_URL (default: floci on 4566).
import { parseArgs } from 'node:util'

import { createLogger } from '#/common/helpers/logging/logger.js'
import { createS3Store } from '#/common/helpers/s3-client.js'
import { transformWahisOutbreaks } from '#/services/transform-wahis-outbreaks.js'

const { values } = parseArgs({
  options: {
    key: { type: 'string' },
    limit: { type: 'string' },
    'dry-run': { type: 'boolean', default: false }
  }
})

const logger = createLogger()
const store = createS3Store()

const { records, failed } = await transformWahisOutbreaks({
  store,
  logger,
  key: values.key,
  limit: values.limit ? Number(values.limit) : undefined,
  dryRun: values['dry-run']
})

if (values['dry-run']) {
  console.log(JSON.stringify(records, null, 2))
}

process.exitCode = failed.length > 0 ? 1 : 0
