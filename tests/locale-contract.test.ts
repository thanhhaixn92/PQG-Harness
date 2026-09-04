import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('prepared locale uses browser language and not deployment hostname', async () => {
  const source = await readFile(new URL('../public/plugins/@deepseek-ai/dsh-client-locale/client.js', import.meta.url), 'utf8')
  assert.match(source, /navigator\.languages/)
  assert.match(source, /navigator\.language/)
  assert.doesNotMatch(source, /location\.hostname\.endsWith/)
})
