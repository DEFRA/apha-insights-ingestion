import { readFileSync } from 'node:fs'

import { mapOutbreak } from '#/mappers/wahis-outbreak.js'

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'))
const fixture = (name) => readJson(`fixtures/${name}.json`)

const RETRIEVED_AT = '2026-11-09T12:00:00Z'
const TRANSFORMED_AT = '2026-11-10T12:00:00Z'

function map(reportId, outbreakId, overrides = {}) {
  return mapOutbreak({
    outbreak: fixture(`report-${reportId}-outbreak-${outbreakId}`),
    report: fixture(`report-${reportId}`),
    eventListEntry: { reportId, reportType: 'IN' },
    creatingReport: null,
    rawObjectKey: `raw/wahis/2026-11-09/reports/${reportId}/outbreaks/${outbreakId}.json`,
    retrievedAt: RETRIEVED_AT,
    transformedAt: TRANSFORMED_AT,
    ...overrides
  })
}

describe('#mapOutbreak', () => {
  test('Should map outbreak 198855 to the schema example', () => {
    const { _id, ...example } = readJson(
      'src/data/schemas/wahis-outbreak.example.json'
    )

    const record = map(186838, 198855, {
      eventListEntry: { reportId: 186838, reportType: 'FUR' },
      rawObjectKey: example.source.rawObjectKey
    })

    expect(record).toEqual({
      ...example,
      // Not in WAHIS responses, and the example's note is hand-written
      geography: { ...example.geography, continent: null },
      classification: {
        ...example.classification,
        note: 'WAHIS codes Farm vs Backyard but not commercial vs non-commercial.'
      }
    })
  })

  test('Should keep null counts as null', () => {
    const [{ totals }] = map(186685, 198597).species

    expect(totals).toEqual({
      susceptible: 47,
      cases: null,
      deaths: null,
      killed: null,
      slaughtered: null,
      vaccinated: null
    })
  })

  test('Should keep zero counts as zero', () => {
    const [{ totals }] = map(186781, 198731).species

    expect(totals.killed).toBe(0)
    expect(totals.cases).toBe(50)
  })

  test('Should map every species row and classify wild birds', () => {
    const record = map(186905, 198656)

    expect(record.species.map(({ speciesName }) => speciesName)).toEqual([
      'Northern Shoveler',
      'Common Teal',
      'Eurasian Wigeon'
    ])
    expect(record.species[0]).toMatchObject({
      isWild: true,
      wildType: 'Wild',
      productionType: null
    })
    expect(record.premises.animalCategory).toBe('wild')
    expect(record.classification.reportingClassification).toBe('wild_birds')
    expect(record.geography.isLocationApprox).toBe(false)
  })

  test('Should keep a "Not applicable" epi unit for wild birds', () => {
    const record = map(186906, 198971)

    expect(record.event.subtype).toBe('H5N5')
    expect(record.premises.epiUnitType).toBe('Not applicable')
    expect(record.classification.reportingClassification).toBe('wild_birds')
  })

  test('Should classify non-poultry birds', () => {
    const record = map(186685, 198597)

    expect(record.species[0].productionType).toBe('Non-poultry birds')
    expect(record.classification.reportingClassification).toBe(
      'non_poultry_birds'
    )
  })

  test('Should leave first-reported dates null when the creating report is missing', () => {
    const outbreak = fixture('report-186838-outbreak-198855')
    outbreak.outbreak.createdByReportId = 186826

    const record = map(186838, 198855, { outbreak })

    expect(record.dates.firstReportedOn).toBeNull()
    expect(record.dates.reportingMonth).toBeNull()
    expect(record.dates.lastReportedOn).toBe('2026-10-28T16:48:42.168Z')
  })

  test('Should take first-reported dates from the creating report', () => {
    const outbreak = fixture('report-186838-outbreak-198855')
    outbreak.outbreak.createdByReportId = 186826

    const record = map(186838, 198855, {
      outbreak,
      creatingReport: {
        report: { reportedOn: '2026-09-30T08:00:00.000+00:00' }
      }
    })

    expect(record.dates.firstReportedOn).toBe('2026-09-30T08:00:00.000Z')
    expect(record.dates.reportingMonth).toBe('2026-09')
  })

  test('Should not classify a wild mammal as a wild bird', () => {
    const outbreak = fixture('report-186715-outbreak-198683')
    Object.assign(outbreak.speciesQuantities[0].totalQuantities, {
      speciesId: 1,
      speciesName: 'Red fox'
    })

    const record = map(186715, 198683, { outbreak })

    expect(record.premises.animalCategory).toBe('wild')
    expect(record.classification).toMatchObject({
      reportingClassification: 'unclassified',
      confidence: 'low'
    })
    expect(record.processing.classificationStatus).toBe('unclassified')
  })

  test('Should not classify wild birds mixed with an unknown wild species', () => {
    const outbreak = fixture('report-186905-outbreak-198656')
    outbreak.speciesQuantities[1].totalQuantities.speciesId = 1

    const record = map(186905, 198656, { outbreak })

    expect(record.classification.reportingClassification).toBe('unclassified')
  })
})
