import assert from 'node:assert/strict'
import test from 'node:test'
import { onRequest } from '../agents/api/makers.preview.ts'

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
      getHost: () => 'https://9000-test.sandbox.example.com',
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
