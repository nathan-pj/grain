import { useEffect, useRef, useState } from 'react';
import { ArrowDownToLine, ArrowRight, ImagePlus, LoaderCircle, Upload, X } from 'lucide-react';
import type { Asset, Run, StudioState } from '../types';
import { api } from '../api';
import ImageInspector from './ImageInspector';
import ResizeCanvas from './ResizeCanvas';
import GrainField from './GrainField';
import { inputDimensions, outputDimensions } from '../resize';

export default function UpscalePanel({ asset, setAsset, state, refresh, hide, preview, remove }: { asset: Asset|null; setAsset:(a:Asset|null)=>void; state:StudioState; refresh:()=>Promise<unknown>; hide:(r:string,j:string)=>void; preview:(a:Asset)=>void; remove:(id:string)=>void }) {
 const fileInput=useRef<HTMLInputElement>(null), uploadLock=useRef(false), submitLock=useRef(false), submission=useRef<{id:string;content:string}|null>(null);
 const [percent,setPercent]=useState(100),[factor,setFactor]=useState(2),[configured,setConfigured]=useState(false);
 const [showResult,setShowResult]=useState(false);
 const [pendingRun,setPendingRun]=useState<string|null>(null);
 const [busy,setBusy]=useState(false),[uploading,setUploading]=useState(false),[error,setError]=useState(''),[dragging,setDragging]=useState(false);
 useEffect(()=>{void api<{configured:boolean}>('/api/fal/status').then(s=>setConfigured(s.configured)).catch(e=>setError(e.message));},[]);
 useEffect(()=>{setPercent(100);setError('');},[asset?.id]);
 const upload=async(files:File[])=>{
  if(uploadLock.current||!files.length)return;
  if(files.length>1){setError('Choose one image at a time.');return;}
  const f=files[0];if(!['image/png','image/jpeg','image/webp'].includes(f.type)||f.size>20*1024*1024){setError('Use a PNG, JPEG or WebP image up to 20 MB.');return;}
  uploadLock.current=true;setUploading(true);setError('');
  try{const body=new FormData();body.append('images',f);const [a]=await api<Asset[]>('/api/assets',{method:'POST',body});setAsset(a);setShowResult(false);await refresh();}catch(e){setError((e as Error).message);}finally{uploadLock.current=false;setUploading(false);}
 };
 useEffect(()=>{const paste=(e:ClipboardEvent)=>{const files=Array.from(e.clipboardData?.files||[]).filter(f=>f.type.startsWith('image/'));if(files.length){e.preventDefault();void upload(files);}};window.addEventListener('paste',paste);return()=>window.removeEventListener('paste',paste);},[]);
 let input:{width:number;height:number}|undefined,output:typeof input,sizeError='';
 if(asset)try{input=inputDimensions(asset.width,asset.height,percent);output=outputDimensions(input.width,input.height,factor);}catch(e){sizeError=(e as Error).message;}
 const submit=async()=>{
  if(!asset||!output||submitLock.current||uploadLock.current)return;
  submitLock.current=true;setBusy(true);setError('');
  const content=JSON.stringify({assetId:asset.id,percent,factor});
  if(submission.current?.content!==content)submission.current={id:crypto.randomUUID(),content};
  try{setSelectedResult(null);setShowResult(false);const created=await api<Run>('/api/upscales',{method:'POST',body:JSON.stringify({id:submission.current.id,assetId:asset.id,percent,factor})});setPendingRun(created.id);submission.current=null;await refresh();}catch(e){setError((e as Error).message);}finally{submitLock.current=false;setBusy(false);}
 };
 const runs=state.runs.filter(r=>r.kind==='upscale');
 const [selectedResult,setSelectedResult]=useState<string|null>(null);
 const sourceRuns=runs.filter(r=>r.sourceAssetId===asset?.id);
 const results=sourceRuns.flatMap(r=>r.jobs.filter(j=>j.status==='succeeded'&&!j.hiddenAt&&j.assetId&&!state.assets[j.assetId]?.deletedAt).map(j=>state.assets[j.assetId!]));
 const result=results.find(a=>a?.id===selectedResult);
 useEffect(()=>{const run=sourceRuns.find(r=>r.jobs.some(j=>j.assetId===selectedResult));if(run){setPercent(run.inputPercent??100);setFactor(run.upscaleFactor??2);}},[selectedResult,asset?.id]);
 useEffect(()=>{if(!pendingRun)return;const run=state.runs.find(r=>r.id===pendingRun);const completed=run?.jobs.find(j=>j.status==='succeeded'&&j.assetId);if(completed){setSelectedResult(completed.assetId!);setShowResult(true);setPendingRun(null);}else if(run?.jobs.every(j=>['failed','interrupted'].includes(j.status)))setPendingRun(null);},[pendingRun,state.runs]);
 const active=sourceRuns.some(r=>r.jobs.some(j=>!j.hiddenAt&&['queued','generating'].includes(j.status)));
 const inspect=(run:Run,a:Asset)=>{const source=run.sourceAssetId?state.assets[run.sourceAssetId]:null;if(source){setAsset(source);setSelectedResult(a.id);setShowResult(true);window.scrollTo(0,0);}else preview(a);};
 const retrieve=async(run:Run)=>{try{await api(`/api/upscales/${run.id}/retrieve`,{method:'POST'});await refresh();}catch(e){setError((e as Error).message);}};
 return <main className="upscaler-page" aria-label="Upscaler">
 <div className="upscaler-workspace">
 <div className={`upscale-canvas ${dragging?'dragging':''}`} onDragOver={e=>{e.preventDefault();setDragging(true);}} onDragLeave={e=>{if(!e.currentTarget.contains(e.relatedTarget as Node))setDragging(false);}} onDrop={e=>{e.preventDefault();setDragging(false);void upload(Array.from(e.dataTransfer.files));}}>
 {asset?<>{showResult&&result?<ImageInspector key={result.id} image={result} original={asset}/>:<ResizeCanvas asset={asset} percent={percent} setPercent={setPercent}/>}</>:<button className="upscale-empty" onClick={()=>fileInput.current?.click()}><GrainField/><strong>Add an image</strong><span>Drop an image here, or paste from your clipboard.</span><span className="browse-label"><ImagePlus size={17}/>Choose image</span><small>PNG, JPG or WebP · up to 20 MB</small></button>}
 {uploading&&<div className="canvas-busy" role="status"><LoaderCircle className="spin" size={24}/><span>Adding your image…</span></div>}
 </div>
 <section className="upscale-settings" aria-label="Upscale settings"><header><h1>Upscale</h1></header>
 <input ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={e=>{void upload(Array.from(e.target.files||[]));e.target.value='';}}/>
 {asset&&<button className="upload-source" disabled={uploading} onClick={()=>fileInput.current?.click()}><Upload size={15}/>Replace image</button>}
 <fieldset disabled={!asset||uploading} className="upscale-section"><div className="input-resize-settings"><div className="field-heading"><label htmlFor="input-scale">Resize input</label><div className="percent-input"><input aria-label="Input scale percent" type="number" min="10" max="400" step="0.1" value={Number(percent.toFixed(1))} onChange={e=>{setPercent(Number(e.target.value));setShowResult(false);}}/><span>%</span></div></div>
 <input id="input-scale" aria-label="Starting resolution percentage" type="range" min="10" max="400" step="0.1" value={percent} onChange={e=>{setPercent(Number(e.target.value));setShowResult(false);}}/>
 <div className="resolution-presets">{[1024,2048,4096].map(size=>{const p=asset?size/Math.max(asset.width,asset.height)*100:0;return <button key={size} disabled={p>400||p<10} onClick={()=>{setPercent(p);setShowResult(false);}}>{size/1024}K</button>;})}<button onClick={()=>{setPercent(100);setShowResult(false);}}>Original</button></div></div><div className="enlargement-label">Upscale by</div><div className="factor-options">{[2,4].map(n=><button key={n} aria-pressed={factor===n} onClick={()=>setFactor(n)}><strong>{n}×</strong></button>)}</div>
 <div className="output-resolution"><span>Original<span>{asset?`${asset.width.toLocaleString()} × ${asset.height.toLocaleString()}`:'Choose an image'}</span></span><ArrowRight size={16}/><span>Estimated output<strong>{output?`${output.width.toLocaleString()} × ${output.height.toLocaleString()}`:'—'}</strong></span></div>

 </fieldset>
 <div className="upscale-footer">{(error||sizeError)&&<p className="panel-error" role="alert">{error||sizeError}</p>}{!configured&&<p className="field-note">Upscaling is unavailable. Check the fal connection on this Mac.</p>}{active&&<p className="processing-status" role="status"><LoaderCircle size={15} className="spin"/>Upscaling… your result will appear here.</p>}<button className="generate-button" disabled={!output||busy||uploading||!configured||active} onClick={()=>void submit()}>{busy?<><LoaderCircle size={17} className="spin"/><span>Starting upscale…</span></>:<><span>{active?'Upscaling…':result?'Upscale again':'Upscale image'}</span><ArrowRight size={17}/></>}</button>{result&&<a className="download-result" href={`${result.url}?download=1`}><ArrowDownToLine size={17}/>Download upscale</a>}</div>
 </section></div>
 <section className="upscale-history" aria-label="Upscale results"><div className="history-heading"><h2>Recent upscales</h2><span>Click a result to compare</span></div><div className="upscale-results">{runs.flatMap(run=>run.jobs.map(job=>{const a=job.assetId?state.assets[job.assetId]:null;if(job.hiddenAt||a?.deletedAt)return null;return <article key={job.id} className={`upscale-result ${a?.id===result?.id?'selected':''}`}>{a?<><button className="result-open" aria-label={`Compare upscale ${a.width} × ${a.height}`} onClick={()=>inspect(run,a)}><img src={a.thumbnail} alt="Upscaled result"/><span>Compare<ArrowRight size={15}/></span></button><div className="result-meta"><span>{a.width.toLocaleString()} × {a.height.toLocaleString()}</span><a href={`${a.url}?download=1`} title="Download upscale" aria-label="Download upscale"><ArrowDownToLine size={16}/></a><button onClick={()=>remove(a.id)} aria-label="Delete upscale" title="Delete"><X size={16}/></button></div></>:<div className="upscale-pending"><button className="hide-job" title="Hide this upscale; processing may continue" aria-label="Hide upscale" onClick={()=>hide(run.id,job.id)}><X size={16}/></button>{['queued','generating'].includes(job.status)?<><LoaderCircle size={22} className="spin"/><span>{job.status==='queued'?'Queued':'Upscaling'}</span><small>You can keep working while this finishes.</small></>:<><span>Upscale failed</span><p>{job.error}</p>{run.falRequest&&<button className="text-button" onClick={()=>void retrieve(run)}>Retrieve result</button>}</>}</div>}</article>;}))}</div>{!runs.some(r=>r.jobs.some(j=>!j.hiddenAt&&!(j.assetId&&state.assets[j.assetId]?.deletedAt)))&&<p className="history-empty">Your finished upscales will appear here, ready to inspect.</p>}</section>
 </main>;
}
