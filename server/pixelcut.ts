import { randomBytes, createHash } from 'node:crypto';
import { readFileSync, writeFileSync, chmodSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const endpoint = 'https://mcp.pixelcut.ai/mcp';
const issuer = 'https://oauth.pixelcut.ai';
const root = path.join(os.homedir(), 'Library/Application Support/local.images.desktop');
const authFile = path.join(root, 'pixelcut-auth.json');
type Auth = { client: { client_id: string }; token?: { access_token: string; refresh_token?: string; expires_in?: number } };
export type MCPTool = { name: string; description?: string; inputSchema: Record<string, any> };
export class Pixelcut {
 private session?: string;
 private initialized = false;
 private catalog?: {time:number;tools:MCPTool[]};
 private nextId = 1;
 private pending?: { state: string; verifier: string; redirect: string; expires: number };
 private read(): Auth | undefined { try { return JSON.parse(readFileSync(authFile, 'utf8')); } catch { return undefined; } }
 private save(auth: Auth) { mkdirSync(root, {recursive: true}); writeFileSync(authFile, JSON.stringify(auth), {mode: 0o600}); chmodSync(authFile, 0o600); }
 connected() { return Boolean(this.read()?.token?.access_token); }
 async authorize(port: number) {
  const redirect = `http://127.0.0.1:${port}/api/pixelcut/callback`;
  const response = await fetch(`${issuer}/oauth/register`, {method:'POST', headers:{'Content-Type':'application/json'},body:JSON.stringify({client_name:'Grain',redirect_uris:[redirect],grant_types:['authorization_code'],response_types:['code'],token_endpoint_auth_method:'none'}),signal:AbortSignal.timeout(30000)});
  if (!response.ok) throw new Error('Pixelcut sign-in is unavailable. Try again shortly.');
  const client = await response.json() as Auth['client']; this.save({client});
  const state=randomBytes(32).toString('base64url'),verifier=randomBytes(48).toString('base64url');
  this.pending={state,verifier,redirect,expires:Date.now()+15*60000};
  return `${issuer}/oauth/authorize?${new URLSearchParams({client_id:client.client_id,redirect_uri:redirect,response_type:'code',scope:'pixa:read pixa:write',resource:'https://mcp.pixelcut.ai',state,code_challenge:createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256'})}`;
 }
 async callback(state: string, code: string) {
  const p=this.pending,auth=this.read();
  if (!p || !auth || p.state!==state || p.expires<Date.now() || !code) throw new Error('This sign-in expired. Connect Pixelcut again from Grain.');
  this.pending=undefined;
  const response=await fetch(`${issuer}/oauth/token`, {method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'authorization_code',client_id:auth.client.client_id,redirect_uri:p.redirect,code_verifier:p.verifier,code,resource:'https://mcp.pixelcut.ai'}),signal:AbortSignal.timeout(30000)});
  if (!response.ok) throw new Error('Pixelcut sign-in failed. Try connecting again.');
  auth.token=await response.json() as Auth['token'];this.save(auth);this.initialized=false;this.session=undefined;
 }
 private async rpc(method: string, params: unknown, retry = true): Promise<any> {
  let auth=this.read(); if (!auth?.token) throw new Error('Connect Pixelcut to use SeedVR2.');
  const id=this.nextId++;
  const headers:Record<string,string>={'Content-Type':'application/json',Accept:'application/json, text/event-stream',Authorization:`Bearer ${auth.token.access_token}`,'MCP-Protocol-Version':'2025-03-26'};
  if(this.session) headers['Mcp-Session-Id']=this.session;
  const response=await fetch(endpoint,{method:'POST',headers,body:JSON.stringify({jsonrpc:'2.0',id,method,params}),signal:AbortSignal.timeout(120000)});
  if(response.status===401 && retry && auth.token.refresh_token) {
   const refresh=await fetch(`${issuer}/oauth/token`,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',refresh_token:auth.token.refresh_token,client_id:auth.client.client_id}),signal:AbortSignal.timeout(30000)});
   if(refresh.ok){auth.token={...auth.token,...await refresh.json()};this.save(auth);return this.rpc(method,params,false);}
  }
  if(response.status===401) throw new Error('Pixelcut sign-in expired. Reconnect Pixelcut.');
  if(!response.ok) throw new Error(`Pixelcut could not complete this request (${response.status}).`);
  this.session=response.headers.get('Mcp-Session-Id') || this.session;
  const raw=await response.text();
  const entries=response.headers.get('content-type')?.includes('text/event-stream') ? raw.split('\n').filter(l=>l.startsWith('data:')).map(l=>{try{return JSON.parse(l.slice(5))}catch{return null}}) : [JSON.parse(raw)];
  const result=entries.find(e=>e?.id===id);
  if(result?.error) throw new Error(result.error.message || 'Pixelcut request failed.');
  if(!result) throw new Error('Pixelcut returned an incomplete response.');
  return result.result;
 }
 private async init() {
  if(this.initialized)return;
  await this.rpc('initialize',{protocolVersion:'2025-03-26',capabilities:{},clientInfo:{name:'Grain',version:'1.1'}});
  const auth=this.read()!;
  const headers:Record<string,string>={'Content-Type':'application/json',Accept:'application/json, text/event-stream',Authorization:`Bearer ${auth.token!.access_token}`,'MCP-Protocol-Version':'2025-03-26'};
  if(this.session)headers['Mcp-Session-Id']=this.session;
  const response=await fetch(endpoint,{method:'POST',headers,body:JSON.stringify({jsonrpc:'2.0',method:'notifications/initialized'}),signal:AbortSignal.timeout(30000)});
  if(!response.ok)throw new Error('Pixelcut could not initialize this connection.');
  this.initialized=true;
 }
 async tools():Promise<MCPTool[]> {if(this.catalog&&Date.now()-this.catalog.time<60000)return this.catalog.tools;await this.init();let cursor:string|undefined;const tools:MCPTool[]=[];do{const result=await this.rpc('tools/list',cursor?{cursor}:{});tools.push(...result.tools || []);cursor=result.nextCursor;}while(cursor);this.catalog={time:Date.now(),tools};return tools;}
 async call(name:string,args:Record<string,unknown>) {await this.init();const result=await this.rpc('tools/call',{name,arguments:args});if(result.isError)throw new Error(result.content?.filter((c:any)=>c.type==='text').map((c:any)=>c.text).join('\n') || 'Pixelcut tool failed.');return result;}
}
export const pixelcut = new Pixelcut();
