import { afterEach, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { callWorker, makeEnv, stubOrigin } from './helpers.ts';

describe('request bodies are forwarded byte for byte', () => {
  let origin: ReturnType<typeof stubOrigin>;

  beforeEach(() => {
    origin = stubOrigin({ status: 200, body: 'ok' });
  });

  afterEach(() => {
    origin.restore();
  });

  async function post(body: Uint8Array | string, contentType: string) {
    const { env } = makeEnv();
    const res = await callWorker(
      new Request('https://proxy.test/webhook/x', {
        method: 'POST',
        headers: { 'content-type': contentType },
        body,
      }),
      env,
    );
    assert.equal(res.status, 200);
    assert.equal(origin.requests.length, 1);
    return origin.requests[0].body;
  }

  test('every byte value 0..255 arrives unchanged', async () => {
    const sent = Uint8Array.from({ length: 256 }, (_, i) => i);
    const received = await post(sent, 'application/octet-stream');
    assert.deepEqual(Array.from(received), Array.from(sent));
  });

  test('a multipart/form-data body with a binary PDF-like file arrives identical', async () => {
    const enc = new TextEncoder();
    const boundary = 'xBOUNDARYx';
    const pdf = Uint8Array.from([
      ...enc.encode('%PDF-1.4\n%'),
      0xe2,
      0xe3,
      0xcf,
      0xd3,
      0x00,
      0xff,
      0xfe,
      0x80,
      0x81,
      0x0d,
      0x0a,
      ...enc.encode('\nendobj\n%%EOF'),
    ]);
    const parts = [
      enc.encode(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="a.pdf"\r\nContent-Type: application/pdf\r\n\r\n`),
      pdf,
      enc.encode(`\r\n--${boundary}--\r\n`),
    ];
    const sent = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
    let offset = 0;
    for (const p of parts) {
      sent.set(p, offset);
      offset += p.length;
    }
    const received = await post(sent, `multipart/form-data; boundary=${boundary}`);
    assert.deepEqual(Array.from(received), Array.from(sent));
  });

  test('a JSON body arrives unchanged', async () => {
    const json = JSON.stringify({ hello: 'world', unicode: 'héllo ✓', n: [1, 2, 3] });
    const received = await post(json, 'application/json');
    assert.equal(new TextDecoder().decode(received), json);
  });
});
