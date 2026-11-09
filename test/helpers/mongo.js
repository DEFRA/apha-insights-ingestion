import { getDb } from '#/data/db.js'

const SYSTEM_COLLECTION_PREFIX = 'system.'

/**
 * Delete every document from each non-system collection in the connected
 * database. Collections and their indexes are kept.
 * @returns {Promise<void>}
 */
export async function clearCollections() {
  const collections = await getDb().collections()
  await Promise.all(
    collections
      .filter(
        ({ collectionName }) =>
          !collectionName.startsWith(SYSTEM_COLLECTION_PREFIX)
      )
      .map((collection) => collection.deleteMany({}))
  )
}
