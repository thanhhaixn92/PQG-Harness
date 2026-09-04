import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import {
  lockPackageEntry,
  verifySubresourceIntegrity,
} from '../scripts/lib/lock-integrity.mjs'

function sri(algorithm: 'sha256' | 'sha384' | 'sha512', bytes: Uint8Array): string {
  return `${algorithm}-${createHash(algorithm).update(bytes).digest('base64')}`
}

test('verifySubresourceIntegrity accepts any matching supported SRI candidate', () => {
  const bytes = Buffer.from('pqg-native-tarball')
  const integrity = `sha1-ignored ${sri('sha256', Buffer.from('wrong'))} ${sri('sha512', bytes)}`
  assert.equal(verifySubresourceIntegrity(bytes, integrity), true)
})

test('verifySubresourceIntegrity rejects mutated bytes and unsupported-only metadata', () => {
  const expected = Buffer.from('expected-native-tarball')
  const mutated = Buffer.from('mutated-native-tarball')
  assert.throws(
    () => verifySubresourceIntegrity(mutated, sri('sha512', expected)),
    /integrity/i,
  )
  assert.throws(
    () => verifySubresourceIntegrity(expected, 'sha1-deadbeef'),
    /supported integrity/i,
  )
})

test('lockPackageEntry returns the exact package entry and requires registry integrity', async () => {
  const lock = JSON.parse(await readFile(new URL('../package-lock.json', import.meta.url), 'utf8'))
  const entry = lockPackageEntry(lock, '@img/sharp-linux-x64')
  assert.equal(typeof entry.version, 'string')
  assert.match(String(entry.integrity), /^sha(?:256|384|512)-/)

  assert.throws(
    () => lockPackageEntry({ packages: {} }, '@img/sharp-linux-x64'),
    /lock entry/i,
  )
})
