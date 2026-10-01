import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import type { Asset, Draft, ImageQuality, Run, Setup, StudioState } from '../src/types.js';

export const emptyDraft = (): Draft => ({ prompt: '', referenceIds: [], count: 1, quality: 'high' });
export class Store {
  db: DatabaseSync;
  constructor(public root: string) {
    mkdirSync(path.join(root, 'media'), { recursive: true });
    mkdirSync(path.join(root, 'jobs'), { recursive: true });
    this.db = new DatabaseSync(path.join(root, 'studio.sqlite'));
    this.db.exec('PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS records (kind TEXT NOT NULL,id TEXT NOT NULL,value TEXT NOT NULL,PRIMARY KEY(kind,id))');
  }
  get<T>(kind: string, id: string): T | undefined {
    const row = this.db.prepare('SELECT value FROM records WHERE kind=? AND id=?').get(kind, id) as { value: string } | undefined;
    return row ? JSON.parse(row.value) : undefined;
  }
  list<T>(kind: string): T[] {
    return (this.db.prepare('SELECT value FROM records WHERE kind=? ORDER BY rowid DESC').all(kind) as { value: string }[]).map(r => JSON.parse(r.value));
  }
  put(kind: string, id: string, value: unknown) {
    this.db.prepare('INSERT INTO records(kind,id,value) VALUES(?,?,?) ON CONFLICT(kind,id) DO UPDATE SET value=excluded.value').run(kind, id, JSON.stringify(value));
  }
  delete(kind: string, id: string) { this.db.prepare('DELETE FROM records WHERE kind=? AND id=?').run(kind, id); }
  state(): StudioState {
    return { draft: this.get<Draft>('draft', 'current') ?? emptyDraft(), assets: Object.fromEntries(this.list<Asset>('asset').map(a => [a.id, a])), setups: this.list<Setup>('setup'), runs: this.list<Run>('run') };
  }
  setAssetDeleted(id: string, deleted: boolean): Asset {
    const asset = this.get<Asset>('asset', id);
    if (!asset || !this.list<Run>('run').some(r => r.jobs.some(j => j.assetId === id))) throw new Error('Generated image not found.');
    if (deleted) asset.deletedAt ??= new Date().toISOString();
    else delete asset.deletedAt;
    this.put('asset', id, asset);
    return asset;
  }
  setJobHidden(runId: string, jobId: string, hidden: boolean) {
    const run = this.get<Run>('run', runId), job = run?.jobs.find(j => j.id === jobId);
    if (!run || !job) throw new Error('Image job not found.');
    if (hidden) job.hiddenAt ??= new Date().toISOString(); else delete job.hiddenAt;
    this.put('run', run.id, run); return run;
  }
  retryJob(runId: string, jobId: string) {
    const run = this.get<Run>('run', runId), job = run?.jobs.find(item => item.id === jobId);
    if (!run || run.kind === 'upscale' || !job) throw new Error('Image job not found.');
    if (!['failed', 'interrupted'].includes(job.status)) throw new Error('Only a failed image can be retried.');
    job.status = 'queued';
    delete job.error;
    delete job.assetId;
    this.put('run', run.id, run);
    return run;
  }
  validateDraft(input: unknown): Draft {
    const d = input as Partial<Draft> | null;
    if (!d || typeof d.prompt !== 'string' || d.prompt.length > 20000) throw new Error('Use a prompt of at most 20,000 characters.');
    if (!Number.isInteger(d.count) || d.count! < 1 || d.count! > 4) throw new Error('Choose between 1 and 4 images.');
    if (!Array.isArray(d.referenceIds) || d.referenceIds.length > 20 || new Set(d.referenceIds).size !== d.referenceIds.length) throw new Error('Use up to twenty distinct reference images.');
    if (d.referenceIds.some(id => typeof id !== 'string' || !this.get<Asset>('asset', id))) throw new Error('A reference image is missing. Add it again.');
    const quality = d.quality ?? 'high';
    if (!(['low', 'medium', 'high', 'xhigh', 'max'] as ImageQuality[]).includes(quality)) throw new Error('Choose a valid image quality.');
    if (d.provider !== undefined && !['openai', 'higgsfield', 'codex'].includes(d.provider)) throw new Error('Choose a valid provider.');
    if (d.resolution !== undefined && !['1k', '2k', '4k'].includes(d.resolution)) throw new Error('Choose a valid resolution.');
    if (d.higgsfieldModel !== undefined && (typeof d.higgsfieldModel !== 'string' || !/^[a-z0-9_]+$/.test(d.higgsfieldModel))) throw new Error('Invalid Higgsfield model.');
    if (d.higgsfieldOptions !== undefined && (!d.higgsfieldOptions || Array.isArray(d.higgsfieldOptions) || typeof d.higgsfieldOptions !== 'object' || JSON.stringify(d.higgsfieldOptions).length > 40000)) throw new Error('Invalid model options.');
    return { ...(d.higgsfieldModel ? {higgsfieldModel:d.higgsfieldModel} : {}), ...(d.higgsfieldOptions ? {higgsfieldOptions:d.higgsfieldOptions} : {}), prompt: d.prompt, count: d.count!, referenceIds: [...d.referenceIds], quality, ...(d.provider ? { provider: d.provider } : {}), ...(d.resolution ? { resolution: d.resolution } : {}) };
  }
  assetPath(id: string, thumbnail = false) {
    const asset = this.get<Asset>('asset', id);
    if (!asset) throw new Error('Image not found.');
    return path.join(this.root, 'media', `${asset.id}${thumbnail ? '.thumb.webp' : extFor(asset.mime)}`);
  }
  async addAsset(bytes: Buffer, name: string, maxBytes = 20 * 1024 * 1024): Promise<Asset> {
    if (bytes.length > maxBytes) throw new Error('Each image must be 20 MB or smaller.');
    let meta;
    try { meta = await sharp(bytes, { limitInputPixels: 50_000_000 }).metadata(); }
    catch { throw new Error('This file could not be read as an image. Use PNG, JPEG, or WebP.'); }
    if (!['png', 'jpeg', 'webp'].includes(meta.format ?? '') || !meta.width || !meta.height || (meta.pages ?? 1) > 1) throw new Error('Use a still PNG, JPEG, or WebP image.');
    const id = randomUUID();
    const mime = `image/${meta.format}`;
    const thumb = await sharp(bytes).rotate().resize(640, 640, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 82 }).toBuffer();
    writeFileSync(path.join(this.root, 'media', id + extFor(mime)), bytes);
    writeFileSync(path.join(this.root, 'media', id + '.thumb.webp'), thumb);
    const asset: Asset = { id, name: path.basename(name).slice(0, 180), mime, width: meta.autoOrient?.width ?? meta.width, height: meta.autoOrient?.height ?? meta.height, createdAt: new Date().toISOString(), url: `/api/media/${id}`, thumbnail: `/api/media/${id}/thumbnail` };
    this.put('asset', id, asset);
    return asset;
  }
  createRun(id: string, draft: Draft, generatorTabId?: string): Run {
    const existing = this.get<Run>('run', id);
    if (existing) return existing;
    if (!draft.prompt.trim()) throw new Error('Write a prompt before generating.');
    const run: Run = { id, ...(generatorTabId ? { generatorTabId } : {}), draft: structuredClone(draft), createdAt: new Date().toISOString(), jobs: Array.from({ length: draft.count }, (_, index) => ({ id: randomUUID(), index, status: 'queued' })) };
    this.put('run', id, run);
    return run;
  }
  recover() {
    for (const run of this.list<Run>('run')) {
      if(run.kind === 'upscale' && run.falRequest) continue;
      let changed = false;
      for (const job of run.jobs) if (job.status === 'generating' || job.status === 'queued') {
        job.status = 'interrupted'; job.error = 'Studio restarted before this image was saved. Check the previous result before retrying; another generation uses your subscription allowance.'; changed = true;
      }
      if (changed) this.put('run', run.id, run);
    }
  }
  verifyAsset(id: string) { return existsSync(this.assetPath(id)); }
  close() { this.db.close(); }
}
export function extFor(mime: string) { return mime === 'image/jpeg' ? '.jpg' : mime === 'image/webp' ? '.webp' : '.png'; }
