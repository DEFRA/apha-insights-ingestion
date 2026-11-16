import { createServer } from 'node:http'

/**
 * Local HTTP server standing in for S3. The real SDK signs and sends each
 * request; `respond` answers it and every request is recorded.
 */
export function startFakeS3(respond) {
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

export const xml = (body) => ({
  headers: { 'Content-Type': 'application/xml' },
  body: `<?xml version="1.0" encoding="UTF-8"?>${body}`
})
