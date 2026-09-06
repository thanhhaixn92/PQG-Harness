import assert from 'node:assert/strict'
import test from 'node:test'
import { onRequest } from '../agents/api/makers.preview.ts'
import { publishWorkspacePreview } from '../agents/_workspace.ts'

test('browser preview route redirects without serializing sandbox credential in a response body', async () => {
  const context = {
    conversation_id: 'conv-1',
    request: { method: 'GET' },
    store: {
      async getConversation({ conversationId }: { conversationId: string }) {
        assert.equal(conversationId, 'conv-1')
        return { metadata: { preview: { published: true } } }
      },
    },
    sandbox: {
      commands: {
        run: async () => ({ exitCode: 0, stdout: '', stderr: '' }),
      },
      getHost(port: number) {
        assert.equal(port, 9000)
        return 'https://9000-test.sandbox.example.com'
      },
      envdAccessToken: 'secret-token',
    },
  }

  const response = await onRequest(context)
  assert.equal(response.status, 302)
  assert.equal(response.headers.get('cache-control'), 'no-store')
  assert.equal(response.headers.get('referrer-policy'), 'no-referrer')
  const location = response.headers.get('location') || ''
  assert.match(location, /^https:\/\/9000-test\.sandbox\.example\.com\/preview\//)
  assert.match(location, /access_token=secret-token/)
  assert.equal(await response.text(), '')
})

test('browser preview route rejects requests without a conversation id', async () => {
  const response = await onRequest({ conversation_id: '', request: { method: 'GET' } })
  assert.equal(response.status, 400)
  assert.equal(response.headers.get('cache-control'), 'no-store')
})

test('published preview stays published when the internal server is temporarily unhealthy', async () => {
  let metadataWrites = 0
  const response = await onRequest({
    conversation_id: 'conv-1',
    request: { method: 'GET' },
    store: {
      async getConversation() {
        return { metadata: { preview: { published: true, framework: 'static' } } }
      },
      async updateConversation() {
        metadataWrites += 1
      },
    },
    sandbox: {
      commands: {
        run: async () => ({ exitCode: 1, stdout: '', stderr: '' }),
      },
    },
  })

  assert.equal(response.status, 503)
  assert.equal(metadataWrites, 0)
})

test('preview status store outage is surfaced as service unavailable', async () => {
  const response = await onRequest({
    conversation_id: 'conv-1',
    request: { method: 'GET' },
    store: {
      async getConversation() {
        throw new Error('store unavailable')
      },
    },
  })

  assert.equal(response.status, 503)
  assert.deepEqual(await response.json(), {
    published: false,
    error: 'PREVIEW_STATUS_UNAVAILABLE',
  })
})

test('static preview stages a safe document root instead of serving the workspace directly', async () => {
  const commands: string[] = []
  const context = {
    sandbox: {
      files: {
        makeDir: async () => {},
        exists: async (path: string) => path.endsWith('/.pqg-workspace-ready'),
      },
      commands: {
        async run(command: string) {
          commands.push(command)
          return { exitCode: 0, stdout: '', stderr: '' }
        },
      },
    },
    store: {
      async getConversation() {
        return { metadata: {} }
      },
      async updateConversation() {},
    },
  }

  await publishWorkspacePreview(context, 'conv-1')

  const stage = commands.find(command => command.includes('/tmp/dsh-preview-static/preview')) || ''
  const start = commands.find(command => command.includes('python3 -m http.server')) || ''
  assert.match(stage, /-type f/)
  assert.match(stage, /\.env/)
  assert.match(stage, /\.key/)
  assert.doesNotMatch(stage, /find -L/)
  assert.match(start, /--directory ['"]?\/tmp\/dsh-preview-static['"]?/)
  assert.doesNotMatch(start, /ln -sfn \. preview/)
})
