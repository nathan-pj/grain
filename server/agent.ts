import { Router } from 'express';
import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync, chmodSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type { Store } from './store.js';
import type { Queue } from './queue.js';
import type { Draft, Run } from '../src/types.js';
import { higgsfieldCatalog } from './higgsfield.js';

export const agentTokenFile = path.join(os.homedir(),'Library/Application Support/local.images.desktop/grain-agent-token');
export function agentRoutes(store:Store, queue:Queue, provider:()=> 'openai'|'higgsfield'|'codex') {
 const router=Router();
 if(!existsSync(agentTokenFile)){mkdirSync(path.dirname(agentTokenFile),{recursive:true});writeFileSync(agentTokenFile,randomBytes(32).toString('hex'),{mode:0o600});}
 chmodSync(agentTokenFile,0o600);
 const token=readFileSync(agentTokenFile,'utf8').trim();
 let lastSeen=0, owner='', lastSnapshot='';
 type Command={id:string;action:string;args:any;status:string;result?:unknown;expires:number};
 const commands=new Map<string,Command>();
 router.post('/bridge',(req,res)=>{
  const {clientId,snapshot,completed}=req.body;
  if(typeof clientId!=='string'||!snapshot||!Array.isArray(snapshot.tabs)||!Array.isArray(snapshot.folders))throw new Error('Invalid workspace snapshot.');
  if(owner && owner!==clientId && Date.now()-lastSeen<5000)return res.json({passive:true});
  owner=clientId;lastSeen=Date.now();const serialized=JSON.stringify(snapshot);if(serialized!==lastSnapshot){store.put('meta','agent-workspace',snapshot);lastSnapshot=serialized;}
  for(const done of completed||[]){const command=commands.get(done.id);if(command&&command.status==='pending'){command.status=done.error?'failed':'completed';command.result=done.error||done.result;}}
  for(const [id,c] of commands){if(c.expires<Date.now()){if(c.status==='pending'){c.status='failed';c.result='Grain did not apply the command in time.';}if(c.expires<Date.now()-60000)commands.delete(id);}}
  res.json({command:[...commands.values()].find(c=>c.status==='pending')});
 });
 router.use('/agent',(req,res,next)=>{
  const supplied=Buffer.from(String(req.headers['x-grain-agent']||''));const expected=Buffer.from(token);
  if(supplied.length!==expected.length||!timingSafeEqual(supplied,expected))return res.status(403).json({error:'Invalid Grain connector token.'});next();
 });
 router.get('/agent/workspace',(_req,res)=>res.json({online:Date.now()-lastSeen<5000,workspace:store.get('meta','agent-workspace'),provider:provider()}));
 router.get('/agent/models',async(req,res)=>res.json(await higgsfieldCatalog(typeof req.query.model==='string'?req.query.model:undefined)));
 router.post('/agent/command',async(req,res)=>{
  if(Date.now()-lastSeen>5000)throw new Error('Open Grain before editing tabs.');
  const allowed=['create_tab','open_tab','rename_tab','close_tab','update_draft','create_folder','rename_folder','move_tab','move_folder','open_folder'];
  if(!allowed.includes(req.body.action))throw new Error('Unknown action.');
  const args=req.body.args||{};
  if(req.body.action==='update_draft')args.draft=store.validateDraft(args.draft);
  const command:Command={id:randomUUID(),action:req.body.action,args,status:'pending',expires:Date.now()+20000};commands.set(command.id,command);
  while(command.status==='pending'&&Date.now()<command.expires)await new Promise(r=>setTimeout(r,150));
  if(command.status==='pending'){command.status='failed';command.result='Command expired. Open Grain and retry.';}
  res.json(command);
 });
 router.post('/agent/generate',(req,res)=>{
  const w=store.get<any>('meta','agent-workspace');const tab=w?.tabs?.find((t:any)=>t.id===req.body.tabId);if(!tab)throw new Error('Tab not found.');
  const draft=store.validateDraft(tab.draft);draft.provider=provider();
  if(!draft.prompt.trim()&&!draft.referenceIds.length)throw new Error('Add a prompt or references.');
  const limit=req.body.userRequestedLimit===undefined?4:req.body.userRequestedLimit;
  if(!Number.isInteger(limit)||limit<1||limit>40)throw new Error('Invalid concurrency limit.');
  if(limit>4&&(!req.body.userRequest||typeof req.body.userRequest!=='string'))throw new Error('A larger limit requires the user’s explicit request.');
  const id=req.body.requestId;if(typeof id!=='string'||!/^[0-9a-f-]{36}$/.test(id))throw new Error('A unique requestId is required.');
  const prior=store.get<Run>('run',id);if(prior)return res.json(prior);
  const active=store.list<Run>('run').filter(r=>r.kind!=='upscale').reduce((n,r)=>n+r.jobs.filter(j=>['queued','generating'].includes(j.status)).length,0);
  if(active+draft.count>limit)return res.status(409).json({error:`${active} images are active. The limit is ${limit}; wait for results before submitting more.`});
  const run=store.createRun(id,draft,tab.id);res.status(202).json(run);void queue.pump();
 });
 router.post('/agent/retry',async(req,res)=>{
  const active=store.list<Run>('run').filter(r=>r.kind!=='upscale').reduce((n,r)=>n+r.jobs.filter(j=>['queued','generating'].includes(j.status)).length,0);
  if(active>=4)return res.status(409).json({error:'Four images are already active. Wait before retrying.'});
  res.json(await queue.retry(req.body.runId,req.body.jobId));
 });
 router.get('/agent/results',(req,res)=>{const runs=store.list<Run>('run').filter(r=>!req.query.tabId||req.query.tabId==='main'||r.generatorTabId===req.query.tabId);const recent=runs.slice(0,100);const ids=new Set(recent.flatMap(r=>[...r.draft.referenceIds,...r.jobs.flatMap(j=>j.assetId?[j.assetId]:[])]));res.json({runs:recent,assets:Object.fromEntries(Object.entries(store.state().assets).filter(([id])=>ids.has(id)))});});
 return router;
}
