import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type { PropsRenderSlots, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from './contracts.ts'

type RootProps = PropsRuntime<'root'> & PropsRenderSlots<'pqg.shell.proof'>

const inject = ['slots']

function PqgApplicationShellProof({ renderSlot }: RootProps) {
  return renderSlot('pqg.shell.proof', {}, { fallback: null })
}

function apply(ctx: ClientContext): void {
  ctx.slots.register({
    name: 'root',
    children: {
      'pqg.shell.proof': { kind: 'list', scope: 'root' },
    },
  }, PqgApplicationShellProof)
}

module.exports = { inject, apply }
