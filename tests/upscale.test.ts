import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { randomUUID } from 'node:crypto';
import { Store } from '../server/store.js';
import { Upscaler, queueURL } from '../server/fal.js';
import { outputDimensions } from '../src/resize.js';
import type { Run } from '../src/types.js';

test('output limits and queue addresses reject unsafe or oversized requests',()=>{
 assert.deepEqual(outputDimensions(2048,2048,2),{width:4096,height:4096});
 assert.throws(()=>outputDimensions(4096,4096,4));
 assert.throws(()=>outputDimensions(1024,1024,10));
 assert.throws(()=>queueURL('https://example.com/fal-ai/seedvr/foo'));
 assert.throws(()=>queueURL('http://queue.fal.run/fal-ai/seedvr/foo'));
});
test('upscale resizes before submission, deduplicates and preserves hide and source draft',async t=>{
 const root=mkdtempSync(path.join(os.tmpdir(),'grain-upscale-')),store=new Store(root);
 const oldKey=process.env.FAL_KEY;process.env.FAL_KEY='test-only';
 try{
  const bytes=await sharp({create:{width:1080,height:1080,channels:3,background:'#786c53'}}).png().toBuffer();
  const asset=await store.addAsset(bytes,'input.png');
  const draft={prompt:'Original prompt',count:2,referenceIds:[asset.id]};store.put('draft','current',draft);
  let submits=0,release!:()=>void;
  const gate=new Promise<void>(r=>{release=r;});
  const worker=new Upscaler(store,async(_url,input)=>{
   if(input){submits++;const payload=input as {image_url:string;upscale_factor:number};const meta=await sharp(Buffer.from(payload.image_url.split(',')[1],'base64')).metadata();assert.equal(meta.width,2048);assert.equal(payload.upscale_factor,2);await gate;return {request_id:'test-request',status_url:'https://queue.fal.run/fal-ai/seedvr/requests/test/status',response_url:'https://queue.fal.run/fal-ai/seedvr/requests/test'};}
   if(_url.endsWith('/status'))return {status:'COMPLETED'};
   return {image:{url:'https://v3.fal.media/test.png'}};
  });
  t.mock.method(globalThis,'fetch',async()=>new Response(new Uint8Array(bytes)));
  const id=randomUUID(),run=worker.create(id,asset.id,2048/1080*100,2);
  assert.equal(worker.create(id,asset.id,100,4).id,id);
  store.setJobHidden(id,run.jobs[0].id,true);release();
  for(let i=0;i<200&&store.get<Run>('run',id)?.jobs[0].status!=='succeeded';i++)await new Promise(r=>setTimeout(r,10));
  const result=store.get<Run>('run',id)!;
  assert.equal(result.jobs[0].status,'succeeded',result.jobs[0].error);assert.equal(submits,1);assert.ok(result.jobs[0].hiddenAt);assert.ok(result.jobs[0].assetId);assert.deepEqual(store.state().draft,draft);
  result.jobs[0].status='generating';store.put('run',id,result);store.recover();assert.equal(store.get<Run>('run',id)!.jobs[0].status,'generating');
 }finally{if(oldKey===undefined)delete process.env.FAL_KEY;else process.env.FAL_KEY=oldKey;store.close();rmSync(root,{recursive:true,force:true});}
});
