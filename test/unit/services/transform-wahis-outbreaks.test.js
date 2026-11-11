import { readFileSync } from 'node:fs'

import {
  transformWahisOutbreaks,
  transformedKey
} from '#/services/transform-wahis-outbreaks.js'

const fixture = (name) =>
  JSON.parse(readFileSync(`fixtures/${name}.json`, 'utf8'))

const DATE = '2026-11-09'
const outbreakKey = (reportId, outbreakId, date = DATE) =>
  `raw/wahis/${date}/reports/${reportId}/outbreaks/${outbreakId}.json`

/** In-memory stand-in for createS3Store; writes are readable back */
function fakeStore(objects) {
  const data = new Map(Object.entries(objects))
  return {
    data,
    written: new Map(),
    listKeys: vi.fn(async (prefix) =>
      [...data.keys()].filter((key) => key.startsWith(prefix))
    ),
    getJson: vi.fn(async (key) =>
      data.has(key)
        ? { body: structuredClone(data.get(key)), lastModified: new Date() }
        : null
    ),
    putJson: vi.fn(async function (key, body) {
      this.written.set(key, body)
      data.set(key, structuredClone(body))
    })
  }
}

const eventList = (...entries) => ({ list: entries })

function rawObjects(date = DATE) {
  return {
    [`raw/wahis/${date}/event-filtered-list.json`]: eventList(
      { reportId: 186838, reportType: 'FUR' },
      { reportId: 186781, reportType: 'IN' }
    ),
    [`raw/wahis/${date}/reports/186838/report.json`]: fixture('report-186838'),
    [`raw/wahis/${date}/reports/186781/report.json`]: fixture('report-186781'),
    [outbreakKey(186838, 198855, date)]: fixture(
      'report-186838-outbreak-198855'
    ),
    [outbreakKey(186781, 198731, date)]: fixture(
      'report-186781-outbreak-198731'
    )
  }
}

/** Add report 186900 (reportNumber 2), which repeats outbreak 198855 */
function withLaterReport(objects, { reportStatus = 'Validated' } = {}) {
  const later = fixture('report-186838')
  later.report.reportId = 186900
  later.report.reportNumber = 2
  later.report.reportStatus.keyValue = reportStatus
  objects[`raw/wahis/${DATE}/reports/186900/report.json`] = later
  objects[`raw/wahis/${DATE}/event-filtered-list.json`].list.push({
    reportId: 186900,
    reportType: 'FUR'
  })
  objects[outbreakKey(186900, 198855)] = fixture(
    'report-186838-outbreak-198855'
  )
  return objects
}

const logger = { info: vi.fn(), error: vi.fn() }
const now = () => '2026-11-10T12:00:00.000Z'

describe('#transformWahisOutbreaks', () => {
  test('Should write one record per outbreak under the transformed prefix', async () => {
    const store = fakeStore(rawObjects())

    const result = await transformWahisOutbreaks({ store, logger, now })

    expect(result.read).toBe(2)
    expect(result.failed).toEqual([])
    expect([...store.written.keys()].sort()).toEqual([
      transformedKey(198731),
      transformedKey(198855)
    ])
    expect(store.written.get(transformedKey(198855)).source).toMatchObject({
      reportType: 'FUR',
      rawObjectKey: outbreakKey(186838, 198855),
      retrievedAt: '2026-11-09T00:00:00Z'
    })
  })

  test('Should transform only the given key', async () => {
    const store = fakeStore(rawObjects())

    const result = await transformWahisOutbreaks({
      store,
      logger,
      now,
      key: outbreakKey(186838, 198855)
    })

    expect(result.read).toBe(1)
    expect(store.listKeys).not.toHaveBeenCalled()
    expect([...store.written.keys()]).toEqual([transformedKey(198855)])
  })

  test('Should respect the limit', async () => {
    const store = fakeStore(rawObjects())

    const result = await transformWahisOutbreaks({
      store,
      logger,
      now,
      limit: 1
    })

    expect(result.read).toBe(1)
    expect(store.written.size).toBe(1)
  })

  test('Should not write on a dry run', async () => {
    const store = fakeStore(rawObjects())

    const result = await transformWahisOutbreaks({
      store,
      logger,
      now,
      dryRun: true
    })

    expect(result.records).toHaveLength(2)
    expect(store.written.size).toBe(0)
  })

  test('Should keep going when one outbreak fails', async () => {
    const objects = rawObjects()
    delete objects[`raw/wahis/${DATE}/reports/186781/report.json`]
    const store = fakeStore(objects)

    const result = await transformWahisOutbreaks({ store, logger, now })

    expect(result.failed).toEqual([
      {
        rawObjectKey: outbreakKey(186781, 198731),
        error: `Raw report 186781 not found for ${DATE}`
      }
    ])
    expect([...store.written.keys()]).toEqual([transformedKey(198855)])
    expect(logger.error).toHaveBeenCalled()
  })

  test('Should keep the record from the latest report', async () => {
    const store = fakeStore(withLaterReport(rawObjects()))

    const result = await transformWahisOutbreaks({ store, logger, now })

    expect(result.records).toHaveLength(2)
    expect(store.written.get(transformedKey(198855)).source).toMatchObject({
      reportId: 186900,
      reportNumber: 2
    })
  })

  test('Should prefer the later fetch of the same report', async () => {
    const store = fakeStore({
      ...rawObjects('2026-11-09'),
      ...rawObjects('2026-11-10')
    })

    await transformWahisOutbreaks({ store, logger, now })

    expect(store.written.get(transformedKey(198855)).source.retrievedAt).toBe(
      '2026-11-10T00:00:00Z'
    )
  })

  test('Should skip an outbreak from a report that is not validated', async () => {
    const store = fakeStore(
      withLaterReport(rawObjects(), { reportStatus: 'Draft' })
    )

    const result = await transformWahisOutbreaks({ store, logger, now })

    expect(result.skipped).toEqual([
      {
        rawObjectKey: outbreakKey(186900, 198855),
        reason: 'Report 186900 status is Draft'
      }
    ])
    expect(result.failed).toEqual([])
    expect(store.written.get(transformedKey(198855)).source).toMatchObject({
      reportId: 186838,
      reportStatus: 'Validated'
    })
  })

  test('Should not replace a stored record from a later report', async () => {
    const store = fakeStore(withLaterReport(rawObjects()))
    await transformWahisOutbreaks({
      store,
      logger,
      now,
      key: outbreakKey(186900, 198855)
    })

    const result = await transformWahisOutbreaks({
      store,
      logger,
      now,
      key: outbreakKey(186838, 198855)
    })

    expect(result.records).toEqual([])
    expect(result.skipped).toEqual([
      {
        rawObjectKey: outbreakKey(186838, 198855),
        reason: 'Stored record for outbreak 198855 is newer'
      }
    ])
    expect(store.written.get(transformedKey(198855)).source.reportId).toBe(
      186900
    )
  })

  test('Should not replace a stored record from a later fetch of the same report', async () => {
    const store = fakeStore({
      ...rawObjects('2026-11-09'),
      ...rawObjects('2026-11-10')
    })
    await transformWahisOutbreaks({
      store,
      logger,
      now,
      key: outbreakKey(186838, 198855, '2026-11-10')
    })

    const result = await transformWahisOutbreaks({
      store,
      logger,
      now,
      key: outbreakKey(186838, 198855, '2026-11-09')
    })

    expect(result.records).toEqual([])
    expect(store.written.get(transformedKey(198855)).source.retrievedAt).toBe(
      '2026-11-10T00:00:00Z'
    )
  })

  test('Should replace a stored record when rerun on the same input', async () => {
    const store = fakeStore(rawObjects())
    await transformWahisOutbreaks({ store, logger, now })

    const result = await transformWahisOutbreaks({
      store,
      logger,
      now: () => '2026-11-11T12:00:00.000Z'
    })

    expect(result.records).toHaveLength(2)
    expect(
      store.written.get(transformedKey(198855)).processing.transformedAt
    ).toBe('2026-11-11T12:00:00.000Z')
  })

  test('Should keep writing when one write fails', async () => {
    const store = fakeStore(rawObjects())
    const write = store.putJson
    store.putJson = vi.fn(async function (key, body) {
      if (key === transformedKey(198855)) {
        throw new Error('Access Denied')
      }
      return write.call(this, key, body)
    })

    const result = await transformWahisOutbreaks({ store, logger, now })

    expect(result.failed).toEqual([
      { rawObjectKey: outbreakKey(186838, 198855), error: 'Access Denied' }
    ])
    expect(result.records.map(({ source }) => source.outbreakId)).toEqual([
      198731
    ])
    expect([...store.written.keys()]).toEqual([transformedKey(198731)])
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ rawObjectKey: outbreakKey(186838, 198855) }),
      'Failed to write outbreak'
    )
  })

  test('Should report a failed read of the stored record', async () => {
    const store = fakeStore(rawObjects())
    const read = store.getJson
    store.getJson = vi.fn(async (key) => {
      if (key === transformedKey(198731)) {
        throw new Error('Slow Down')
      }
      return read(key)
    })

    const result = await transformWahisOutbreaks({ store, logger, now })

    expect(result.failed).toEqual([
      { rawObjectKey: outbreakKey(186781, 198731), error: 'Slow Down' }
    ])
    expect([...store.written.keys()]).toEqual([transformedKey(198855)])
  })
})
