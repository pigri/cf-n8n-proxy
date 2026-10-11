// Shared stubs for the Worker tests: a fake origin behind globalThis.fetch and a minimal env.
import worker from '../src/index.ts';

export type Recorded = {
  url: string;
  method: string;
  headers: Headers;
  body: Uint8Array;
};

export type OriginReply = {
  status?: number;
  body?: BodyInit | null;
  headers?: HeadersInit;
};

export type QueueStub = {
  sent: string[];
  send: (message: string) => Promise<void>;
};

const realFetch = globalThis.fetch;

// Replaces globalThis.fetch with a stub that records every request and answers with `reply`.
// Call restore() when done.
export function stubOrigin(reply: OriginReply = {}) {
  const requests: Recorded[] = [];
  const config: OriginReply = { status: 200, body: 'ok', ...reply };
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    // Node's Request needs duplex when the Worker passes a stream body; workerd does not.
    const request = new Request(input, { ...init, duplex: 'half' } as RequestInit);
    requests.push({
      url: request.url,
      method: request.method,
      headers: request.headers,
      body: new Uint8Array(await request.arrayBuffer()),
    });
    return new Response(config.body ?? null, { status: config.status, headers: config.headers });
  }) as typeof fetch;
  return {
    requests,
    reply: (next: OriginReply) => Object.assign(config, next),
    restore: () => {
      globalThis.fetch = realFetch;
    },
  };
}

export function stubQueue(): QueueStub {
  const sent: string[] = [];
  return {
    sent,
    send: async (message: string) => {
      sent.push(message);
    },
  };
}

export function makeEnv(overrides: Record<string, unknown> = {}) {
  const queue = stubQueue();
  const env = {
    PROXY_DOMAIN: 'https://origin.test',
    RATELIMITING_ENABLED: false,
    DEDUPLICATION_ENABLED: false,
    ERROR_QUEUE: queue,
    ...overrides,
  } as unknown as Env;
  return { env, queue };
}

export const ctx = {
  waitUntil: () => {},
  passThroughOnException: () => {},
} as unknown as ExecutionContext;

export function callWorker(request: Request, env: Env): Promise<Response> {
  return worker.fetch(request, env, ctx);
}

export { worker };
