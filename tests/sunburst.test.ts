import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { saveOpenAIKey, sunburstGenerate, sunburstSize } from '../server/openai.js';
import { saveFalKey } from '../server/fal.js';

test('Sunburst maps the prompt ratio to a supported output size', () => {
  assert.equal(sunburstSize('A portrait\nMake it 2:3'), '1024x1536');
  assert.equal(sunburstSize('A wide scene\nMake it 16:9'), '1536x864');
  assert.equal(sunburstSize('No explicit ratio'), '1024x1024');
});

test('OpenAI key is stored locally with owner-only permissions', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'grain-openai-'));
  const file = path.join(root, 'openai-key');
  try {
    saveOpenAIKey('  sk-test-local-key  ', file);
    assert.equal(readFileSync(file, 'utf8'), 'sk-test-local-key');
    assert.equal(statSync(file).mode & 0o777, 0o600);
    assert.throws(() => saveOpenAIKey('', file), /valid OpenAI API key/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('fal key is stored locally with owner-only permissions', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'grain-fal-'));
  const file = path.join(root, 'fal-key');
  try {
    saveFalKey('  test-fal-key-value  ', file);
    assert.equal(readFileSync(file, 'utf8'), 'test-fal-key-value');
    assert.equal(statSync(file).mode & 0o777, 0o600);
    assert.throws(() => saveFalKey('short', file), /valid fal API key/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('Sunburst generation sends explicit model, quality and size without references', async () => {
  let request: { url: string; init?: RequestInit } | undefined;
  const image = Buffer.from('generated-image');
  const result = await sunburstGenerate(
    { prompt: 'A studio portrait\nMake it 1:1', references: [], directory: '/tmp/unused', quality: 'xhigh' },
    async (url, init) => {
      request = { url: String(url), init };
      return new Response(JSON.stringify({ data: [{ b64_json: image.toString('base64') }] }), { status: 200, headers: { 'content-type': 'application/json' } });
    },
    'sk-test'
  );
  assert.equal(request?.url, 'https://api.openai.com/v1/images/generations');
  assert.equal(request?.init?.headers && new Headers(request.init.headers).get('Authorization'), 'Bearer sk-test');
  assert.deepEqual(JSON.parse(String(request?.init?.body)), {
    model: 'gpt-image-2.5-sunburst', prompt: 'A studio portrait\nMake it 1:1', quality: 'xhigh', size: '1024x1024', output_format: 'png'
  });
  assert.deepEqual(result, { bytes: image, name: 'sunburst.png' });
});

test('Sunburst sends ordered references to the edits endpoint', async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'grain-reference-'));
  const first = path.join(root, 'one.png'), second = path.join(root, 'two.jpg');
  await import('node:fs/promises').then(fs => Promise.all([fs.writeFile(first, 'one'), fs.writeFile(second, 'two')]));
  let body: FormData | undefined;
  try {
    await sunburstGenerate(
      { prompt: 'Combine these', references: [first, second], directory: root, quality: 'medium' },
      async (_url, init) => { body = init?.body as FormData; return new Response(JSON.stringify({ data: [{ b64_json: Buffer.from('ok').toString('base64') }] }), { status: 200 }); },
      'sk-test'
    );
    assert.equal(body?.get('model'), 'gpt-image-2.5-sunburst');
    assert.equal(body?.get('quality'), 'medium');
    assert.equal(body?.getAll('image[]').length, 2);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
