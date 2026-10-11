import { afterEach, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { callWorker, makeEnv, stubOrigin } from './helpers.ts';

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
