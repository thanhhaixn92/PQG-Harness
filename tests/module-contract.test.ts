import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

const modulePath = new URL('../config/modules.mjs', import.meta.url)

async function writeJson(path: string, value: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`)
}

test('discovers only direct dependencies that declare pqg.module metadata', async () => {
  assert.equal(existsSync(modulePath), true, 'config/modules.mjs must provide module discovery')
  const { discoverPqgModules } = await import(modulePath.href)
  const root = await mkdtemp(join(tmpdir(), 'pqg-modules-'))

  try {
    await writeJson(join(root, 'package.json'), {
      dependencies: {
        '@pqg/plugin-task': '1.0.0',
        ordinary: '1.0.0',
      },
    })
    await mkdir(join(root, 'node_modules', '@pqg', 'plugin-task'), { recursive: true })
    await writeJson(join(root, 'node_modules', '@pqg', 'plugin-task', 'package.json'), {
      name: '@pqg/plugin-task',
      pqg: {
        module: {
          id: 'task',
          label: 'Công việc',
          defaultEnabled: false,
        },
      },
      dsh: { client: { platform: 'web' } },
      exports: {
        './client': './lib/client.js',
        './makers': './lib/makers.js',
      },
    })
    await mkdir(join(root, 'node_modules', 'ordinary'), { recursive: true })
    await writeJson(join(root, 'node_modules', 'ordinary', 'package.json'), {
      name: 'ordinary',
      version: '1.0.0',
    })
    await mkdir(join(root, 'node_modules', 'transitive-pqg'), { recursive: true })
    await writeJson(join(root, 'node_modules', 'transitive-pqg', 'package.json'), {
      name: 'transitive-pqg',
      pqg: { module: { id: 'transitive', label: 'Transitive', defaultEnabled: true } },
    })

    assert.deepEqual(await discoverPqgModules(root), [{
      id: 'task',
      label: 'Công việc',
      packageName: '@pqg/plugin-task',
      defaultEnabled: false,
      client: true,
      makers: true,
    }])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
