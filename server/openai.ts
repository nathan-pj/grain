import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import type { Connection, ImageQuality } from '../src/types.js';

export const openAIKeyPath = path.join(os.homedir(), 'Library/Application Support/local.images.desktop/openai-key');
const qualities = new Set<ImageQuality>(['low', 'medium', 'high', 'xhigh', 'max']);

export function openAIKey(file = openAIKeyPath) {
  return process.env.OPENAI_API_KEY || (existsSync(file) ? readFileSync(file, 'utf8').trim() : '');
}

export function openAIConfigured(file = openAIKeyPath) { return Boolean(openAIKey(file)); }

export function saveOpenAIKey(value: string, file = openAIKeyPath) {
  const key = value.trim();
  if (!key.startsWith('sk-') || key.length < 10) throw new Error('Enter a valid OpenAI API key.');
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, key, { mode: 0o600 });
  chmodSync(file, 0o600);
}

export async function connection(): Promise<Connection> {
  const connected = openAIConfigured();
  return { connected, verified: connected, message: connected ? 'Sunburst ready.' : 'Add an OpenAI API key to use Sunburst.' };
}

const sizes: Record<string, string> = {
  '1:1': '1024x1024', '3:2': '1536x1024', '2:3': '1024x1536',
  '16:9': '1536x864', '9:16': '864x1536', '4:3': '1344x1008', '3:4': '1008x1344',
  '21:9': '1792x768', '27:16': '1728x1024', '16:27': '1024x1728',
  '9:8': '1152x1024', '8:9': '1024x1152'
};
export function sunburstSize(prompt: string) {
  const ratio = prompt.match(/(?:\n|^)Make it (1:1|3:2|2:3|16:9|9:16|4:3|3:4|21:9|27:16|16:27|9:8|8:9)\s*$/)?.[1];
  return ratio ? sizes[ratio] : '1024x1024';
}

export type GenerateInput = { prompt: string; references: string[]; directory: string; quality?: ImageQuality; onProgress?: (text: string) => void };
type Fetcher = typeof fetch;

export async function sunburstGenerate(input: GenerateInput, request: Fetcher = fetch, suppliedKey = openAIKey()): Promise<{ bytes: Buffer; name: string }> {
  if (!suppliedKey) throw new Error('Add an OpenAI API key to use Sunburst.');
  const quality = input.quality && qualities.has(input.quality) ? input.quality : 'high';
  const common = { model: 'gpt-image-2.5-sunburst', prompt: input.prompt, quality, size: sunburstSize(input.prompt), output_format: 'png' };
  input.onProgress?.('Generating with Sunburst');
  let response: Response;
  if (input.references.length) {
    const form = new FormData();
    Object.entries(common).forEach(([key, value]) => form.append(key, value));
    for (const reference of input.references) {
      const bytes = await readFile(reference);
      const type = reference.toLowerCase().endsWith('.jpg') || reference.toLowerCase().endsWith('.jpeg') ? 'image/jpeg' : reference.toLowerCase().endsWith('.webp') ? 'image/webp' : 'image/png';
      form.append('image[]', new Blob([bytes], { type }), path.basename(reference));
    }
    response = await request('https://api.openai.com/v1/images/edits', { method: 'POST', headers: { Authorization: `Bearer ${suppliedKey}` }, body: form, signal: AbortSignal.timeout(15 * 60_000) });
  } else {
    response = await request('https://api.openai.com/v1/images/generations', { method: 'POST', headers: { Authorization: `Bearer ${suppliedKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify(common), signal: AbortSignal.timeout(15 * 60_000) });
  }
  const payload = await response.json() as { data?: { b64_json?: string }[]; error?: { message?: string; code?: string } };
  if (!response.ok) {
    if (response.status === 401) throw new Error('OpenAI rejected the API key. Replace it in Grain.');
    if (response.status === 429) throw new Error('OpenAI rate limit reached. Wait a moment or check your API usage tier.');
    if (response.status === 400 && /verification/i.test(payload.error?.message || '')) throw new Error('OpenAI requires organization verification before Sunburst can generate images.');
    throw new Error((payload.error?.message || `OpenAI returned ${response.status}.`).slice(0, 500));
  }
  const encoded = payload.data?.[0]?.b64_json;
  if (!encoded) throw new Error('Sunburst returned no image.');
  return { bytes: Buffer.from(encoded, 'base64'), name: 'sunburst.png' };
}

export const generate = sunburstGenerate;
