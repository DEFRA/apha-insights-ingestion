import { MongoClient } from 'mongodb'

import { config } from '#/config.js'

/**
 * @typedef {object} Connection
 * @property {Promise<MongoClient>} clientPromise - In-flight or settled connect
 * @property {string} dbName - Database chosen by the first `connectMongo()` call
 * @property {MongoClient} [client] - Set once the connect succeeds
 */

/** @type {Connection | undefined} */
let connection

/**
 * Start a connect and record it as the shared connection.
 * Forgets the connection if the connect fails, so the next call can retry.
 * @param {string} mongoUrl - Mongo connection URI
 * @param {import('mongodb').MongoClientOptions} mongoOptions - Mongo client options
 * @param {string} dbName - Name of the database to use
 * @returns {Connection} The new connection
 */
function openConnection(mongoUrl, mongoOptions, dbName) {
  /** @type {Connection} */
  const current = {
    clientPromise: MongoClient.connect(mongoUrl, mongoOptions),
    dbName
  }
  current.clientPromise.then(
    (client) => {
      current.client = client
    },
    () => {
      if (connection === current) {
        connection = undefined
      }
    }
  )
  return current
}

/**
 * Connect to MongoDB, or reuse the existing connection.
 * The connection opens only when this is called, never on import. Concurrent
 * calls share a single in-flight connection; a failed connect can be retried.
 * @param {object} [options] - Mongo settings, defaulting to `config.get('mongo')`
 * @param {string} options.mongoUrl - Mongo connection URI
 * @param {import('mongodb').MongoClientOptions} options.mongoOptions - Mongo client options
 * @param {string} options.databaseName - Name of the database to use
 * @returns {Promise<import('mongodb').Db>} The connected database
 */
export async function connectMongo(
  { mongoUrl, mongoOptions, databaseName } = config.get('mongo')
) {
  connection ??= openConnection(mongoUrl, mongoOptions, databaseName)
  const { clientPromise, dbName } = connection
  const client = await clientPromise
  return client.db(dbName)
}

/**
 * Get the shared Mongo client, for example to start a transaction session.
 * @returns {MongoClient} The connected client
 * @throws {Error} If `connectMongo()` has not been called
 */
export function getClient() {
  if (!connection?.client) {
    throw new Error('MongoDB client not connected; call connectMongo() first')
  }
  return connection.client
}

/**
 * Get the connected database.
 * @returns {import('mongodb').Db} The connected database
 * @throws {Error} If `connectMongo()` has not been called
 */
export function getDb() {
  return getClient().db(connection.dbName)
}

/**
 * Close the shared Mongo client, if one is open. Safe to call more than once.
 * Closes the connection for every caller in the process.
 * @returns {Promise<void>}
 */
export async function closeMongo() {
  const current = connection
  connection = undefined
  const client = await current?.clientPromise.catch(() => undefined)
  await client?.close(true)
}
