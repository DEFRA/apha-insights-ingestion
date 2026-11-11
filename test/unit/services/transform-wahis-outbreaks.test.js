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

/** In-memory stand-in for createS3Store */
function fakeStore(objects) {
  const data = new Map(Object.entries(objects))
  return {
    written: new Map(),
    listKeys: vi.fn(async (prefix) =>
      [...data.keys()].filter((key) => key.startsWith(prefix))
    ),
    getJson: vi.fn(async (key) =>
      data.has(key)
        ? { body: structuredClone(data.get(key)), lastModified: new Date() }
        : null
    ),
    async putJson(key, body) {
      this.written.set(key, body)
    }
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
    const objects = rawObjects()
    const later = fixture('report-186838')
    later.report.reportId = 186900
    later.report.reportNumber = 2
    objects[`raw/wahis/${DATE}/reports/186900/report.json`] = later
    objects[`raw/wahis/${DATE}/event-filtered-list.json`].list.push({
      reportId: 186900,
      reportType: 'FUR'
    })
    objects[outbreakKey(186900, 198855)] = fixture(
      'report-186838-outbreak-198855'
    )
    const store = fakeStore(objects)

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
})
