import path from 'node:path';
import { Store } from './store.js';
import { generate, type GenerateInput } from './openai.js';
import type { Run } from '../src/types.js';

type Generator = (input: GenerateInput) => Promise<{ bytes: Buffer; name: string }>;
export class Queue {
  private active = new Map<string, Promise<void>>();
  constructor(private store: Store, private generator: Generator = generate) {}
  async pump() {
    // Claim synchronously before starting workers so overlapping submissions cannot duplicate jobs.
    for (const run of this.store.list<Run>('run').reverse()) {
      if (run.kind === 'upscale') continue;
      for (const job of run.jobs) {
        if (job.status !== 'queued' || this.active.has(job.id)) continue;
        job.status = 'generating';
        this.store.put('run', run.id, run);
        const work = Promise.resolve().then(() => this.execute(run, job.id)).finally(() => this.active.delete(job.id));
        this.active.set(job.id, work);
      }
    }
    await Promise.all(this.active.values());
  }
  async retry(runId: string, jobId: string) {
    const run = this.store.get<Run>('run', runId), job = run?.jobs.find(item => item.id === jobId);
    if (!run || !job || !['failed', 'interrupted'].includes(job.status)) throw new Error('Only a failed image can be retried.');
    const finishing = this.active.get(jobId);
    if (finishing) await finishing;
    const reset = this.store.retryJob(runId, jobId);
    void this.pump();
    return reset;
  }
  private async execute(run: Run, jobId: string) {
    const job = run.jobs.find(j => j.id === jobId)!;
    let patch: { status: 'succeeded'; assetId: string } | { status: 'failed'; error: string };
    try {
      const result = await this.generator({ prompt: run.draft.prompt, references: run.draft.referenceIds.map(id => this.store.assetPath(id)), directory: path.join(this.store.root, 'jobs', job.id), quality: run.draft.quality });
      const asset = await this.store.addAsset(result.bytes, `studio-${run.id.slice(0, 8)}-${job.index + 1}${path.extname(result.name)}`);
      patch = { assetId: asset.id, status: 'succeeded' };
      this.store.put('meta', 'verified', true);
    } catch (err) {
      patch = { status: 'failed', error: err instanceof Error ? err.message : 'Generation failed. Your inputs are saved.' };
    }
    // Other workers may have finished this same run; merge only this job into the latest record.
    const latest = this.store.get<Run>('run', run.id)!;
    Object.assign(latest.jobs.find(j => j.id === jobId)!, patch);
    this.store.put('run', latest.id, latest);
  }
}
