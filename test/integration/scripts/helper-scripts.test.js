import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { startFakeS3, xml } from '../../helpers/fake-s3.js'

const ROOT = join(import.meta.dirname, '../../..')
const FLOCI_ENDPOINT = join(ROOT, 'scripts/floci-endpoint.sh')
const SEED_FIXTURES = join(
  ROOT,
  'compose/floci/start.d/20-seed-wahis-fixtures.sh'
)
const SCRIPT_TIMEOUT_MS = 30_000

/**
 * Run a command and collect its output. Never rejects on a non-zero exit so
 * tests can assert on the code. S3_ENDPOINT_URL is cleared unless `env` sets
 * it, so the developer's shell can't change which branch a script takes.
 */
function run(command, args, { cwd = ROOT, env = {} } = {}) {
  const { S3_ENDPOINT_URL, ...inherited } = process.env
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, env: { ...inherited, ...env } })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => (stdout += chunk))
    child.stderr.on('data', (chunk) => (stderr += chunk))
    child.on('error', reject)
    child.on('close', (code) => resolve({ code, stdout, stderr }))
  })
}

/** Write executable sh stubs into `dir`, keyed by command name. */
async function writeStubs(dir, stubs) {
  for (const [name, body] of Object.entries(stubs)) {
    await writeFile(join(dir, name), `#!/bin/sh\n${body}\n`)
    await chmod(join(dir, name), 0o755)
  }
}

// curl stub that succeeds only for the URLs listed in FAKE_FLOCI_UP
const CURL_STUB = [
  'for url; do :; done',
  'case " $FAKE_FLOCI_UP " in *" $url "*) exit 0 ;; esac',
  'exit 7'
].join('\n')

describe('helper scripts', () => {
  let stubDir
  let workDir

  beforeAll(async () => {
    stubDir = await mkdtemp(join(tmpdir(), 'helper-stubs-'))
    await writeStubs(stubDir, {
      curl: CURL_STUB,
      stu: 'echo "stu $*"',
      // head-object fails (not seeded) unless HEAD_OBJECT_EXIT=0
      aws: [
        'echo "aws $*" >> "$AWS_LOG"',
        '[ "$2" != head-object ] || exit "$HEAD_OBJECT_EXIT"'
      ].join('\n')
    })
  })

  beforeEach(async () => {
    workDir = await mkdtemp(join(tmpdir(), 'helper-work-'))
  })

  afterEach(async () => {
    await rm(workDir, { recursive: true, force: true })
  })

  afterAll(async () => {
    await rm(stubDir, { recursive: true, force: true })
  })

  const stubbedPath = () => `${stubDir}:${process.env.PATH}`

  describe('package.json', () => {
    test('Should only reference script files that exist', async () => {
      const { scripts } = JSON.parse(
        await readFile(join(ROOT, 'package.json'), 'utf8')
      )
      const referenced = Object.values(scripts).flatMap((command) =>
        [...command.matchAll(/scripts\/[\w.-]+/g)].map(([path]) => path)
      )

      expect(referenced).not.toHaveLength(0)
      for (const path of referenced) {
        expect(existsSync(join(ROOT, path)), path).toBe(true)
      }
    })
  })

  describe('floci-endpoint.sh', () => {
    // Run from workDir so each test controls whether a .env exists
    const flociEndpoint = (env = {}) =>
      run('sh', [FLOCI_ENDPOINT], {
        cwd: workDir,
        env: { PATH: stubbedPath(), FAKE_FLOCI_UP: '', ...env }
      })

    test('Should prefer S3_ENDPOINT_URL from the shell', async () => {
      await writeFile(
        join(workDir, '.env'),
        'S3_ENDPOINT_URL=http://from-env-file\n'
      )

      const { stdout } = await flociEndpoint({
        S3_ENDPOINT_URL: 'http://from-shell',
        FAKE_FLOCI_UP: 'http://localhost:4567/'
      })

      expect(stdout.trim()).toBe('http://from-shell')
    })

    test('Should keep an empty S3_ENDPOINT_URL, meaning real AWS', async () => {
      const { stdout } = await flociEndpoint({
        S3_ENDPOINT_URL: '',
        FAKE_FLOCI_UP: 'http://localhost:4567/'
      })

      expect(stdout).toBe('\n')
    })

    test('Should use the last S3_ENDPOINT_URL in .env', async () => {
      await writeFile(
        join(workDir, '.env'),
        'S3_ENDPOINT_URL=http://first\nS3_BUCKET=b\nS3_ENDPOINT_URL=http://last\n'
      )

      const { stdout } = await flociEndpoint({
        FAKE_FLOCI_UP: 'http://localhost:4567/'
      })

      expect(stdout.trim()).toBe('http://last')
    })

    test('Should use the standalone floci on 4567 when it is up', async () => {
      const { stdout } = await flociEndpoint({
        FAKE_FLOCI_UP: 'http://localhost:4567/'
      })

      expect(stdout.trim()).toBe('http://localhost:4567')
    })

    test('Should fall back to the shared floci on 4566', async () => {
      const { stdout } = await flociEndpoint()

      expect(stdout.trim()).toBe('http://localhost:4566')
    })
  })

  describe('20-seed-wahis-fixtures.sh', () => {
    const seed = (env = {}) =>
      run('sh', [SEED_FIXTURES], {
        env: {
          PATH: stubbedPath(),
          AWS_LOG: join(workDir, 'aws.log'),
          HEAD_OBJECT_EXIT: '1',
          FIXTURES: join(ROOT, 'fixtures'),
          ...env
        }
      })

    const awsCalls = async () =>
      (await readFile(join(workDir, 'aws.log'), 'utf8')).trim().split('\n')

    test('Should copy every fixture to its raw WAHIS key', async () => {
      const { code, stdout } = await seed()

      expect(code).toBe(0)
      expect(stdout).toContain('Seeded WAHIS fixtures')
      const copies = (await awsCalls()).filter((call) =>
        call.startsWith('aws s3 cp')
      )
      const keys = copies.map((call) =>
        call.replace(/.* s3:\/\/apha-insights-ingestion-local\//, '')
      )
      expect(keys).toHaveLength(23)
      expect(keys).toEqual(
        expect.arrayContaining([
          'raw/wahis/2026-11-09/reports/186838/report.json',
          'raw/wahis/2026-11-09/reports/186838/outbreaks/198855.json'
        ])
      )
      // The marker goes last, so a partial seed is retried on the next start
      expect(keys.at(-1)).toBe('raw/wahis/2026-11-09/event-filtered-list.json')
    })

    test('Should skip when the fixtures are already seeded', async () => {
      const { code, stdout } = await seed({ HEAD_OBJECT_EXIT: '0' })

      expect(code).toBe(0)
      expect(stdout).toContain('already seeded')
      expect(await awsCalls()).toHaveLength(1)
    })

    test('Should skip when the fixtures are not mounted', async () => {
      const { code, stdout } = await seed({ FIXTURES: workDir })

      expect(code).toBe(0)
      expect(stdout).toContain('No WAHIS fixtures')
      expect(existsSync(join(workDir, 'aws.log'))).toBe(false)
    })
  })

  describe('npm run transform:wahis', () => {
    let fakeS3

    beforeAll(async () => {
      fakeS3 = await startFakeS3(() =>
        xml(
          '<ListBucketResult><Name>test-bucket</Name>' +
            '<IsTruncated>false</IsTruncated></ListBucketResult>'
        )
      )
    })

    afterAll(async () => {
      await fakeS3.close()
    })

    test(
      'Should run a dry run against S3_ENDPOINT_URL',
      async () => {
        const { code, stdout, stderr } = await run(
          'npm',
          ['run', 'transform:wahis', '--', '--dry-run'],
          {
            env: {
              S3_ENDPOINT_URL: fakeS3.endpoint,
              S3_BUCKET: 'test-bucket',
              AWS_ACCESS_KEY_ID: 'test',
              AWS_SECRET_ACCESS_KEY: 'test'
            }
          }
        )

        expect(code, stderr).toBe(0)
        expect(stdout).toContain('[]')
        const [list] = fakeS3.requests
        expect(list.url.pathname).toBe('/test-bucket/')
        expect(list.url.searchParams.get('prefix')).toBe('raw/wahis/')
      },
      SCRIPT_TIMEOUT_MS
    )
  })

  describe('npm run s3:local', () => {
    test(
      'Should open stu on the floci endpoint with path-style addressing',
      async () => {
        const { code, stdout, stderr } = await run(
          'npm',
          ['run', '--silent', 's3:local', '--', '--prefix', 'raw/'],
          {
            env: {
              PATH: stubbedPath(),
              S3_ENDPOINT_URL: 'http://localhost:4567',
              S3_BUCKET: 'test-bucket'
            }
          }
        )

        expect(code, stderr).toBe(0)
        expect(stdout.trim()).toBe(
          'stu --endpoint-url http://localhost:4567 --region eu-west-2 ' +
            '--path-style always --bucket test-bucket --prefix raw/'
        )
      },
      SCRIPT_TIMEOUT_MS
    )
  })
})
