import { error, Router, createCors } from 'itty-router';

const { preflight, corsify } = createCors({
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
});
const router = Router();

async function proxy (request: Request, env: Env) {
  let url = new URL(request.url);
  const proxyUrl = `${env.PROXY_DOMAIN}${url.pathname}`;
  switch (request.method) {
    case 'GET':
      return await fetch(proxyUrl, {
        method: request.method,
        headers: request.headers,
      });
    case 'POST':
    case 'PUT':
    case 'PATCH':
    case 'DELETE':
      return await fetch(proxyUrl, {
        method: request.method,
        body: request.body,
        headers: request.headers,
      });
    default:
      return error(405);
  }
}

async function createNewRequest(request: Request): Promise<Request> {
  const { url, method, headers } = request;
  if (method === 'GET' || method === 'HEAD') {
    return new Request(url, { method, headers });
  } else {
    const body = await request.text();
    return new Request(url, { method, headers, body });
  }
}

type Message = {
  url: string;
  method: string;
  headers: Headers;
  body?: string;
}

type MessageBatch = {
  messages: string;
  retryAll: () => void;
}

router
  .all('*', preflight)
  .all('/webhook/:id', async (request: Request, env: Env, _: ExecutionContext) => {
    const newRequest = await createNewRequest(request);

    const response = await proxy(newRequest, env);
    const status = response.status;
    if (status >= 500 && status < 600) {
      await env.ERROR_QUEUE.send(JSON.stringify({
        url: request.url,
        method: request.method,
        headers: request.headers,
        body: request.body,
      }));
      return error(202, 'Request sent to error queue.')
    }
    return response;

  })
  .all(`/webhook-test/:id`, async (request: Request, env: Env, _: ExecutionContext) => {
  const response = await proxy(request, env);
  console.log('Response:', response);
  return response;
  })
  .all('*', () => error(404));

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
      return router.handle(request, env, ctx).then(corsify);
  },
  async queue(batch: MessageBatch, env: Env): Promise<void> {
    for (const message of batch.messages) {
      try {
        const json = JSON.parse(Object(message).body) as Message;
        const request = new Request(json.url, {
          method: json.method,
          headers: json.headers,
          body: json.body || null,
        });
        const response = await proxy(request, env);
        console.log(response);
      } catch (error) {
        batch.retryAll();
      }
    }
  }
};
