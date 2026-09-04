export interface LockPackageEntry {
  version: string
  resolved?: string
  integrity: string
  [key: string]: unknown
}

export function lockPackageEntry(lock: unknown, name: string): LockPackageEntry
export function verifySubresourceIntegrity(bytes: Uint8Array, integrity: string): true
