import {
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client
} from '@aws-sdk/client-s3'

import { config } from '#/config.js'

/**
 * Create an S3 client and JSON helpers bound to one bucket.
 * floci has no wildcard DNS for bucket subdomains, so an endpoint override
 * forces path-style addressing.
 * @param {object} [options]
 * @param {string} [options.bucket] Bucket name
 * @param {string|null} [options.endpoint] Endpoint override, null for AWS
 * @param {string} [options.region] AWS region
 * @param {S3Client} [options.client] Pre-built client, for tests
 */
export function createS3Store({
  bucket = config.get('aws.s3.bucket'),
  endpoint = config.get('aws.s3.endpoint'),
  region = config.get('aws.region'),
  client = new S3Client({
    region,
    ...(endpoint && { endpoint, forcePathStyle: true })
  })
} = {}) {
  return {
    bucket,

    async listKeys(prefix) {
      const keys = []
      let ContinuationToken
      do {
        const page = await client.send(
          new ListObjectsV2Command({
            Bucket: bucket,
            Prefix: prefix,
            ContinuationToken
          })
        )
        keys.push(...(page.Contents ?? []).map(({ Key }) => Key))
        ContinuationToken = page.NextContinuationToken
      } while (ContinuationToken)
      return keys
    },

    /**
     * @returns {Promise<{ body: any, lastModified: Date } | null>} Parsed JSON,
     * or null when the key does not exist
     */
    async getJson(key) {
      try {
        const res = await client.send(
          new GetObjectCommand({ Bucket: bucket, Key: key })
        )
        return {
          body: JSON.parse(await res.Body.transformToString()),
          lastModified: res.LastModified
        }
      } catch (error) {
        if (error.name === 'NoSuchKey') {
          return null
        }
        throw error
      }
    },

    async putJson(key, body) {
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: JSON.stringify(body, null, 2),
          ContentType: 'application/json'
        })
      )
    }
  }
}
