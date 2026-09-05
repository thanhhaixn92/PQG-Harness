export function apply({ moduleId, bridge }) {
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
