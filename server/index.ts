import express from 'express';
import { connection as codexConnection } from './codex.js';
import { agentRoutes } from './agent.js';
import multer from 'multer';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import archiver from 'archiver';
import sharp from 'sharp';
import { inputDimensions } from '../src/resize.js';
import { Store, extFor } from './store.js';
import { Queue } from './queue.js';
import { connection as openAIConnection, openAIConfigured, saveOpenAIKey } from './openai.js';
import { connectHiggsfield, higgsfieldConnection, higgs, higgsfieldCatalog } from './higgsfield.js';
import { Upscaler, falConfigured, saveFalKey } from './fal.js';
import { pixelcut } from './pixelcut.js';
import type { Asset, Run, Setup } from '../src/types.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PORT || 4318);
const store = new Store(path.resolve(process.env.STUDIO_DATA_DIR || path.join(root, 'data')));
store.recover();
const provider = (): 'higgsfield' | 'openai' | 'codex' => { const saved=store.get<string>('meta','generation-provider');return saved==='higgsfield'||saved==='codex'?saved:'openai'; };
const connection = async (name = provider()) => name === 'higgsfield' ? higgsfieldConnection() : name === 'codex' ? codexConnection() : { ...await openAIConnection(), provider: 'openai' };
const queue = new Queue(store);
const upscaler = new Upscaler(store);
upscaler.resume();
const app = express();
app.disable('x-powered-by');
app.use((req, res, next) => {
  if (![ `127.0.0.1:${port}`, `localhost:${port}` ].includes(req.headers.host || '')) return res.status(403).json({ error: 'Open Studio through its local address.' });
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' blob: data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; font-src 'self'; frame-ancestors 'none'; base-uri 'self'");
  if (!['GET', 'HEAD'].includes(req.method)) {
    const origin = req.headers.origin;
    if (req.headers['x-studio-request'] !== '1' || (origin && ![`http://127.0.0.1:${port}`, `http://localhost:${port}`].includes(origin))) return res.status(403).json({ error: 'This request must come from your Studio tab.' });
  }
  next();
});
app.use(express.json({ limit: '8mb' }));
app.use('/api', agentRoutes(store,queue,provider));
app.get('/api/state', (_req, res) => res.json(store.state()));
app.get('/api/pixelcut/status', async (_req, res) => {
  if (!pixelcut.connected()) return res.json({ connected: false });
  try { await pixelcut.tools(); res.json({ connected: true, seedvr2: false, error: 'Pixelcut’s MCP connector does not expose SeedVR2. No alternative upscaler will be used.' }); }
  catch (e) { res.json({connected:false,error:(e as Error).message}); }
});
app.get('/api/fal/status', (_req,res)=>res.json({configured:falConfigured(),model:'SeedVR2'}));
app.put('/api/fal/key', (req,res)=>{saveFalKey(typeof req.body.key === 'string' ? req.body.key : '');res.json({configured:true});});
app.post('/api/upscales', (req,res)=>res.status(202).json(upscaler.create(req.body.id,req.body.assetId,req.body.percent,req.body.factor)));
app.post('/api/upscales/:id/retrieve', (req,res)=>{upscaler.retrieve(req.params.id);res.json({ok:true});});
app.post('/api/pixelcut/connect', async (_req, res) => res.json({url:await pixelcut.authorize(port)}));
app.get('/api/pixelcut/callback', async (req, res) => {
  await pixelcut.callback(String(req.query.state || ''), String(req.query.code || ''));
  res.type('html').send('<html><title>Grain · Connected</title><body style="background:#121415;color:#eee;font:16px system-ui;padding:48px">Pixelcut connected. You can close this tab and return to Grain.</body></html>');
});
app.post('/api/runs/:id/jobs/:jobId/hide', (req, res) => res.json(store.setJobHidden(req.params.id, req.params.jobId, true)));
app.post('/api/runs/:id/jobs/:jobId/restore', (req, res) => res.json(store.setJobHidden(req.params.id, req.params.jobId, false)));
app.get('/api/connection', async (_req, res) => res.json(await connection()));
app.put('/api/provider', async (req, res) => {
  if (!['higgsfield', 'openai', 'codex'].includes(req.body.provider)) throw new Error('Choose a provider.');
  store.put('meta', 'generation-provider', req.body.provider);
  res.json(await connection());
});
app.get('/api/higgsfield/models', async (_req,res)=>res.json(await higgsfieldCatalog()));
app.get('/api/higgsfield/models/:model', async (req,res)=>res.json(await higgsfieldCatalog(req.params.model)));
app.post('/api/higgsfield/connect', (_req, res) => { connectHiggsfield(); res.json({ started: true }); });
app.get('/api/higgsfield/workspaces', async (_req, res) => res.json(await higgs(['workspace', 'list'])));
app.put('/api/higgsfield/workspace', async (req, res) => {
  const workspaces = await higgs(['workspace', 'list']);
  if (!workspaces.some((w: {id:string}) => w.id === req.body.id)) throw new Error('Select an available workspace.');
  // CLI set returns human-readable text even with --json.
  await higgs(['workspace', 'set', req.body.id]).catch(async () => { const current = await higgs(['workspace', 'list']); if (!current.some((w: {id:string;is_selected:boolean}) => w.id === req.body.id && w.is_selected)) throw new Error('Workspace selection failed.'); });
  res.json(await higgsfieldConnection());
});
app.get('/api/openai/status', (_req, res) => res.json({ configured: openAIConfigured(), model: 'gpt-image-2.5-sunburst' }));
app.put('/api/openai/key', (req, res) => { saveOpenAIKey(typeof req.body.key === 'string' ? req.body.key : ''); res.json({ configured: true }); });
app.put('/api/draft', (req, res) => { const draft = store.validateDraft(req.body); store.put('draft', 'current', draft); res.json(draft); });
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024, files: 20 } });
app.post('/api/assets', upload.array('images', 20), async (req, res) => {
  const files = req.files as Express.Multer.File[];
  if (!files?.length) return res.status(400).json({ error: 'Choose at least one image.' });
  const assets = [];
  for (const f of files) assets.push(await store.addAsset(f.buffer, f.originalname));
  res.json(assets);
});
app.get('/api/images/:id/resized', async (req, res) => {
  const asset=store.get<Asset>('asset', req.params.id); if(!asset)return res.status(404).json({error:'Image not found.'});
  const size=inputDimensions(asset.width, asset.height, Number(req.query.percent || 100));
  const bytes=await sharp(store.assetPath(asset.id)).rotate().resize(size.width,size.height,{fit:'fill',kernel:'lanczos3'}).png().toBuffer();
  if(req.query.download) res.attachment(`grain-input-${size.width}x${size.height}.png`);
  res.type('png').send(bytes);
});
app.delete('/api/images/:id', (req, res) => res.json(store.setAssetDeleted(req.params.id, true)));
app.post('/api/images/:id/restore', (req, res) => res.json(store.setAssetDeleted(req.params.id, false)));
app.get('/api/media/:id{/:variant}', (req, res) => {
  const asset = store.get<Asset>('asset', req.params.id);
  if (!asset || (req.params.variant && req.params.variant !== 'thumbnail')) return res.status(404).json({ error: 'Image not found.' });
  if (req.query.download) res.attachment(asset.name);
  res.type(req.params.variant ? 'image/webp' : asset.mime);
  res.setHeader('Cache-Control', 'private, max-age=31536000, immutable');
  res.sendFile(store.assetPath(asset.id, Boolean(req.params.variant)));
});
app.post('/api/setups', (req, res) => {
  const name = typeof req.body.name === 'string' ? req.body.name.trim().slice(0, 80) : '';
  if (!name) return res.status(400).json({ error: 'Give this setup a name.' });
  const draft = store.validateDraft(req.body.draft);
  const setup: Setup = { id: randomUUID(), name, draft, createdAt: new Date().toISOString() };
  store.put('setup', setup.id, setup); res.json(setup);
});
app.patch('/api/setups/:id', (req, res) => {
  const setup = store.get<Setup>('setup', req.params.id);
  if (!setup) return res.status(404).json({ error: 'Setup not found.' });
  if (typeof req.body.name !== 'string' || !req.body.name.trim()) return res.status(400).json({ error: 'Give this setup a name.' });
  setup.name = req.body.name.trim().slice(0, 80); store.put('setup', setup.id, setup); res.json(setup);
});
app.delete('/api/setups/:id', (req, res) => { store.delete('setup', req.params.id); res.json({ ok: true }); });
app.post('/api/runs', async (req, res) => {
  const id = req.body.id;
  if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/.test(id)) return res.status(400).json({ error: 'Invalid submission. Please try again.' });
  const prior = store.get<Run>('run', id);
  if (prior) return res.json(prior);
  const draft = store.validateDraft(req.body.draft);
  if (!draft.prompt.trim() && (provider() !== 'higgsfield' || !draft.referenceIds.length)) return res.status(400).json({ error: 'Add a prompt or reference image.' });
  const status = await connection();
  draft.provider = provider();
  if (!status.connected) return res.status(409).json({ error: status.message });
  const generatorTabId = typeof req.body.generatorTabId === 'string' && /^[a-zA-Z0-9-]{1,80}$/.test(req.body.generatorTabId) ? req.body.generatorTabId : undefined;
  const run = store.createRun(id, draft, generatorTabId);
  res.status(202).json(run);
  void queue.pump();
});
app.post('/api/runs/:id/jobs/:jobId/retry', async (req, res) => {
  const run = store.get<Run>('run', req.params.id);
  const status = await connection(run?.draft.provider || 'openai');
  if (!status.connected) return res.status(409).json({ error: status.message });
  res.status(202).json(await queue.retry(req.params.id, req.params.jobId));
});
app.get('/api/runs/:id/download', (req, res) => {
  const run = store.get<Run>('run', req.params.id);
  const assets = run?.jobs.flatMap(j => j.assetId ? [store.get<Asset>('asset', j.assetId)!] : []).filter(a => a && !a.deletedAt) || [];
  if (!run || !assets.length) return res.status(404).json({ error: 'No completed images to download.' });
  res.attachment(`studio-${run.id.slice(0, 8)}.zip`);
  const archive = archiver('zip', { zlib: { level: 1 } });
  archive.on('error', () => res.destroy()); archive.pipe(res);
  for (const [index, a] of assets.entries()) archive.file(store.assetPath(a.id), { name: `image-${index + 1}${extFor(a.mime)}` });
  archive.append(JSON.stringify({ prompt: run.draft.prompt, requested: run.draft.count, completed: assets.length, createdAt: run.createdAt }, null, 2), { name: 'generation.json' });
  void archive.finalize();
});
app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found.' }));
app.use(express.static(path.join(root, 'dist')));
app.get('/{*path}', (_req, res) => {
  if (!existsSync(path.join(root, 'dist/index.html'))) return res.status(503).send('Run npm run build, then reload Studio.');
  res.sendFile(path.join(root, 'dist/index.html'));
});
app.use((error: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const message = error instanceof multer.MulterError ? error.code === 'LIMIT_FILE_SIZE' ? 'Each image must be 20 MB or smaller.' : 'Upload up to twenty images at a time.' : error.message || 'Something went wrong. Your saved work is still here.';
  res.status(400).json({ error: message });
});
app.listen(port, '127.0.0.1', () => console.log(`Image Studio is ready at http://127.0.0.1:${port}`));
