import { afterEach, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { callWorker, makeEnv, stubOrigin, worker, type QueueStub } from './helpers.ts';

describe('proxy smoke tests', () => {
  let origin: ReturnType<typeof stubOrigin>;

  beforeEach(() => {
    origin = stubOrigin({ status: 200, body: 'ok' });
  });

  afterEach(() => {
    origin.restore();
  });

  test('an unknown path returns 404 and reaches no origin', async () => {
    const { env } = makeEnv();
    const res = await callWorker(new Request('https://proxy.test/nope'), env);
    assert.equal(res.status, 404);
    assert.equal(origin.requests.length, 0);
  });

  test('POST /webhook/x is forwarded to the origin with its method', async () => {
    const { env } = makeEnv();
    const res = await callWorker(
      new Request('https://proxy.test/webhook/x', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ hello: 'world' }),
      }),
      env,
    );
    assert.equal(res.status, 200);
    assert.equal(origin.requests.length, 1);
    assert.equal(origin.requests[0].url, 'https://origin.test/webhook/x');
    assert.equal(origin.requests[0].method, 'POST');
    assert.equal(new TextDecoder().decode(origin.requests[0].body), '{"hello":"world"}');
  });
});

describe('error queue', () => {
  let origin: ReturnType<typeof stubOrigin>;

  beforeEach(() => {
    origin = stubOrigin({ status: 502, body: 'bad gateway' });
  });

  afterEach(() => {
    origin.restore();
  });

  const post = () =>
    new Request('https://proxy.test/webhook/x', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-trace': 'abc' },
      body: JSON.stringify({ hello: 'wörld' }),
    });

  test('a 502 from the origin queues the original body and headers', async () => {
    const { env, queue } = makeEnv();
    const res = await callWorker(post(), env);
    assert.equal(res.status, 202);
    assert.equal(queue.sent.length, 1);
    const message = JSON.parse(queue.sent[0]);
    assert.equal(message.url, 'https://proxy.test/webhook/x');
    assert.equal(message.method, 'POST');
    assert.equal(message.headers['content-type'], 'application/json');
    assert.equal(message.headers['x-trace'], 'abc');
    assert.equal(new TextDecoder().decode(Buffer.from(message.body, 'base64')), '{"hello":"wörld"}');
  });

  test('queue() resends the queued body and headers to the origin', async () => {
    const { env, queue } = makeEnv();
    await callWorker(post(), env);
    origin.reply({ status: 200, body: 'ok' });
    const before = origin.requests.length;
    await worker.queue({ messages: [{ body: queue.sent[0] }], retryAll: () => assert.fail('retried') } as never, env);
    assert.equal(origin.requests.length, before + 1);
    const resent = origin.requests[before];
    assert.equal(resent.method, 'POST');
    assert.equal(resent.headers.get('content-type'), 'application/json');
    assert.equal(resent.headers.get('x-trace'), 'abc');
    assert.equal(new TextDecoder().decode(resent.body), '{"hello":"wörld"}');
  });

  test('a body over the queue limit is not queued and the origin 502 reaches the client', async () => {
    const { env, queue } = makeEnv();
    (env as unknown as { ERROR_QUEUE: QueueStub }).ERROR_QUEUE.send = async (message: string) => {
      if (message.length > 128 * 1024) throw new Error('message too large');
      queue.sent.push(message);
    };
    const res = await callWorker(
      new Request('https://proxy.test/webhook/x', {
        method: 'POST',
        body: new Uint8Array(200 * 1024).fill(97),
      }),
      env,
    );
    assert.equal(res.status, 502);
    assert.equal(queue.sent.length, 0);
  });

  test('a 90 KB body with every byte value survives 502, the queue and queue()', async () => {
    const { env, queue } = makeEnv();
    const bytes = new Uint8Array(90 * 1024).map((_, i) => i % 256);
    await callWorker(
      new Request('https://proxy.test/webhook/x', {
        method: 'POST',
        headers: { 'content-type': 'application/octet-stream' },
        body: bytes,
      }),
      env,
    );
    assert.equal(queue.sent.length, 1);
    origin.reply({ status: 200, body: 'ok' });
    const before = origin.requests.length;
    await worker.queue({ messages: [{ body: queue.sent[0] }], retryAll: () => assert.fail('retried') } as never, env);
    assert.deepEqual(origin.requests[before].body, bytes);
  });
});
