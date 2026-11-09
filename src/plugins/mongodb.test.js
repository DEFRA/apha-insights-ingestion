import { Db, MongoClient } from 'mongodb'
import { LockManager } from 'mongo-locks'

describe('#mongoDb', () => {
  let server

  describe('Set up', () => {
    beforeAll(async () => {
      const { createServer } = await import('#/server.js')

      server = await createServer()
      await server.initialize()
    })

    test('Server should have expected MongoDb decorators', () => {
      expect(server.db).toBeInstanceOf(Db)
      expect(server.mongoClient).toBeInstanceOf(MongoClient)
      expect(server.locker).toBeInstanceOf(LockManager)
    })

    test('MongoDb should have expected database name', () => {
      expect(server.db.databaseName).toBe('apha-insights-ingestion')
    })

    test('MongoDb should have expected namespace', () => {
      expect(server.db.namespace).toBe('apha-insights-ingestion')
    })
  })

  describe('Shut down', () => {
    beforeAll(async () => {
      const { createServer } = await import('#/server.js')

      server = await createServer()
      await server.initialize()
    })

    test('Should close Mongo client on server stop', async () => {
      const closeSpy = vi.spyOn(server.mongoClient, 'close')
      await server.stop({ timeout: 1000 })

      expect(closeSpy).toHaveBeenCalledWith(true)
    })
  })

  describe('Shut down failure', () => {
    beforeAll(async () => {
      const { createServer } = await import('#/server.js')

      server = await createServer()
      await server.initialize()
    })

    test('Should log an error when closing the Mongo client fails', async () => {
      const closeError = new Error('close failed')
      const close = server.mongoClient.close.bind(server.mongoClient)
      vi.spyOn(server.mongoClient, 'close').mockImplementationOnce(
        async (force) => {
          await close(force)
          throw closeError
        }
      )
      const errorSpy = vi.spyOn(server.logger, 'error')

      await server.stop({ timeout: 1000 })

      // Hapi emits 'stop' without awaiting listeners
      await vi.waitFor(() =>
        expect(errorSpy).toHaveBeenCalledWith(
          closeError,
          'failed to close mongo client'
        )
      )
    })
  })
})
