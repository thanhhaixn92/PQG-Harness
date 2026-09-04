export interface PQGProduct {
  readonly name: 'PQG Harness'
  readonly shortName: 'PQG'
  readonly repositoryUrl: 'https://github.com/thanhhaixn92/PQG-Harness'
  readonly upstreamAdapterUrl: 'https://github.com/TencentEdgeOne/deepseek-harness'
  readonly upstreamCoreUrl: 'https://github.com/deepseek-ai/deepseek-harness'
}

export const product: Readonly<PQGProduct>
