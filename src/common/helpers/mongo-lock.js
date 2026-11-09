const lockFailureMessage = (resource) =>
  `Failed to acquire lock for ${resource}`

export async function acquireLock(locker, resource, logger) {
  const lock = await locker.lock(resource)
  if (!lock) {
    logger?.error(lockFailureMessage(resource))
    return null
  }
  return lock
}

export async function requireLock(locker, resource) {
  const lock = await locker.lock(resource)
  if (!lock) {
    throw new Error(lockFailureMessage(resource))
  }
  return lock
}
