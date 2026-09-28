import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { Store, emptyDraft } from '../server/store.js';
import { Queue } from '../server/queue.js';
import { allowedOutput, extractPaths, isSubscriptionLogin, subscriptionEnv } from '../server/codex.js';
import type { Run } from '../src/types.js';

async function fixture() { return sharp({ create: { width: 80, height: 60, channels: 3, background: '#3752ca' } }).png().toBuffer(); }
function fresh() { const root = mkdtempSync(path.join(os.tmpdir(), 'studio-test-')); const store = new Store(root); return { root, store, cleanup: () => { store.close(); rmSync(root, { recursive: true, force: true }); } }; }
test('original bytes and ordered references survive reopening; invalid drafts are rejected', async () => {
 const f = fresh(); try {
  const bytes = await fixture(); const a = await f.store.addAsset(bytes, 'ref.png');
  assert.deepEqual(readFileSync(f.store.assetPath(a.id)), bytes);
  f.store.put('draft', 'current', { prompt: 'Product photo', referenceIds: [a.id], count: 4 });
  f.store.close(); f.store = new Store(f.root);
  assert.equal(f.store.state().draft.referenceIds[0], a.id);
  assert.throws(() => f.store.validateDraft({ ...emptyDraft(), count: 9 }));
  assert.throws(() => f.store.validateDraft({ ...emptyDraft(), referenceIds: ['missing'] }));
  assert.throws(() => f.store.validateDraft({ ...emptyDraft(), referenceIds: [a.id, a.id] }));
  assert.throws(() => f.store.validateDraft({ ...emptyDraft(), prompt: 'x'.repeat(20001) }));
  assert.equal(f.store.validateDraft({ ...emptyDraft(), quality: 'max' }).quality, 'max');
  assert.throws(() => f.store.validateDraft({ ...emptyDraft(), quality: 'ultra' }));
  await assert.rejects(() => f.store.addAsset(Buffer.from('<svg></svg>'), 'fake.png'));
 } finally { f.store.close(); rmSync(f.root, { recursive: true, force: true }); }
});
test('submission ID deduplicates and immutable snapshot is retained', () => {
 const f = fresh(); try { const draft = { ...emptyDraft(), prompt: 'Original' }; f.store.createRun('same', draft, 'tab-a'); draft.prompt = 'Changed'; f.store.createRun('same', draft, 'tab-b'); assert.equal(f.store.list('run').length, 1); assert.equal(f.store.get<Run>('run','same')?.draft.prompt, 'Original'); assert.equal(f.store.get<Run>('run','same')?.generatorTabId, 'tab-a'); } finally { f.cleanup(); }
});
test('partial batch keeps originals and progresses past failure; concurrent pump does not duplicate', async () => {
 const f = fresh(); try { const image = await fixture(); let calls = 0; const queue = new Queue(f.store, async () => { calls++; if (calls === 2) throw new Error('Subscription limit'); await new Promise(r => setTimeout(r, 20)); return { bytes: image, name: 'output.png' }; }); f.store.createRun('batch', { ...emptyDraft(), prompt: 'A photo', count: 3 }); await Promise.all([queue.pump(), queue.pump()]); const run = f.store.get<Run>('run','batch')!; assert.deepEqual(run.jobs.map(j=>j.status), ['succeeded','failed','succeeded']); assert.equal(calls, 3); assert.equal(f.store.list('asset').length, 2); } finally { f.cleanup(); }
});

test('retry resets only the failed job in place and preserves its run and position', async () => {
 const f = fresh(); try {
  const image = await fixture(); let calls = 0;
  const queue = new Queue(f.store, async () => { calls++; if (calls === 1) throw new Error('Temporary API failure'); return { bytes: image, name: 'output.png' }; });
  const run = f.store.createRun('retry-in-place', { ...emptyDraft(), prompt: 'Photo', count: 1 }, 'tab-one');
  const jobId = run.jobs[0].id;
  await queue.pump();
  assert.equal(f.store.get<Run>('run', run.id)!.jobs[0].status, 'failed');
  await queue.retry(run.id, jobId);
  await queue.pump();
  const retried = f.store.get<Run>('run', run.id)!;
  assert.equal(f.store.list<Run>('run').length, 1);
  assert.equal(retried.jobs.length, 1);
  assert.equal(retried.jobs[0].id, jobId);
  assert.equal(retried.jobs[0].index, 0);
  assert.equal(retried.jobs[0].status, 'succeeded');
  assert.equal(retried.generatorTabId, 'tab-one');
 } finally { f.cleanup(); }
});
test('restart preserves finished jobs and interrupts uncertain work without resubmitting', async () => {
 const f = fresh(); try { const run = f.store.createRun('recovery', { ...emptyDraft(), prompt:'A photo', count:3 }); run.jobs[0].status='succeeded'; run.jobs[1].status='generating'; f.store.put('run',run.id,run); f.store.recover(); assert.deepEqual(f.store.get<Run>('run','recovery')!.jobs.map(j=>j.status), ['succeeded','interrupted','interrupted']); let called=false; await new Queue(f.store, async()=>{called=true;throw new Error('Unexpected');}).pump(); assert.equal(called,false); } finally { f.cleanup(); }
});
test('only ChatGPT login qualifies; API auth and environment keys are excluded', () => {
 assert.equal(isSubscriptionLogin('Logged in using ChatGPT'),true); assert.equal(isSubscriptionLogin('Logged in using an API key'),false);
 process.env.OPENAI_API_KEY='test-secret'; process.env.CODEX_API_KEY='test-secret'; assert.equal(subscriptionEnv().OPENAI_API_KEY,undefined); assert.equal(subscriptionEnv().CODEX_API_KEY,undefined); delete process.env.OPENAI_API_KEY; delete process.env.CODEX_API_KEY;
});
test('result parser finds original paths; arbitrary and stale files are rejected', () => {
 const root=mkdtempSync(path.join(os.tmpdir(),'studio-path-')); try { const file=path.join(root,'generated.png');writeFileSync(file,'fixture'); assert.equal(allowedOutput(file,root,Date.now()),true); assert.equal(allowedOutput(file,path.join(root,'other'),Date.now()),false); assert.equal(allowedOutput(file,root,Date.now()+10000),false); assert.deepEqual(extractPaths(`[Image](${file})`),[file]); assert.deepEqual(extractPaths(file),[file]); } finally {rmSync(root,{recursive:true,force:true});}
});

test('delete survives restart and undo preserves originals, sibling results, and references', async () => {
 const f = fresh(); try {
  const bytes = await fixture(), a = await f.store.addAsset(bytes, 'result.png'), b = await f.store.addAsset(bytes, 'other.png');
  const run = f.store.createRun('deletion', { prompt: 'Original prompt', count: 2, referenceIds: [] });
  run.jobs.forEach((j, i) => { j.status = 'succeeded'; j.assetId = [a.id, b.id][i]; }); f.store.put('run', run.id, run);
  const draft = { prompt: 'Reuse this', referenceIds: [a.id], count: 1 }; f.store.put('draft', 'current', draft);
  f.store.setAssetDeleted(a.id, true); f.store.close(); f.store = new Store(f.root);
  assert.ok(f.store.state().assets[a.id].deletedAt);
  assert.equal(f.store.state().assets[b.id].deletedAt, undefined);
  assert.deepEqual(f.store.validateDraft(draft), { ...draft, quality: 'high' });
  assert.deepEqual(readFileSync(f.store.assetPath(a.id)), bytes);
  f.store.setAssetDeleted(a.id, false);
  assert.equal(f.store.state().assets[a.id].deletedAt, undefined);
  assert.deepEqual(f.store.get<Run>('run', run.id), run);
  assert.throws(() => f.store.setAssetDeleted('missing', true));
 } finally { f.store.close(); rmSync(f.root, { recursive: true, force: true }); }
});

test('all jobs start concurrently across batches; out-of-order finishes preserve siblings', async () => {
 const f = fresh(); try {
  const bytes = await fixture();
  const started: string[] = [], releases = new Map<string, (fail?: boolean) => void>();
  const queue = new Queue(f.store, input => new Promise((resolve, reject) => {
   const id = path.basename(input.directory); started.push(id);
   releases.set(id, fail => fail ? reject(new Error('Provider limit')) : resolve({ bytes, name: 'image.png' }));
  }));
  const runs = Array.from({length: 4}, (_, i) => f.store.createRun(`parallel-${i}`, { prompt: 'Photo', referenceIds: [], count: 4 }));
  const first = queue.pump(), duplicate = queue.pump();
  await new Promise(r => setImmediate(r));
  assert.equal(started.length, 16); assert.equal(new Set(started).size, 16);
  assert.ok(f.store.list<Run>('run').every(r => r.jobs.every(j => j.status === 'generating')));
  const extra = f.store.createRun('arriving', { prompt: 'Another', referenceIds: [], count: 1 });
  const arriving = queue.pump(); await new Promise(r => setImmediate(r));
  assert.equal(started.length, 17);
  for (const id of [...started].reverse()) releases.get(id)!(id === runs[0].jobs[1].id);
  await Promise.all([first, duplicate, arriving]);
  assert.equal(f.store.list<Run>('run').flatMap(r => r.jobs).filter(j => j.status === 'succeeded').length, 16);
  assert.equal(f.store.get<Run>('run', runs[0].id)!.jobs[1].status, 'failed');
  assert.equal(f.store.get<Run>('run', extra.id)!.jobs[0].status, 'succeeded');
  assert.equal(f.store.list('asset').length, 16);
 } finally { f.cleanup(); }
});

test('hiding an active job stays hidden after completion and can be restored', async () => {
 const f=fresh();try {
  const bytes=await fixture();let release!:()=>void;
  const queue=new Queue(f.store,()=>new Promise(resolve=>{release=()=>resolve({bytes,name:'result.png'});}));
  const run=f.store.createRun('hidden-job',{prompt:'Photo',referenceIds:[],count:1});
  const pending=queue.pump();await new Promise(r=>setImmediate(r));
  f.store.setJobHidden(run.id,run.jobs[0].id,true);release();await pending;
  const result=f.store.get<Run>('run',run.id)!;
  assert.equal(result.jobs[0].status,'succeeded');assert.ok(result.jobs[0].hiddenAt);assert.ok(result.jobs[0].assetId);
  f.store.setJobHidden(run.id,run.jobs[0].id,false);assert.equal(f.store.get<Run>('run',run.id)!.jobs[0].hiddenAt,undefined);
 }finally{f.cleanup();}
});
