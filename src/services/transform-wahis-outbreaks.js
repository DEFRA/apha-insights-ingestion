import { mapOutbreak } from '#/mappers/wahis-outbreak.js'

// Raw layout, one folder per fetch date:
//   raw/wahis/{date}/event-filtered-list.json
//   raw/wahis/{date}/reports/{reportId}/report.json
//   raw/wahis/{date}/reports/{reportId}/outbreaks/{outbreakId}.json
export const RAW_PREFIX = 'raw/wahis/'
export const TRANSFORMED_PREFIX = 'transformed/wahis-outbreak/'

const OUTBREAK_KEY_PATTERN =
  /^raw\/wahis\/(\d{4}-\d{2}-\d{2})\/reports\/(\d+)\/outbreaks\/(\d+)\.json$/

export const eventListKey = (date) =>
  `${RAW_PREFIX}${date}/event-filtered-list.json`

export const reportKey = (date, reportId) =>
  `${RAW_PREFIX}${date}/reports/${reportId}/report.json`

export const transformedKey = (outbreakId) =>
  `${TRANSFORMED_PREFIX}outbreak_id=${outbreakId}.json`

/**
 * Read raw WAHIS outbreaks from S3, map them to v2 records and write one
 * record per outbreak. When several reports include an outbreak, the latest
 * report wins.
 * @param {object} options
 * @param {ReturnType<import('#/common/helpers/s3-client.js').createS3Store>} options.store
 * @param {object} options.logger
 * @param {string} [options.key] Transform only this raw outbreak key
 * @param {number} [options.limit] Transform at most this many raw keys
 * @param {boolean} [options.dryRun] Map but don't write
 * @param {() => string} [options.now] Clock, for tests
 */
export async function transformWahisOutbreaks({
  store,
  logger,
  key,
  limit,
  dryRun = false,
  now = () => new Date().toISOString()
}) {
  const keys = await selectKeys(store, { key, limit })
  const getEventList = cachedLoader(store, eventListKey)
  const getReport = cachedLoader(store, reportKey)
  const transformedAt = now()
  const latest = new Map()
  const failed = []

  for (const rawObjectKey of keys) {
    try {
      const record = await transformOne({
        store,
        rawObjectKey,
        getEventList,
        getReport,
        transformedAt
      })
      const outbreakId = record.source.outbreakId
      if (isNewer(record, latest.get(outbreakId))) {
        latest.set(outbreakId, record)
      }
    } catch (error) {
      logger.error({ err: error, rawObjectKey }, 'Failed to transform outbreak')
      failed.push({ rawObjectKey, error: error.message })
    }
  }

  const records = [...latest.values()]
  if (!dryRun) {
    for (const record of records) {
      await store.putJson(transformedKey(record.source.outbreakId), record)
    }
  }

  logger.info(
    {
      read: keys.length,
      written: dryRun ? 0 : records.length,
      failed: failed.length
    },
    'WAHIS outbreak transform finished'
  )
  return { read: keys.length, records, failed }
}

async function selectKeys(store, { key, limit }) {
  if (key) {
    return [key]
  }
  // Sorted, so later fetch dates are processed last
  const keys = (await store.listKeys(RAW_PREFIX))
    .filter((k) => OUTBREAK_KEY_PATTERN.test(k))
    .sort()
  return limit ? keys.slice(0, limit) : keys
}

async function transformOne({
  store,
  rawObjectKey,
  getEventList,
  getReport,
  transformedAt
}) {
  const match = OUTBREAK_KEY_PATTERN.exec(rawObjectKey)
  if (!match) {
    throw new Error(`Not a raw outbreak key: ${rawObjectKey}`)
  }
  const date = match[1]
  const reportId = Number(match[2])

  const outbreak = await store.getJson(rawObjectKey)
  if (!outbreak) {
    throw new Error(`Raw outbreak not found: ${rawObjectKey}`)
  }
  const report = await getReport(date, reportId)
  if (!report) {
    throw new Error(`Raw report ${reportId} not found for ${date}`)
  }
  const eventList = await getEventList(date)
  const eventListEntry = eventList?.list.find(
    (entry) => entry.reportId === reportId
  )
  if (!eventListEntry) {
    throw new Error(`Report ${reportId} not in the ${date} event list`)
  }

  const { createdByReportId } = outbreak.body.outbreak
  const creatingReport =
    createdByReportId === reportId
      ? null
      : await getReport(date, createdByReportId)

  return mapOutbreak({
    outbreak: outbreak.body,
    report,
    eventListEntry,
    creatingReport,
    rawObjectKey,
    // The folder date is when it was fetched; upload time may be later
    retrievedAt: `${date}T00:00:00Z`,
    transformedAt
  })
}

/** Memoise JSON reads by key, returning the body or null if missing. */
function cachedLoader(store, toKey) {
  const cache = new Map()
  return (...args) => {
    const key = toKey(...args)
    if (!cache.has(key)) {
      cache.set(
        key,
        store.getJson(key).then((res) => res?.body ?? null)
      )
    }
    return cache.get(key)
  }
}

/**
 * Higher reportNumber wins; later lastReportedOn breaks a tie. A full tie
 * (same report fetched on a later date) goes to the later fetch.
 */
function isNewer(candidate, current) {
  if (!current) {
    return true
  }
  const a = candidate.source.reportNumber
  const b = current.source.reportNumber
  if (a !== b) {
    return a > b
  }
  return candidate.dates.lastReportedOn >= current.dates.lastReportedOn
}
