import { readFileSync } from 'node:fs'

import { validateWahisOutbreak } from '#/data/validate-wahis-outbreak.js'

const example = () =>
  JSON.parse(
    readFileSync('src/data/schemas/wahis-outbreak.example.json', 'utf8')
  )

describe('#validateWahisOutbreak', () => {
  test('Should accept the schema example', () => {
    expect(validateWahisOutbreak(example())).toEqual([])
  })

  test('Should reject a record missing a required field', () => {
    const record = example()
    delete record.source.outbreakId

    expect(validateWahisOutbreak(record)).toEqual([
      "/source must have required property 'outbreakId'"
    ])
  })

  test('Should reject a field of the wrong type', () => {
    const record = example()
    record.source.reportNumber = '1'

    expect(validateWahisOutbreak(record)).toEqual([
      '/source/reportNumber must be integer'
    ])
  })

  test('Should reject a field the schema does not define', () => {
    const record = example()
    record.processing.extra = true

    expect(validateWahisOutbreak(record)).toEqual([
      '/processing must NOT have additional properties (extra)'
    ])
  })

  test('Should reject a latitude out of range', () => {
    const record = example()
    record.geography.point.coordinates[1] = 91

    expect(validateWahisOutbreak(record)).toEqual([
      '/geography/point/coordinates/1 must be <= 90'
    ])
  })

  test('Should accept null where the schema allows it', () => {
    const record = example()
    record.event.eventEndDate = null
    record.species[0].totals.cases = null

    expect(validateWahisOutbreak(record)).toEqual([])
  })
})
