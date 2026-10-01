import { useRef, useState } from 'react';
import { GripVertical, ImagePlus, LoaderCircle, Minus, Plus, X } from 'lucide-react';
import HiggsfieldOptions from './HiggsfieldOptions';
import GenerationProvider from './GenerationProvider';
import AspectRatio from './AspectRatio';
import { copyImage } from '../clipboard-image';
import type { Asset, Connection, Draft, ImageQuality } from '../types';

type Props = {
  draft: Draft; assets: Record<string, Asset>; update: (d: Draft) => void;
  upload: (files: File[]) => Promise<void>; uploading: boolean; generating: boolean;
  connection: Connection | null; refreshConnection: () => Promise<void>; saveStatus: string; submit: () => void; saveKey: (key: string) => Promise<void>; error: string | null; clearError: () => void;
};
export default function Composer(p: Props) {
  const [collapsed,setCollapsed]=useState(()=>localStorage.getItem('grain-dock-collapsed')==='true');
  const [dragY,setDragY]=useState(0);
  const dockDrag=useRef<{y:number; moved:boolean}|null>(null);
  const collapse=(value:boolean)=>{setCollapsed(value);localStorage.setItem('grain-dock-collapsed',String(value));};
  const input = useRef<HTMLInputElement>(null);
  const pointer = useRef<{ id: string; x: number; y: number; target: string | null } | null>(null);
  const suppressReferenceCopy = useRef(false);
  const [dragging, setDragging] = useState<{ id: string; x: number; y: number } | null>(null);
  const [dropId, setDropId] = useState<string | null>(null);
  const [overFiles, setOverFiles] = useState(false);
  const [referenceCopyStatus, setReferenceCopyStatus] = useState('');
  const [keyOpen, setKeyOpen] = useState(false), [key, setKey] = useState(''), [savingKey, setSavingKey] = useState(false);
  const cannotGenerate = (!p.draft.prompt.trim() && !(p.connection?.provider === 'higgsfield' && p.draft.referenceIds.length)) || p.uploading || p.generating || !p.connection?.connected;
  const refs = p.draft.referenceIds.map(id => p.assets[id]).filter(Boolean);
  function move(id: string, target: string) {
    const ids = [...p.draft.referenceIds], from = ids.indexOf(id), to = ids.indexOf(target);
    if (from < 0 || to < 0 || from === to) return;
    ids.splice(from, 1); ids.splice(to, 0, id);
    p.update({ ...p.draft, referenceIds: ids });
  }
  return <section className={`prompt-dock ${collapsed?'dock-collapsed':''} ${dockDrag.current?'dock-dragging':''} ${overFiles ? 'file-over' : ''}`} aria-label="Image prompt" style={{translate:`0 ${dragY}px`}}
    onDragOver={e => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setOverFiles(true); } }}
    onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOverFiles(false); }}
    onDrop={e => { if (e.dataTransfer.files.length) { e.preventDefault(); setOverFiles(false); void p.upload([...e.dataTransfer.files]); } }}>
    <button type="button" className="dock-drag-handle" aria-label={collapsed?'Expand prompt bar':'Minimize prompt bar'} aria-expanded={!collapsed} title={collapsed?'Click or drag up to expand':'Drag down to minimize'}
      onPointerDown={e=>{if(e.button!==0)return;dockDrag.current={y:e.clientY,moved:false};e.currentTarget.setPointerCapture(e.pointerId);}}
      onPointerMove={e=>{const d=dockDrag.current;if(!d)return;const dy=e.clientY-d.y;if(Math.abs(dy)>5)d.moved=true;setDragY(collapsed?Math.max(-60,Math.min(0,dy)):Math.max(0,Math.min(140,dy)));}}
      onPointerUp={e=>{const d=dockDrag.current;if(!d)return;const dy=e.clientY-d.y;if(d.moved){if(dy>35)collapse(true);if(dy< -25)collapse(false);}else collapse(!collapsed);dockDrag.current=null;setDragY(0);if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);}}
      onPointerCancel={()=>{dockDrag.current=null;setDragY(0);}}
      onClick={e=>{if(e.detail===0)collapse(!collapsed);}}><span className="dock-grip"/>{collapsed&&<span className="dock-collapsed-label">{p.draft.prompt.trim()?p.draft.prompt.slice(0,65):'Prompt'}<small>{p.connection?.provider==='higgsfield'?'Higgsfield':p.connection?.provider==='codex'?'Codex':'OpenAI API'}</small></span>}</button>
    {refs.length === 0 && <button className="reference-empty" onClick={() => input.current?.click()} disabled={p.uploading}><ImagePlus size={21}/><span>Add reference images<small>Drop, paste or browse · optional</small></span></button>}{refs.length > 0 && <div className="reference-strip" role="list" aria-label="Reference images, drag to reorder">
      {refs.map((asset, index) => <div key={asset.id} data-reference-id={asset.id} className={`reference-thumb ${dropId === asset.id ? 'drop-target' : ''} ${dragging?.id === asset.id ? 'dragging' : ''}`} role="listitem" style={dragging?.id === asset.id ? { transform: `translate(${dragging.x}px, ${dragging.y}px)` } : undefined}>
        <button className="reference-grip" aria-label={`Reference ${index + 1}: ${asset.name}. Click to copy. Drag to reorder, or use left and right arrow keys.`} title="Click to copy · drag to reorder"
          onClick={() => { if (suppressReferenceCopy.current) { suppressReferenceCopy.current = false; return; } setReferenceCopyStatus('Copying…'); void copyImage(asset.url).then(() => { setReferenceCopyStatus('Copied'); setTimeout(() => setReferenceCopyStatus(''), 1400); }).catch(error => { setReferenceCopyStatus((error as Error).message); setTimeout(() => setReferenceCopyStatus(''), 2400); }); }}
          onPointerDown={e => { if (e.button !== 0) return; suppressReferenceCopy.current = false; pointer.current = { id: asset.id, x: e.clientX, y: e.clientY, target: null }; e.currentTarget.setPointerCapture(e.pointerId); }}
          onPointerMove={e => { const start = pointer.current; if (!start || start.id !== asset.id) return; const x = e.clientX - start.x, y = e.clientY - start.y; if (Math.hypot(x, y) < 6 && !dragging) return; suppressReferenceCopy.current = true; setDragging({ id: asset.id, x, y }); const target = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-reference-id]')?.getAttribute('data-reference-id') || null; if (target !== asset.id) { start.target = target; setDropId(target); } }}
          onPointerUp={e => { const start = pointer.current; if (start?.id === asset.id && start.target) move(start.id, start.target); pointer.current = null; setDragging(null); setDropId(null); if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId); }}
          onPointerCancel={() => { pointer.current = null; setDragging(null); setDropId(null); }}
          onKeyDown={e => { if (e.key === 'ArrowLeft' && index > 0) { e.preventDefault(); move(asset.id, p.draft.referenceIds[index - 1]); } if (e.key === 'ArrowRight' && index < refs.length - 1) { e.preventDefault(); move(asset.id, p.draft.referenceIds[index + 1]); } }}>
          <img src={asset.thumbnail} alt={`Reference ${index + 1}`} draggable={false}/><span className="reference-index">{index + 1}</span><GripVertical className="grip-mark" size={14}/>
        </button>
        <button className="remove-reference" aria-label={`Remove reference ${index + 1}`} onClick={() => p.update({ ...p.draft, referenceIds: p.draft.referenceIds.filter(id => id !== asset.id) })}><X size={11}/></button>
      </div>)}
      {refs.length < 20 && <button className="add-reference-tile" aria-label="Add reference images" onClick={() => input.current?.click()} disabled={p.uploading}>{p.uploading ? <LoaderCircle size={22} className="spin"/> : <ImagePlus size={23} strokeWidth={1.6}/>}</button>}
    </div>}
    {referenceCopyStatus && <div className="reference-copy-status" role="status">{referenceCopyStatus}</div>}
    <label className="sr-only" htmlFor="prompt">Prompt</label>
    <textarea aria-label="Prompt" id="prompt" value={p.draft.prompt} onChange={e => p.update({ ...p.draft, prompt: e.target.value })} placeholder="Describe your image…" maxLength={20000} spellCheck
      onKeyDown={e => { if (e.key !== 'Enter' || e.shiftKey || e.nativeEvent.isComposing || e.keyCode === 229) return; e.preventDefault(); if (!e.repeat && !cannotGenerate) p.submit(); }}
      onPaste={e => { const files = [...e.clipboardData.files].filter(f => f.type.startsWith('image/')); if (files.length) { e.preventDefault(); void p.upload(files); } }}/>
    {p.error && <div className="inline-error" role="alert"><span>{p.error}</span><button onClick={p.clearError} aria-label="Dismiss error"><X size={14}/></button></div>}
    <div className="dock-controls">
      <div className="dock-options"><button className="attach-button" title="Add reference images" aria-label="Add reference images" onClick={() => input.current?.click()} disabled={p.uploading || refs.length === 20}>{p.uploading ? <LoaderCircle size={20} className="spin"/> : <Plus size={22} strokeWidth={1.5}/>}</button>
        <GenerationProvider connection={p.connection} changed={p.refreshConnection}/>
        {p.connection?.provider === 'higgsfield' ? <HiggsfieldOptions draft={p.draft} update={p.update}/> : p.connection?.provider === 'codex' ? <span className="model-chip" title="Codex chooses its built-in image model and quality; Sunburst selection is not guaranteed.">Built-in image model</span> : <><label className="quality-control" title="Image quality"><span className="sr-only">Image quality</span><select aria-label="Image quality" value={p.draft.quality ?? 'high'} onChange={e => p.update({ ...p.draft, quality: e.target.value as ImageQuality })}>{(['low', 'medium', 'high', 'xhigh', 'max'] as ImageQuality[]).map(value => <option key={value} value={value}>{value}</option>)}</select></label><AspectRatio prompt={p.draft.prompt} update={prompt => p.update({ ...p.draft, prompt })}/></>}
        <div className="count-control" role="group" aria-label="Number of images"><button aria-label="Fewer images" onClick={() => p.update({ ...p.draft, count: p.draft.count - 1 })} disabled={p.draft.count === 1}><Minus size={17}/></button><span aria-live="polite">{p.draft.count}<span className="count-max">/4</span></span><button aria-label="More images" onClick={() => p.update({ ...p.draft, count: p.draft.count + 1 })} disabled={p.draft.count === 4}><Plus size={17}/></button></div>
      </div>
      <button className="generate-button" title={p.connection?.connected ? 'Generate · Enter (Shift+Enter for a new line)' : p.connection?.message || 'Checking connection…'} onClick={p.submit} disabled={cannotGenerate}>{p.generating ? <LoaderCircle size={18} className="spin"/> : null}<span>{p.generating ? 'Queueing' : 'Generate'}</span></button>
    </div>
    <div className="composer-footer"><span className={`connection-dot ${p.connection?.connected ? 'connected' : ''}`}/><span>{p.connection?.connected ? p.connection.provider === 'higgsfield' ? `${Math.floor(p.connection.credits || 0).toLocaleString()} credits · ${p.connection.workspace}` : p.connection.provider === 'codex' ? 'Uses your Codex allowance' : 'OpenAI API billing' : p.connection?.provider === 'higgsfield' ? 'Connect Higgsfield to generate' : p.connection?.provider === 'codex' ? <button onClick={() => void p.refreshConnection()} title="Sign in to Codex with ChatGPT, then click to refresh">Check Codex connection</button> : p.connection ? <button className="key-open" onClick={() => setKeyOpen(true)}>Add OpenAI API key</button> : 'Checking connection…'}</span><small>Enter to generate · Shift + Enter for a new line</small></div><input ref={input} type="file" accept="image/png,image/jpeg,image/webp" multiple hidden onChange={e => { void p.upload([...(e.target.files || [])]); e.target.value = ''; }}/>
    {keyOpen && <div className="key-backdrop" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) setKeyOpen(false); }}><form className="key-dialog" aria-label="Connect OpenAI" onSubmit={async e => { e.preventDefault(); setSavingKey(true); try { await p.saveKey(key); setKey(''); setKeyOpen(false); } finally { setSavingKey(false); } }}><header><strong>OpenAI API key</strong><button type="button" aria-label="Close" onClick={() => setKeyOpen(false)}><X size={16}/></button></header><input autoFocus type="password" value={key} onChange={e => setKey(e.target.value)} placeholder="sk-…" autoComplete="off" spellCheck={false}/><button className="generate-button" disabled={savingKey || !key.trim()}>{savingKey ? 'Saving' : 'Save key'}</button></form></div>}
  </section>;
}
