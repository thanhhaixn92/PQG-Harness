import assert from 'node:assert/strict'
import test from 'node:test'

import { createShellSystemServices } from '../packages/application-shell/src/services.ts'

function fakeSessions() {
  let approvalResult: unknown
  const prompts: unknown[] = []
  let cancelled = 0
  const wait = {
    kind: 'approval' as const,
    key: 'a:1',
    sessionId: 'session-1',
    payload: {
      approvalId: 'approval-1',
      toolName: 'write_file',
      reason: 'Ghi thay đổi vào tài liệu',
    },
    async respond(result: unknown) {
      approvalResult = result
      return { accepted: true }
    },
  }
  return {
    sessions: {
      list: {
        getSnapshot: () => ({ current: 'session-1' }),
      },
      binding: (id: string) => id === 'session-1'
        ? {
            session: {
              getSnapshot: () => ({ pending: [wait] }),
              async prompt(content: unknown, mode: unknown) {
                prompts.push({ content, mode })
                return { ok: true, value: { accepted: true } }
              },
              async cancel() {
                cancelled++
                return { ok: true, value: { accepted: true } }
              },
            },
          }
        : undefined,
    },
    approvalResult: () => approvalResult,
    prompts: () => prompts,
    cancelled: () => cancelled,
  }
}

test('system services aggregate deterministic search/support providers and dispose cleanly', async () => {
  const fixture = fakeSessions()
  const services = createShellSystemServices(fixture.sessions as never)

  const disposeA = services.registerSearchProvider({
    id: 'alpha',
    label: 'Alpha',
    async search(query) {
      return query === 'pqg'
        ? [{ id: 'one', label: 'Một', description: 'A', targetId: 'alpha' }]
        : []
    },
  })
  services.registerSearchProvider({
    id: 'beta',
    label: 'Beta',
    async search(query) {
      return query === 'pqg'
        ? [{ id: 'two', label: 'Hai', description: 'B', targetId: 'beta' }]
        : []
    },
  })
  const disposeSupport = services.registerSupportProvider({
    id: 'alpha',
    supportFor(activeId) {
      return activeId === 'alpha'
        ? {
            title: 'Alpha',
            summary: 'Ngữ cảnh Alpha',
            suggestions: [{ id: 'help', label: 'Hỗ trợ Alpha' }],
          }
        : undefined
    },
  })

  assert.deepEqual(
    (await services.search('pqg')).map(item => `${item.providerId}:${item.id}`),
    ['alpha:one', 'beta:two'],
  )
  assert.equal(services.supportFor('alpha')?.summary, 'Ngữ cảnh Alpha')

  disposeA()
  disposeSupport()
  assert.deepEqual((await services.search('pqg')).map(item => item.providerId), ['beta'])
  assert.equal(services.supportFor('alpha'), undefined)
})

test('support adapter sends text through the current DSH session and can stop it', async () => {
  const fixture = fakeSessions()
  const services = createShellSystemServices(fixture.sessions as never)

  await services.promptSupport('Tóm tắt việc hôm nay', {
    title: 'Trợ lý công việc',
    summary: 'Xem, tạo và cập nhật công việc.',
  })
  await services.stopSupport()

  assert.deepEqual(fixture.prompts(), [{
    content: [{ type: 'text', text: [
      'Bạn là Trợ lý hỗ trợ của PQG Harness. Hãy trả lời bằng tiếng Việt.',
      'Ngữ cảnh mô-đun: Trợ lý công việc',
      'Khả năng hiện có: Xem, tạo và cập nhật công việc.',
      'Khi yêu cầu cần thao tác dữ liệu, hãy dùng capability của mô-đun; nếu thiếu thông tin để tạo hoặc cập nhật, hãy hỏi lại ngắn gọn.',
      'Yêu cầu của người dùng: Tóm tắt việc hôm nay',
    ].join('\n\n') }],
    mode: 'queue',
  }])
  assert.equal(fixture.cancelled(), 1)
})

test('search keeps healthy results when a provider throws before returning a promise', async () => {
  const fixture = fakeSessions()
  const services = createShellSystemServices(fixture.sessions as never)

  services.registerSearchProvider({
    id: 'broken',
    label: 'Broken',
    search() {
      throw new Error('provider failed before returning a promise')
    },
  })
  services.registerSearchProvider({
    id: 'healthy',
    label: 'Healthy',
    async search() {
      return [{ id: 'result', label: 'Kết quả', targetId: 'healthy' }]
    },
  })

  assert.deepEqual(
    (await services.search('pqg')).map(item => `${item.providerId}:${item.id}`),
    ['healthy:result'],
  )
})

test('notification surface and approval adapter reuse the canonical DSH pending carrier', async () => {
  const fixture = fakeSessions()
  const services = createShellSystemServices(fixture.sessions as never)
  const notifications: string[] = []
  const disposeNotifications = services.subscribeNotifications(notification => {
    notifications.push(notification.message)
  })

  services.notify({ message: 'Đã lưu', kind: 'success' })
  assert.deepEqual(notifications, ['Đã lưu'])

  const approval = services.currentApproval()
  assert.equal(approval?.toolName, 'write_file')
  assert.equal(approval?.reason, 'Ghi thay đổi vào tài liệu')
  assert.equal(approval?.risk, 'requires-confirmation')
  assert.ok(approval)

  await services.answerApproval(approval, 'allowed-once')
  assert.deepEqual(fixture.approvalResult(), {
    ok: true,
    value: {
      sessionId: 'session-1',
      approvalId: 'approval-1',
      outcome: 'allowed-once',
    },
  })

  disposeNotifications()
  services.notify({ message: 'Không nhận', kind: 'info' })
  assert.deepEqual(notifications, ['Đã lưu'])
})
