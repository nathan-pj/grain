import { chmodSync, readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import type { Asset, Run } from '../src/types.js';
import { Store } from './store.js';
import { inputDimensions, outputDimensions } from '../src/resize.js';

export const falKeyPath = path.join(os.homedir(), 'Library/Application Support/local.images.desktop/fal-key');
const key = () => process.env.FAL_KEY || (existsSync(falKeyPath) ? readFileSync(falKeyPath, 'utf8').trim() : '');
export const falConfigured = () => Boolean(key());
export function saveFalKey(value: string, file = falKeyPath) {
 const credential = value.trim();
 if (credential.length < 10 || /\s/.test(credential)) throw new Error('Enter a valid fal API key.');
 mkdirSync(path.dirname(file), { recursive: true });
 writeFileSync(file, credential, { mode: 0o600 });
 chmodSync(file, 0o600);
}
export function queueURL(value: string) {
 const u = new URL(value);
 if (u.origin !== 'https://queue.fal.run' || !u.pathname.startsWith('/fal-ai/seedvr/')) throw new Error('Unexpected fal queue address.');
 return u.href;
}
async function rpc(url: string, input?: unknown) {
 const response = await fetch(queueURL(url), { method: input ? 'POST' : 'GET', redirect: 'error', signal: AbortSignal.timeout(60000), headers: { Authorization: `Key ${key()}`, 'Content-Type': 'application/json' }, ...(input ? {body: JSON.stringify(input)} : {}) });
 if (!response.ok) {
  if(response.status===401||response.status===403)throw new Error('fal rejected the API key. Check the key and its permissions.');
  if(response.status===402)throw new Error('Add credits to your fal account, then try again.');
  throw new Error(`fal returned ${response.status}. Check this request in fal before retrying.`);
 }
 return response.json();
}
export class Upscaler {
 private active = new Set<string>();
 constructor(private store: Store, private request = rpc) {}
 create(id: string, assetId: string, percent: number, factor: number) {
  if(typeof id!=='string'|| !/^[0-9a-f-]{36}$/.test(id))throw new Error('Invalid upscale request.');
  const existing=this.store.get<Run>('run',id);if(existing)return existing;
  if(!falConfigured())throw new Error('fal API key is not configured.');
  const asset=this.store.get<Asset>('asset',assetId);if(!asset)throw new Error('Choose an image first.');
  const dimensions=inputDimensions(asset.width,asset.height,percent);outputDimensions(dimensions.width,dimensions.height,factor);
  const source=this.store.list<Run>('run').find(r=>r.jobs.some(j=>j.assetId===assetId));
  const run:Run={id,kind:'upscale',sourceAssetId:assetId,inputPercent:percent,upscaleFactor:factor,draft:source?.draft||{prompt:'SeedVR2 upscale',count:1,referenceIds:[assetId]},createdAt:new Date().toISOString(),jobs:[{id:randomUUID(),index:0,status:'queued'}]};
  this.store.put('run',id,run);void this.process(id);return run;
 }
 resume(){for(const run of this.store.list<Run>('run'))if(run.kind==='upscale'&&run.falRequest&&['queued','generating'].includes(run.jobs[0].status))void this.process(run.id);}
 private update(id:string,fn:(r:Run)=>void){const run=this.store.get<Run>('run',id)!;fn(run);this.store.put('run',id,run);return run;}
 async process(id:string){
  if(this.active.has(id))return;this.active.add(id);
  try {
   let run=this.store.get<Run>('run',id)!;
   if(!run.falRequest){
    const asset=this.store.get<Asset>('asset',run.sourceAssetId!)!;
    const size=inputDimensions(asset.width,asset.height,run.inputPercent!);
    const bytes=await sharp(this.store.assetPath(asset.id)).rotate().resize(size.width,size.height,{fit:'fill',kernel:'lanczos3'}).png().toBuffer();
    const response=await this.request('https://queue.fal.run/fal-ai/seedvr/upscale/image',{image_url:`data:image/png;base64,${bytes.toString('base64')}`,upscale_mode:'factor',upscale_factor:run.upscaleFactor,output_format:'png',noise_scale:0.1});
    if(!response.request_id)throw new Error('fal did not return a request ID. Check fal before retrying.');
    const remote={id:String(response.request_id),statusURL:queueURL(response.status_url),responseURL:queueURL(response.response_url)};
    run=this.update(id,r=>{r.falRequest=remote;r.jobs[0].status='generating';});
   }
   let failures=0;
   for(;;){
    let status;
    try{status=await this.request(run.falRequest!.statusURL);failures=0;}
    catch(e){if(++failures>=5)throw e;await new Promise(r=>setTimeout(r,5000));continue;}
    if(status.status==='COMPLETED'){
     if(status.error)throw new Error('SeedVR2 could not process this image. Check the request in fal for details.');
     const result=await this.request(run.falRequest!.responseURL);
     const url=new URL(result.image?.url);
     if(url.protocol!=='https:'||!(url.hostname.endsWith('.fal.media')||url.hostname==='fal.media'))throw new Error('fal returned an unexpected output address.');
     const response=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(120000)});
     if(!response.ok)throw new Error('Could not download the finished upscale. Reopen the app to retry retrieval.');
     if(Number(response.headers.get('content-length'))>100*1024*1024)throw new Error('Upscaled image exceeds the 100 MB limit.');
     const chunks:Uint8Array[]=[];let total=0;
     const reader=response.body!.getReader();
     for(;;){const {done,value:chunk}=await reader.read();if(done)break;total+=chunk.length;if(total>100*1024*1024){await reader.cancel();throw new Error('Upscaled image exceeds the 100 MB limit.');}chunks.push(chunk);}
     const asset=await this.store.addAsset(Buffer.concat(chunks),'seedvr2-upscale.png',100*1024*1024);
     this.update(id,r=>{r.jobs[0].status='succeeded';r.jobs[0].assetId=asset.id;delete r.jobs[0].error;});return;
    }
    this.update(id,r=>{r.jobs[0].status=status.status==='IN_QUEUE'?'queued':'generating';});
    await new Promise(r=>setTimeout(r,2000));
   }
  }catch(e){this.update(id,r=>{r.jobs[0].status='failed';r.jobs[0].error=(e as Error).message;});}
  finally{this.active.delete(id);}
 }
 retrieve(id:string){const run=this.store.get<Run>('run',id);if(!run?.falRequest||run.jobs[0].status==='succeeded')throw new Error('No pending fal result to retrieve.');this.update(id,r=>{r.jobs[0].status='generating';delete r.jobs[0].error;});void this.process(id);}
}
