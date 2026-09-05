export {}

type ClientContext = {
  slots: {
    inject(name: string, register: () => unknown): unknown
    register(options: Record<string, unknown>, component: () => unknown): unknown
  }
}

const inject = ['slots']

function ReferenceModuleSection(): string {
  return 'Reference Module'
}

function apply(ctx: ClientContext): void {
  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'pqg-reference-module',
    order: 19,
    label: () => 'Reference Module',
  }, ReferenceModuleSection))
}

module.exports = { inject, apply }
