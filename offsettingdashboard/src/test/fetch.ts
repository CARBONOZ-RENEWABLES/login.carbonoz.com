import { vi } from 'vitest'

/**
 * jsdom's AbortSignal is not accepted by Node's Request, which RTK Query uses.
 * Tests replace both with minimal stand-ins and answer requests from `handler`.
 */
export interface Call {
  url: string
  method: string
  body: string
}

export function stubApi(handler: (call: Call) => { status?: number; body: unknown } | Promise<{ status?: number; body: unknown }>) {
  const calls: Call[] = []
  class TestRequest {
    url: string
    method: string
    headers: Headers
    private body: unknown
    constructor(input: string | URL, init: RequestInit = {}) {
      this.url = String(input)
      this.method = init.method ?? 'GET'
      this.headers = new Headers(init.headers)
      this.body = init.body
    }
    clone() {
      return this
    }
    async text() {
      return typeof this.body === 'string' ? this.body : ''
    }
  }
  vi.stubGlobal('Request', TestRequest)
  vi.stubGlobal(
    'fetch',
    vi.fn(async (req: TestRequest) => {
      const call = { url: req.url, method: req.method, body: await req.text() }
      calls.push(call)
      const r = await handler(call)
      return new Response(JSON.stringify(r.body), { status: r.status ?? 200, headers: { 'content-type': 'application/json' } })
    }),
  )
  return calls
}
