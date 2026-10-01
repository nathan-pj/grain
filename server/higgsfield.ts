import { execFile, spawn, type ChildProcess } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { promisify } from 'node:util';
import type { Connection, HiggsModel } from '../src/types.js';
import type { GenerateInput } from './openai.js';

const exec = promisify(execFile);
const require = createRequire(import.meta.url);
const binary = path.join(path.dirname(require.resolve('@higgsfield/cli/package.json')), 'vendor', process.platform === 'win32' ? 'hf.exe' : 'hf');
export async function higgs(args: string[]): Promise<any> {
  try {
    const { stdout } = await exec(binary, [...args, '--json'], { timeout: 120_000, maxBuffer: 4 * 1024 * 1024 });
    return JSON.parse(stdout);
  } catch (error) {
    const e = error as Error & { stderr?: string };
    // Never return credential material or command arguments (which contain prompts).
    throw new Error(e.stderr?.trim().slice(0, 700) || 'Higgsfield request failed. Check the connection and retry.');
  }
}
let login: ChildProcess | undefined;
export function connectHiggsfield() {
  if (login) return;
  login = spawn(binary, ['auth', 'login'], { stdio: 'ignore' });
  login.once('error', () => { login = undefined; });
  login.once('exit', () => { login = undefined; });
}
export async function higgsfieldConnection(): Promise<Connection> {
  try {
    const workspaces = await higgs(['workspace', 'list']) as {id:string;name:string|null;credits:number;is_selected:boolean}[];
    const selected = workspaces.find(w => w.is_selected);
    if (!selected) return { connected: false, verified: false, provider: 'higgsfield', message: 'Select a Higgsfield workspace.' };
    return { connected: true, verified: true, provider: 'higgsfield', message: 'Higgsfield connected', credits: selected.credits, workspace: selected.name || 'Personal' };
  } catch { return { connected: false, verified: false, provider: 'higgsfield', message: 'Connect Higgsfield.' }; }
}
const catalogCache = new Map<string, {time:number; value:any}>();
export async function higgsfieldCatalog(model?: string): Promise<any> {
  const key=model || 'catalog'; const cached=catalogCache.get(key);
  if(cached && Date.now()-cached.time<300000)return cached.value;
  if(model && !/^[a-z0-9_]+$/.test(model))throw new Error('Invalid model.');
  const value=await higgs(model ? ['model','get',model] : ['model','list','--image']);
  if(model && value.type !== 'image')throw new Error('Select an image model.');
  catalogCache.set(key,{time:Date.now(),value});return value;
}
export function higgsfieldParams(input: GenerateInput, model?: HiggsModel): string[] {
  const id=input.higgsfieldModel || 'gpt_image_2_5';
  const legacy = !input.higgsfieldModel;
  const options:Record<string,unknown> = legacy ? {variant:'sunburst',quality:input.quality || 'high',resolution:input.resolution || '1k',aspect_ratio:input.prompt.match(/(?:\n|^)Make it ([0-9]+:[0-9]+)\s*$/)?.[1] || '1:1'} : {...input.higgsfieldOptions};
  const parameters=model?.params || [{name:'prompt'},...Object.keys(options).map(name=>({name})),{name:'image_references'}];
  const args=[id];
  if(parameters.some(p=>p.name==='prompt'))args.push('--prompt',options.aspect_ratio ? input.prompt.replace(/(?:\n|^)Make it [0-9]+:[0-9]+\s*$/, '') : input.prompt);
  for(const p of parameters) {
    if(p.name==='prompt' || p.name==='image_references')continue;
    const value=options[p.name];
    if(value===undefined || value===null || value==='')continue;
    if(!/^[a-zA-Z0-9_]+$/.test(p.name))throw new Error('Invalid model parameter.');
    if('enum' in p && p.enum && !(p.enum as unknown[]).includes(value))throw new Error(`Choose a valid ${p.name.replaceAll('_',' ')}.`);
    args.push('--'+p.name.replaceAll('_','-'),typeof value==='object'?JSON.stringify(value):String(value));
  }
  if(input.references.length) {
    if(!parameters.some(p=>p.name==='image_references'))throw new Error('This model does not accept reference images. Remove the references or choose another model.');
    args.push(...input.references.flatMap(file=>['--image-references',file]));
  }
  return args;
}
export async function higgsfieldGenerate(input: GenerateInput, call: typeof higgs = higgs, request: typeof fetch = fetch): Promise<{bytes:Buffer;name:string}> {
  let id = input.remoteJobId;
  if (!id) {
    const model = await higgsfieldCatalog(input.higgsfieldModel || 'gpt_image_2_5');
    const ids = await call(['generate', 'create', ...higgsfieldParams(input, model)]);
    if (!Array.isArray(ids) || typeof ids[0] !== 'string') throw new Error('Higgsfield returned no job ID. Check Higgsfield Assets before retrying.');
    id = ids[0]; input.onRemoteJob?.(id!);
  }
  const deadline = Date.now() + 20 * 60_000;
  while (Date.now() < deadline) {
    const job = await call(['generate', 'get', id!]);
    if (['failed', 'cancelled', 'canceled', 'error'].includes(job.status)) {
      input.onRemoteJob?.('');
      throw new Error('Higgsfield generation failed. Retry this image.');
    }
    if (job.status === 'completed') {
      if ((!input.higgsfieldModel || (input.higgsfieldModel === 'gpt_image_2_5' && input.higgsfieldOptions?.variant === 'sunburst')) && job.params?.model !== 'sunburst') throw new Error('Higgsfield returned a different model. The job was kept for inspection.');
      if (typeof job.result_url !== 'string' || !job.result_url.startsWith('https://')) throw new Error('Higgsfield returned no downloadable image.');
      const response = await request(job.result_url, {signal:AbortSignal.timeout(120_000)});
      if (!response.ok) throw new Error('Could not download the Higgsfield image. Retry to retrieve it without generating again.');
      return { bytes: Buffer.from(await response.arrayBuffer()), name: 'higgsfield.png' };
    }
    await new Promise(resolve => setTimeout(resolve, 3000));
  }
  throw new Error('Higgsfield is still processing. Retry to retrieve this same job.');
}
