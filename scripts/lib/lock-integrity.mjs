import { createHash, timingSafeEqual } from 'node:crypto'

const SUPPORTED_ALGORITHMS = new Set(['sha256', 'sha384', 'sha512'])

export function lockPackageEntry(lock, name) {
  const entry = lock?.packages?.[`node_modules/${name}`]
  if (!entry || typeof entry !== 'object') {
    throw new Error(`package-lock entry is missing for ${name}.`)
  }
  if (typeof entry.version !== 'string' || !entry.version) {
    throw new Error(`package-lock entry for ${name} has no version.`)
  }
  if (typeof entry.integrity !== 'string' || !entry.integrity.trim()) {
    throw new Error(`package-lock entry for ${name} has no registry integrity.`)
  }
  return entry
}

export function verifySubresourceIntegrity(bytes, integrity) {
  const candidates = String(integrity || '')
    .trim()
    .split(/\s+/)
    .map(candidate => {
      const separator = candidate.indexOf('-')
      if (separator <= 0) return undefined
      const algorithm = candidate.slice(0, separator).toLowerCase()
      const digest = candidate.slice(separator + 1)
      if (!SUPPORTED_ALGORITHMS.has(algorithm) || !digest) return undefined
      return { algorithm, digest }
    })
    .filter(Boolean)

  if (candidates.length === 0) {
    throw new Error('No supported integrity candidate was provided.')
  }

  for (const candidate of candidates) {
    const expected = Buffer.from(candidate.digest, 'base64')
    const actual = createHash(candidate.algorithm).update(bytes).digest()
    if (expected.length === actual.length && timingSafeEqual(expected, actual)) return true
  }

  throw new Error('Package integrity verification failed.')
}
