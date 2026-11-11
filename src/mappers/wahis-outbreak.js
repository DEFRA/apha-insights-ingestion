export const SCHEMA_VERSION = '2.0.0'
export const CLASSIFICATION_RULE_VERSION = '2.0'
const API_VERSION = 'v1/pi'

const DISEASE_CODES = { 668: 'HPAI', 671: 'HPAI' }

const FARM_NOTE =
  'WAHIS codes Farm vs Backyard but not commercial vs non-commercial.'

/**
 * Map one WAHIS outbreak, plus the report it came from, to a v2 outbreak
 * record. Rules are documented in src/data/schemas/README.md.
 * @param {object} input
 * @param {object} input.outbreak Outbreak all-information response
 * @param {object} input.report Report all-information response
 * @param {object} input.eventListEntry Matching row from event filtered-list
 * @param {object|null} input.creatingReport Report that created the outbreak,
 * null if not fetched
 * @param {string} input.rawObjectKey S3 key of the raw outbreak file
 * @param {string} input.retrievedAt ISO timestamp the raw file was fetched
 * @param {string} input.transformedAt ISO timestamp of this run
 */
export function mapOutbreak({
  outbreak: raw,
  report: { event, report },
  eventListEntry,
  creatingReport,
  rawObjectKey,
  retrievedAt,
  transformedAt
}) {
  const { outbreak, adminDivisions, quantityUnit, speciesQuantities } = raw
  const species = speciesQuantities.map(mapSpecies)
  const firstReportedOn = toIsoTimestamp(
    firstReport(outbreak, report, creatingReport)?.reportedOn
  )
  const classification = classify(outbreak, species)
  const firstSpeciesType = speciesQuantities[0]?.speciesType

  return {
    source: {
      system: 'WAHIS',
      eventId: event.eventId,
      reportId: report.reportId,
      reportNumber: report.reportNumber,
      reportType: eventListEntry.reportType,
      reportStatus: report.reportStatus.keyValue,
      outbreakId: outbreak.outbreakId,
      createdByReportId: outbreak.createdByReportId,
      lastUpdateReportId: outbreak.lastUpdateReportId,
      oieReference: outbreak.oieReference,
      nationalReference: outbreak.nationalReference,
      rawObjectKey,
      retrievedAt,
      apiVersion: API_VERSION
    },

    event: {
      disease: event.disease.name,
      diseaseId: event.disease.diseaseId,
      diseaseCode: DISEASE_CODES[event.disease.diseaseId] ?? null,
      subtype: event.subType?.disease?.name ?? null,
      eventStatus: event.eventStatus.keyValue,
      eventStartDate: toDate(event.startedOn),
      eventEndDate: toDate(event.endedOn),
      reason: event.reason?.translation ?? null
    },

    dates: {
      outbreakStartDate: toDate(outbreak.startDate),
      outbreakEndDate: toDate(outbreak.endDate),
      firstReportedOn,
      lastReportedOn: toIsoTimestamp(report.reportedOn),
      reportingMonth: firstReportedOn?.slice(0, 7) ?? null
    },

    geography: {
      countryName: event.country.name,
      countryIso3: event.country.isoCode,
      countryAreaId: event.country.areaId,
      // Not in the WAHIS responses; needs a lookup if it's wanted
      continent: null,
      adminDivisions: adminDivisions.map((division) => ({
        level: division.adminLevel,
        name: division.name,
        areaId: division.areaId,
        parentAreaId: division.parentAreaId
      })),
      location: outbreak.location ?? null,
      point: {
        type: 'Point',
        // GeoJSON order is [longitude, latitude]
        coordinates: [outbreak.longitude, outbreak.latitude]
      },
      isLocationApprox: outbreak.isLocationApprox
    },

    premises: {
      epiUnitType: outbreak.epiUnitType?.translation ?? null,
      epiUnitTypeId: outbreak.epiUnitType?.id ?? null,
      isCluster: outbreak.isCluster,
      clusterCount: outbreak.clusterCount,
      animalCategory: animalCategory(species)
    },

    quantityUnit: quantityUnit?.translation ?? null,

    species,

    classification,

    raw: {
      productionType: firstSpeciesType?.productionType?.translation ?? null,
      wildType: firstSpeciesType?.wildType?.translation ?? null,
      epiUnitType: outbreak.epiUnitType?.translation ?? null,
      description: outbreak.description?.translation ?? null
    },

    processing: {
      schemaVersion: SCHEMA_VERSION,
      transformedAt,
      classificationStatus:
        classification.reportingClassification === 'unclassified'
          ? 'unclassified'
          : 'classified',
      validationStatus: 'valid',
      recordStatus: 'active'
    }
  }
}

function mapSpecies({ totalQuantities: totals, speciesType }) {
  return {
    speciesName: totals.speciesName,
    speciesId: totals.speciesId,
    isWild: totals.isWild,
    wildType: speciesType?.wildType?.translation ?? null,
    productionType: normaliseText(speciesType?.productionType?.translation),
    productionSystem: speciesType?.productionSystem?.translation ?? null,
    totals: {
      susceptible: totals.susceptible,
      cases: totals.cases,
      deaths: totals.deaths,
      killed: totals.killed,
      slaughtered: totals.slaughtered,
      vaccinated: totals.vaccinated
    }
  }
}

function firstReport(outbreak, report, creatingReport) {
  if (outbreak.createdByReportId === report.reportId) {
    return report
  }
  return creatingReport?.report ?? null
}

function animalCategory(species) {
  if (species.length === 0) {
    return null
  }
  const wildCount = species.filter(({ isWild }) => isWild).length
  if (wildCount === 0) {
    return 'domestic'
  }
  return wildCount === species.length ? 'wild' : 'mixed'
}

/**
 * Classify from coded fields: wild flag, production type and epi unit.
 * Mammals can't be told apart yet (no fixture), so they fall through.
 */
export function classify(outbreak, species) {
  const epiUnitType = outbreak.epiUnitType?.translation ?? null
  const productionTypes = new Set(
    species.map(({ productionType }) => productionType).filter(Boolean)
  )
  const result = (reportingClassification, basis, confidence, note = null) => ({
    reportingClassification,
    ruleVersion: CLASSIFICATION_RULE_VERSION,
    basis,
    confidence,
    note
  })

  if (species.length > 0 && species.every(({ isWild }) => isWild)) {
    return result('wild_birds', ['isWild=true'], 'high')
  }

  if (productionTypes.size === 1 && productionTypes.has('Poultry')) {
    const basis = ['productionType=Poultry', `epiUnitType=${epiUnitType}`]
    if (epiUnitType === 'Farm') {
      return result('poultry_farm', basis, 'medium', FARM_NOTE)
    }
    if (epiUnitType === 'Backyard') {
      return result('poultry_backyard', basis, 'high')
    }
    return result('poultry_unspecified', basis, 'low')
  }

  if (productionTypes.size === 1 && productionTypes.has('Non-poultry birds')) {
    return result(
      'non_poultry_birds',
      ['productionType=Non-poultry birds'],
      'high'
    )
  }

  return result('unclassified', [], 'low')
}

/** Trim and collapse whitespace, including non-breaking spaces. */
function normaliseText(value) {
  return value == null ? null : value.replace(/\s+/g, ' ').trim()
}

/** "2026-10-27T00:00:00.000+00:00" -> "2026-10-27" */
function toDate(value) {
  return value == null ? null : value.slice(0, 10)
}

/** "2026-10-28T16:48:42.168+00:00" -> "2026-10-28T16:48:42.168Z" */
function toIsoTimestamp(value) {
  return value == null ? null : new Date(value).toISOString()
}
