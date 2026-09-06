type MakersAdapterInput = {
  moduleId: string
  bridge: {
    registerModuleTool(
      moduleId: string,
      name: string,
      config: Record<string, unknown>,
      callback: () => Promise<{ content: Array<{ type: 'text'; text: string }> }>,
    ): unknown
  }
}

export function apply({ moduleId, bridge }: MakersAdapterInput) {
  bridge.registerModuleTool(
    moduleId,
    'pqg_reference_probe',
    { description: 'Report that the PQG reference module Makers adapter is active.', inputSchema: {} },
    async () => ({
      content: [{
        type: 'text',
        text: JSON.stringify({ ok: true, moduleId }),
      }],
    }),
  )
}
