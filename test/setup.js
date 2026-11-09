import { afterAll, beforeAll } from 'vitest'
import createFetchMock from 'vitest-fetch-mock'

import { config } from '#/config.js'
import { closeMongo, connectMongo } from '#/data/db.js'
import { clearCollections } from './helpers/mongo.js'

const fetchMock = createFetchMock(vi)

// Fail fast with a connection error when the Mongo container is not running
const SERVER_SELECTION_TIMEOUT_MS = 5000

let isMongoConnected = false

/**
 * Connect to the test Mongo container using app config, with a short server
 * selection timeout so a missing container fails the run quickly.
 * @returns {Promise<import('mongodb').Db>} The connected database
 */
function connectTestMongo() {
  const mongo = config.get('mongo')
  return connectMongo({
    ...mongo,
    mongoOptions: {
      ...mongo.mongoOptions,
      serverSelectionTimeoutMS: SERVER_SELECTION_TIMEOUT_MS
    }
  })
}

beforeAll(async () => {
  // Setup fetch mock
  fetchMock.enableMocks()
  global.fetch = fetchMock
  global.fetchMock = fetchMock

  await connectTestMongo()
  isMongoConnected = true
})

afterAll(async () => {
  fetchMock.disableMocks()

  if (!isMongoConnected) {
    return
  }

  // A server stop closes the shared client, so reconnect before cleaning up
  await connectTestMongo()
  await clearCollections()
  await closeMongo()
})
