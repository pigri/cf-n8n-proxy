import { AutoRouter, cors, error } from 'itty-router';
import { xxhash64 } from 'cf-workers-hash';

const { preflight } = cors();
const router = AutoRouter({});

function generateKey(request: Request, body: string): Promise<string> {
  const url = new URL(request.url);
  const contentLength = new TextEncoder().encode(body).length;
  return xxhash64(`${request.method}-${url.pathname}-${body}-${contentLength}`);
}

interface OperationType {
  operation: 'save' | 'delete' | 'check';
}

async function deduplication(request: Request, env: Env, type: OperationType): Promise<boolean> {
  try {
    if (!env.DEDUPLICATION_ENABLED) return false;

    let body: string;
    try {
      body = await request.text();
    } catch (e) {
      console.error(JSON.stringify(e));
      return false;
    }

    let key: string;
    try {
      key = await generateKey(request, body);
    } catch (e) {
      console.error(JSON.stringify(e));
      return false;
    }

    if (type.operation === 'check') {
      let value: string | null;
      try {
        value = await env.DEDUPLICATION_KV.get(key);
      } catch (e) {
        console.error(JSON.stringify(e));
        return false;
      }

      if (value === null) {
        console.debug(`Deduplication key not found: ${key}`);
        return false;
      }

      console.debug(`Deduplication key found: ${key}`);
      return true;
    } else if (type.operation === 'delete') {
      try {
        await env.DEDUPLICATION_KV.delete(key);
        return true;
      } catch (e) {
        console.error(JSON.stringify(e));
        return false;
      }
    } else if (type.operation === 'save') {
      const ttl = env.DEDUPLICATION_TTL || 60;
      try {
        await env.DEDUPLICATION_KV.put(key, 'true', { expirationTtl: ttl });
        return true;
      } catch (e) {
        console.error(JSON.stringify(e));
        return false;
      }
    }
    return false;
  } catch (e) {
    console.log('deduplication error');
    console.error(JSON.stringify(e));
    return false;
  }
}

async function proxyTest(request: Request, env: Env): Promise<Response> {
  let url = new URL(request.url);
  const proxyUrl = `${env.PROXY_DOMAIN}${url.pathname}`;
  switch (request.method) {
    case 'GET':
      const res = await fetch(proxyUrl, {
        method: request.method,
        headers: request.headers,
      });
      return new Response(await res.text(), {
        status: res.status,
        statusText: res.statusText,
        headers: res.headers,
      });
    case 'POST':
    case 'PUT':
    case 'PATCH':
    case 'DELETE':
      try {
        const res = await fetch(proxyUrl, {
          method: request.method,
          body: request.body,
          headers: request.headers,
        });
        return new Response(await res.text(), {
          status: res.status,
          statusText: res.statusText,
          headers: res.headers,
        });
      } catch (e) {
        console.error(JSON.stringify(e));
        return error(500);
      }
    case 'OPTIONS':
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD',
          'Access-Control-Allow-Headers': '*',
          'Access-Control-Max-Age': '86400',
        },
      });
    case 'HEAD':
      return new Response(null, {
        status: 200,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD',
          'Access-Control-Allow-Headers': '*',
          'Access-Control-Max-Age': '86400',
        },
      });
    default:
      return error(405);
  }
}

async function proxy(request: Request, env: Env): Promise<Response> {
  let url = new URL(request.url);
  const proxyUrl = `${env.PROXY_DOMAIN}${url.pathname}`;
  switch (request.method) {
    case 'GET':
      if (env.RATELIMITING_ENABLED) {
        const ipAddress = request.headers.get('cf-connecting-ip') || '';
        const { success } = await env.RATELIMITER.limit({ key: ipAddress });
        const { pathname } = new URL(request.url);

        if (!success) {
          return new Response(`429 Failure – rate limit exceeded for ${pathname}`, { status: 429 });
        }
      }
      const res = await fetch(proxyUrl, {
        method: request.method,
        headers: request.headers,
      });
      return new Response(await res.text(), {
        status: res.status,
        statusText: res.statusText,
        headers: res.headers,
      });
    case 'POST':
    case 'PUT':
    case 'PATCH':
    case 'DELETE':
      try {
        if (env.RATELIMITING_ENABLED) {
          const ipAddress = request.headers.get('cf-connecting-ip') || '';
          const { success } = await env.RATELIMITER.limit({ key: ipAddress });
          const { pathname } = new URL(request.url);

          if (!success) {
            return new Response(`429 Failure – rate limit exceeded for ${pathname}`, { status: 429 });
          }
        }

        const requestClone = request.clone();
        const deduplicationStatus = await deduplication(requestClone, env, { operation: 'check' });

        if (deduplicationStatus) {
          console.error('Deduplication check failed or request is duplicated');
          return error(409, 'Conflict: Request is considered a duplicate.');
        }

        const res = await fetch(proxyUrl, {
          method: request.method,
          body: request.body,
          headers: request.headers,
        });

        if (res.status >= 500 && res.status < 600) {
          console.error('5xx error');
          return new Response(null, {
            status: res.status,
            statusText: res.statusText,
            headers: res.headers,
          });
        }
        if (res.status == 404) {
          console.error('404 error');
          return new Response(null, {
            status: res.status,
            statusText: res.statusText,
            headers: res.headers,
          });
        }
        if (res.body) {
          await deduplication(request, env, { operation: 'save' });
          return new Response(await res.text(), {
            status: res.status,
            statusText: res.statusText,
            headers: res.headers,
          });
        } else {
          await deduplication(request, env, { operation: 'save' });
          return new Response(null, {
            status: res.status,
            statusText: res.statusText,
            headers: res.headers,
          });
        }
      } catch (e) {
        console.error(`Error details: ${JSON.stringify(e, Object.getOwnPropertyNames(e))}`);
        await deduplication(request, env, { operation: 'delete' });
        return error(500);
      }
    case 'OPTIONS':
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD',
          'Access-Control-Allow-Headers': '*',
          'Access-Control-Max-Age': '86400',
        },
      });
    case 'HEAD':
      return new Response(null, {
        status: 200,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD',
          'Access-Control-Allow-Headers': '*',
          'Access-Control-Max-Age': '86400',
        },
      });
    default:
      return error(405);
  }
}

async function createNewRequest(request: Request, body: Uint8Array | null): Promise<Request> {
  try {
    const { url, method, headers } = request;
    if (body === null) {
      return new Request(url, { method, headers });
    } else {
      return new Request(url, { method, headers, body });
    }
  } catch (e) {
    throw e;
  }
}

type Message = {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string; // base64 of the original body bytes
};

// Cloudflare Queues rejects messages over 128 KB.
const MAX_QUEUE_MESSAGE_LENGTH = 128 * 1024;

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

function fromBase64(text: string): Uint8Array {
  return Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
}

type MessageBatch = {
  messages: string;
  retryAll: () => void;
};

router
  .all('*', preflight)
  .all('/webhook/:id', async (request: Request, env: Env, _: ExecutionContext) => {
    try {
      const isBodyless = request.method === 'GET' || request.method === 'HEAD';
      const bytes = isBodyless ? null : new Uint8Array(await request.arrayBuffer());
      const newRequest = await createNewRequest(request, bytes);
      const response = await proxy(newRequest, env);
      const responseClone = response.clone();
      const status = response.status;
      if (status >= 502 && status < 503) {
        const message = JSON.stringify({
          url: request.url,
          method: request.method,
          headers: Object.fromEntries(request.headers),
          body: bytes && bytes.length > 0 ? toBase64(bytes) : undefined,
        });
        if (message.length > MAX_QUEUE_MESSAGE_LENGTH) {
          console.error(`Request too large for the error queue (${message.length} > ${MAX_QUEUE_MESSAGE_LENGTH}); not queued.`);
          return response;
        }
        await env.ERROR_QUEUE.send(message);
        return error(202, 'Request sent to error queue.');
      }
      console.info(
        JSON.stringify({
          status: response.status,
          statusText: response.statusText,
          headers: response.headers,
          body: await responseClone.text(),
        }),
      );
      return response;
    } catch (e) {
      console.error(`Error details: ${JSON.stringify(e, Object.getOwnPropertyNames(e))}`);
      return error(500, 'Something went wrong');
    }
  })
  .all(`/webhook-test/:id`, async (request: Request, env: Env, _: ExecutionContext) => {
    try {
      const response = await proxyTest(request, env);
      const responseClone = response.clone();
      console.info(
        JSON.stringify({
          status: response.status,
          statusText: response.statusText,
          headers: response.headers,
          body: await responseClone.text(),
        }),
      );
      return response;
    } catch (e) {
      console.error(JSON.stringify(e));
      return error(500, 'Something went wrong');
    }
  })
  .all('*', () => error(404));

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    return router.fetch(request, env, ctx);
  },
  async queue(batch: MessageBatch, env: Env): Promise<void> {
    for (const message of batch.messages) {
      try {
        const json = JSON.parse(Object(message).body) as Message;
        const request = new Request(json.url, {
          method: json.method,
          headers: json.headers,
          body: json.body ? fromBase64(json.body) : null,
        });
        const response = await proxy(request, env);
        console.error(JSON.stringify(response));
      } catch (error) {
        batch.retryAll();
      }
    }
  },
};
