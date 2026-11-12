import { createServer } from 'node:http'

import { createS3Store } from '#/common/helpers/s3-client.js'

const BUCKET = 'test-bucket'

/**
 * Local HTTP server standing in for S3. The real SDK signs and sends each
 * request; `respond` answers it and every request is recorded.
 */
function startFakeS3(respond) {
  const requests = []
  const server = createServer((req, res) => {
    let body = ''
    req.on('data', (chunk) => (body += chunk))
    req.on('end', () => {
      const url = new URL(req.url, 'http://localhost')
      const request = { method: req.method, url, headers: req.headers, body }
      requests.push(request)
      const { status = 200, headers = {}, body: out = '' } = respond(request)
      res.writeHead(status, headers)
      res.end(out)
    })
  })
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () =>
      resolve({
        requests,
        endpoint: `http://127.0.0.1:${server.address().port}`,
        close: () => new Promise((resolve) => server.close(resolve))
      })
    )
  })
}

const xml = (body) => ({
  headers: { 'Content-Type': 'application/xml' },
  body: `<?xml version="1.0" encoding="UTF-8"?>${body}`
})

const s3Error = (status, code) => ({
  status,
  ...xml(`<Error><Code>${code}</Code><Message>${code}</Message></Error>`)
})

function listPage(keys, nextToken) {
  const contents = keys.map((key) => `<Contents><Key>${key}</Key></Contents>`)
  return xml(
    `<ListBucketResult><Name>${BUCKET}</Name>${contents.join('')}` +
      `<IsTruncated>${Boolean(nextToken)}</IsTruncated>` +
      (nextToken
        ? `<NextContinuationToken>${nextToken}</NextContinuationToken>`
        : '') +
      '</ListBucketResult>'
  )
}

describe('#createS3Store', () => {
  let fakeS3
  let respond

  beforeAll(async () => {
    fakeS3 = await startFakeS3((request) => respond(request))
  })

  afterAll(async () => {
    await fakeS3.close()
  })

  beforeEach(() => {
    fakeS3.requests.length = 0
    vi.stubEnv('AWS_ACCESS_KEY_ID', 'test')
    vi.stubEnv('AWS_SECRET_ACCESS_KEY', 'test')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  const store = () =>
    createS3Store({
      bucket: BUCKET,
      endpoint: fakeS3.endpoint,
      region: 'eu-west-2'
    })

  describe('#listKeys', () => {
    test('Should follow continuation tokens across pages', async () => {
      respond = ({ url }) =>
        url.searchParams.get('continuation-token') === 'page-2'
          ? listPage(['raw/c.json'])
          : listPage(['raw/a.json', 'raw/b.json'], 'page-2')

      const keys = await store().listKeys('raw/')

      expect(keys).toEqual(['raw/a.json', 'raw/b.json', 'raw/c.json'])
      expect(
        fakeS3.requests.map(({ url }) => [
          url.pathname,
          url.searchParams.get('prefix'),
          url.searchParams.get('continuation-token')
        ])
      ).toEqual([
        [`/${BUCKET}/`, 'raw/', null],
        [`/${BUCKET}/`, 'raw/', 'page-2']
      ])
    })

    test('Should return no keys for an empty prefix', async () => {
      respond = () => listPage([])

      expect(await store().listKeys('none/')).toEqual([])
    })
  })

  describe('#getJson', () => {
    test('Should parse the object body and return its last modified date', async () => {
      respond = () => ({
        headers: {
          'Content-Type': 'application/json',
          'Last-Modified': 'Mon, 09 Nov 2026 10:00:00 GMT'
        },
        body: '{"outbreakId":198855}'
      })

      const result = await store().getJson('raw/a.json')

      expect(result).toEqual({
        body: { outbreakId: 198855 },
        lastModified: new Date('2026-11-09T10:00:00Z')
      })
      expect(fakeS3.requests[0]).toMatchObject({
        method: 'GET',
        url: expect.objectContaining({ pathname: `/${BUCKET}/raw/a.json` })
      })
    })

    test('Should return null when the key does not exist', async () => {
      respond = () => s3Error(404, 'NoSuchKey')

      expect(await store().getJson('raw/missing.json')).toBeNull()
    })

    test('Should rethrow other S3 errors', async () => {
      respond = () => s3Error(403, 'AccessDenied')

      await expect(store().getJson('raw/a.json')).rejects.toMatchObject({
        name: 'AccessDenied'
      })
    })

    test('Should reject a body that is not JSON', async () => {
      respond = () => ({ body: 'not json' })

      await expect(store().getJson('raw/a.json')).rejects.toThrow(SyntaxError)
    })
  })

  describe('#putJson', () => {
    test('Should write pretty-printed JSON with a JSON content type', async () => {
      respond = () => ({ headers: { ETag: '"etag"' } })

      await store().putJson('transformed/a.json', { outbreakId: 198855 })

      const [request] = fakeS3.requests
      expect(request.method).toBe('PUT')
      expect(request.url.pathname).toBe(`/${BUCKET}/transformed/a.json`)
      expect(request.headers['content-type']).toBe('application/json')
      expect(request.body).toBe('{\n  "outbreakId": 198855\n}')
    })

    test('Should propagate S3 errors', async () => {
      respond = () => s3Error(403, 'AccessDenied')

      await expect(
        store().putJson('transformed/a.json', {})
      ).rejects.toMatchObject({ name: 'AccessDenied' })
    })
  })
})
