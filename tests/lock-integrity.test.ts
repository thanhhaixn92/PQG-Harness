import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import test from 'node:test'
import { lockPackageEntry, verifySubresourceIntegrity } from '../scripts/lib/lock-integrity.mjs'

test('verifySubresourceIntegrity accepts a matching supported digest', () => {
  const bytes = Buffer.from('pqg-integrity-test')
  const digest = createHash('sha512').update(bytes).digest('base64')
  assert.doesNotThrow(() => verifySubresourceIntegrity(bytes, `sha512-${digest}`))
})

test('verifySubresourceIntegrity rejects changed bytes', () => {
  const expected = Buffer.from('expected')
  const digest = createHash('sha384').update(expected).digest('base64')
  assert.throws(
    () => verifySubresourceIntegrity(Buffer.from('changed'), `sha384-${digest}`),
    /integrity/i,
  )
})

test('verifySubresourceIntegrity accepts any matching supported candidate', () => {
  const bytes = Buffer.from('candidate')
  const good = createHash('sha256').update(bytes).digest('base64')
  assert.doesNotThrow(() => verifySubresourceIntegrity(bytes, `sha512-deadbeef sha256-${good}`))
})

test('lockPackageEntry resolves one package from lockfile packages', () => {
  const lock = { packages: { 'node_modules/example': { version: '1.2.3', integrity: 'sha512-test' } } }
  assert.deepEqual(lockPackageEntry(lock, 'example'), { version: '1.2.3', integrity: 'sha512-test' })
  assert.throws(() => lockPackageEntry(lock, 'missing'), /package-lock/i)
})
