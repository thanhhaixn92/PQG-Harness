import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '../../application-shell/src/contracts.ts'

const inject = ['slots']

function ReferenceShellProof(_props: PropsRuntime<'pqg.shell.proof'>): string {
  return 'PQG shell proof contribution'
}

function apply(ctx: ClientContext): void {
  ctx.slots.inject('pqg.shell.proof', () => ctx.slots.register({
    name: 'pqg.shell.proof',
    id: 'pqg-reference-proof',
    order: 0,
    label: 'Reference proof',
  }, ReferenceShellProof))
}

module.exports = { inject, apply }
