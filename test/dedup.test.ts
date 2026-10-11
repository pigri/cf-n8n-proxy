import { afterEach, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { callWorker, makeEnv, stubOrigin } from './helpers.ts';

function stubKv() {
  const store = new Map<string, string>();
  return {
    store,
    get: async (key: string) => store.get(key) ?? null,
    put: async (key: string, value: string) => {
      store.set(key, value);
    },
    delete: async (key: string) => {
      store.delete(key);
    },
  };
}

function post(bytes: number[]) {
  return new Request('https://proxy.test/webhook/x', {
    method: 'POST',
    headers: { 'content-type': 'application/octet-stream' },
    body: new Uint8Array(bytes),
  });
}

describe('deduplication', () => {
  let origin: ReturnType<typeof stubOrigin>;

  beforeEach(() => {
    origin = stubOrigin({ status: 200, body: 'ok' });
  });

  afterEach(() => {
    origin.restore();
  });

  test('the same body twice: the second is refused with 409', async () => {
    const { env } = makeEnv({ DEDUPLICATION_ENABLED: true, DEDUPLICATION_KV: stubKv() });
    const first = await callWorker(post([1, 2, 3]), env);
    assert.equal(first.status, 200);
    const second = await callWorker(post([1, 2, 3]), env);
    assert.equal(second.status, 409);
    assert.equal(origin.requests.length, 1);
  });

  test('different bodies are both forwarded', async () => {
    const { env } = makeEnv({ DEDUPLICATION_ENABLED: true, DEDUPLICATION_KV: stubKv() });
    const first = await callWorker(post([1, 2, 3]), env);
    assert.equal(first.status, 200);
    const second = await callWorker(post([4, 5, 6]), env);
    assert.equal(second.status, 200);
    assert.equal(origin.requests.length, 2);
  });
});
