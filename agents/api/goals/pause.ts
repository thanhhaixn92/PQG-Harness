import { onRequest as proxyRequest } from "../_proxy.ts"

export async function onRequest(context: any): Promise<Response> {
  return proxyRequest(context)
}
