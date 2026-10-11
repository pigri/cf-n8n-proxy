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
    const kv = stubKv();
    const { env } = makeEnv({ DEDUPLICATION_ENABLED: true, DEDUPLICATION_KV: kv });
    const first = await callWorker(post([1, 2, 3]), env);
    assert.equal(first.status, 200);
    const second = await callWorker(post([4, 5, 6]), env);
    assert.equal(second.status, 200);
    assert.equal(origin.requests.length, 2);
    assert.equal(kv.store.size, 2);
  });

  test('a 500 from the origin is not remembered: the retry is forwarded', async () => {
    const kv = stubKv();
    const { env } = makeEnv({ DEDUPLICATION_ENABLED: true, DEDUPLICATION_KV: kv });
    origin.reply({ status: 500, body: 'boom' });
    const first = await callWorker(post([1, 2, 3]), env);
    assert.equal(first.status, 500);
    assert.equal(kv.store.size, 0);
    origin.reply({ status: 200, body: 'ok' });
    const retry = await callWorker(post([1, 2, 3]), env);
    assert.equal(retry.status, 200);
    assert.equal(origin.requests.length, 2);
    assert.equal(kv.store.size, 1);
  });

  for (const status of [404, 400]) {
    test(`a ${status} from the origin is not remembered`, async () => {
      const kv = stubKv();
      const { env } = makeEnv({ DEDUPLICATION_ENABLED: true, DEDUPLICATION_KV: kv });
      origin.reply({ status, body: 'no' });
      await callWorker(post([1, 2, 3]), env);
      assert.equal(kv.store.size, 0);
    });
  }

  test('with deduplication off the request is not cloned and the KV is not touched', async () => {
    const touched: string[] = [];
    const kv = {
      get: async () => (touched.push('get'), null),
      put: async () => void touched.push('put'),
      delete: async () => void touched.push('delete'),
    };
    const { env } = makeEnv({ DEDUPLICATION_ENABLED: false, DEDUPLICATION_KV: kv });
    const realClone = Request.prototype.clone;
    let clones = 0;
    Request.prototype.clone = function (this: Request) {
      clones++;
      return realClone.call(this);
    };
    try {
      const res = await callWorker(post([1, 2, 3]), env);
      assert.equal(res.status, 200);
    } finally {
      Request.prototype.clone = realClone;
    }
    assert.equal(clones, 0);
    assert.deepEqual(touched, []);
    assert.deepEqual([...origin.requests[0].body], [1, 2, 3]);
  });

  test('with deduplication on the request is not cloned and the origin gets the same bytes', async () => {
    const { env } = makeEnv({ DEDUPLICATION_ENABLED: true, DEDUPLICATION_KV: stubKv() });
    const realClone = Request.prototype.clone;
    let clones = 0;
    Request.prototype.clone = function (this: Request) {
      clones++;
      return realClone.call(this);
    };
    try {
      await callWorker(post([1, 2, 3]), env);
    } finally {
      Request.prototype.clone = realClone;
    }
    assert.equal(clones, 0);
    assert.deepEqual([...origin.requests[0].body], [1, 2, 3]);
  });
});
