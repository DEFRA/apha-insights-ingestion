// The default ajv export only supports draft-07. The 2020 entry point adds
// draft 2020-12, which the schema declares.
import Ajv2020 from 'ajv/dist/2020.js'

import schema from './schemas/wahis-outbreak.schema.json' with { type: 'json' }

// allErrors so one run reports every problem with a record, not just the
// first. The schema uses ["string", "null"] style unions throughout.
const validate = new Ajv2020({
  allErrors: true,
  allowUnionTypes: true
}).compile(schema)

/**
 * Check a transformed WAHIS outbreak record against the outbreak JSON Schema.
 * @param {object} record
 * @returns {string[]} One message per failed rule, as "<path> <message>";
 * empty when the record is valid
 */
export function validateWahisOutbreak(record) {
  if (validate(record)) {
    return []
  }
  return validate.errors.map(({ instancePath, message, params }) =>
    params.additionalProperty
      ? `${instancePath} ${message} (${params.additionalProperty})`
      : `${instancePath} ${message}`
  )
}
