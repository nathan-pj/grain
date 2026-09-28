import CopyImageButton from './components/CopyImageButton';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowDownToLine, Copy, ImagePlus, Images, LoaderCircle, Maximize2, Trash2, X } from 'lucide-react';
import { api } from './api';
import type { Asset, Connection, Draft, StudioState } from './types';
import Composer from './components/Composer';
import ImageInspector from './components/ImageInspector';
import GrainField from './components/GrainField';
import Gallery from './components/Gallery';
import Toolbar from './components/Toolbar';
import UpscalePanel from './components/UpscaleCanvas';
import GeneratorTabs from './components/GeneratorTabs';
import { attachReferencesToTab, closeGeneratorTab, deleteGeneratorFolder, MAIN_GENERATOR_TAB_ID, makeGeneratorFolder, makeGeneratorTab, moveGeneratorFolder, moveGeneratorTabToFolder, restoreGeneratorFolders, restoreGeneratorTabs, runsForGeneratorTab, serializeGeneratorFolders, serializeGeneratorTabs, type GeneratorFolder, type GeneratorTab } from './generator-tabs';
const blank = (): Draft => ({ prompt: '', referenceIds: [], count: 1, quality: 'high' });
const GENERATOR_TABS_KEY = 'grain-generator-tabs-v1', GENERATOR_FOLDERS_KEY = 'grain-generator-folders-v1', ACTIVE_GENERATOR_TAB_KEY = 'grain-generator-active-v1';
export default function App() {
 const [state, setState] = useState<StudioState | null>(null), [draft, setDraft] = useState<Draft>(blank);
 const [generatorTabs, setGeneratorTabs] = useState<GeneratorTab[]>([]), [generatorFolders, setGeneratorFolders] = useState<GeneratorFolder[]>([]), [activeGeneratorTabId, setActiveGeneratorTabId] = useState('');
 const [status, setStatus] = useState<Connection | null>(null), [error, setError] = useState<string | null>(null), [uploading, setUploading] = useState(false), [submitting, setSubmitting] = useState(false);
 const [saveStatus, setSaveStatus] = useState('Saved'), [preview, setPreview] = useState<Asset | null>(null);
 const [deleting, setDeleting] = useState(false), [dismissedDeletion, setDismissedDeletion] = useState<string | null>('__initial__');
 const [upscale, setUpscale] = useState<Asset | null>(null);
 const [section,setSection]=useState<'images'|'upscaler'>('images');
 const [theme,setTheme]=useState<'light'|'dark'>(()=>{const saved=localStorage.getItem('grain-theme');return saved==='light'||saved==='dark'?saved:matchMedia('(prefers-color-scheme: light)').matches?'light':'dark';});
 useEffect(()=>{document.documentElement.dataset.theme=theme;localStorage.setItem('grain-theme',theme);},[theme]);
 const [thumbnailSize, setThumbnailSize] = useState(() => { const n=Number(localStorage.getItem('grain-thumbnail-size'));return n>=150&&n<=520?n:270; });
 const [hiddenUndo, setHiddenUndo] = useState<{runId:string;jobId:string}|null>(null);
 useEffect(() => {document.documentElement.style.setProperty('--thumbnail-size', `${thumbnailSize}px`);localStorage.setItem('grain-thumbnail-size',String(thumbnailSize));},[thumbnailSize]);
 const [ready, setReady] = useState(false), [revision, setRevision] = useState(0);
 const draftRef = useRef(draft), activeGeneratorTabIdRef = useRef(''), saveQueue = useRef(Promise.resolve()), version = useRef(0), uploadLock = useRef(false), submitLock = useRef(false), submitId = useRef<{ id: string; content: string } | null>(null);
 const dialog = useRef<HTMLDialogElement>(null);
 const refresh = useCallback(async () => { const data = await api<StudioState>('/api/state'); setState(data); return data; }, []);
 const checkConnection = useCallback(async () => { try { const c = await api<Connection>('/api/connection'); setStatus(c); if (!c.connected) setError(c.message); } catch { setError('Connection lost. Keep the local server running and reload.'); } }, []);
 useEffect(() => { let live = true; api<StudioState>('/api/state').then(data => { if (live) { const restored=restoreGeneratorTabs(localStorage.getItem(GENERATOR_TABS_KEY),data.draft,localStorage.getItem(ACTIVE_GENERATOR_TAB_KEY));const active=restored.tabs.find(tab=>tab.id===restored.activeId)!;setState(data);setGeneratorTabs(restored.tabs);setGeneratorFolders(restoreGeneratorFolders(localStorage.getItem(GENERATOR_FOLDERS_KEY)));setActiveGeneratorTabId(active.id);activeGeneratorTabIdRef.current=active.id;setDraft(active.draft);draftRef.current=active.draft;setReady(true); } }).catch(e => { if (live) setError(e.message); }); void checkConnection(); return () => { live = false; }; }, [checkConnection]);
 useEffect(()=>{if(!ready||!generatorTabs.length)return;localStorage.setItem(GENERATOR_TABS_KEY,serializeGeneratorTabs(generatorTabs));localStorage.setItem(GENERATOR_FOLDERS_KEY,serializeGeneratorFolders(generatorFolders));localStorage.setItem(ACTIVE_GENERATOR_TAB_KEY,activeGeneratorTabId);},[generatorTabs,generatorFolders,activeGeneratorTabId,ready]);
 useEffect(() => { if (!ready) return; const timer = setInterval(() => { void refresh().catch(() => {}); }, 2000); return () => clearInterval(timer); }, [ready, refresh]);
 useEffect(() => { if (!revision || !ready) return; const currentVersion = version.current; setSaveStatus('Saving'); const timer = setTimeout(() => {
  const snapshot = structuredClone(draftRef.current);
  saveQueue.current = saveQueue.current.catch(() => {}).then(async () => { try { await api('/api/draft', { method: 'PUT', body: JSON.stringify(snapshot) }); if (currentVersion === version.current) setSaveStatus('Saved'); } catch (e) { if (currentVersion === version.current) { setSaveStatus('Not saved'); setError(`Changes haven’t saved. ${(e as Error).message}`); } } });
 }, 250); return () => clearTimeout(timer); }, [revision, ready]);
 useEffect(() => { if (preview) dialog.current?.showModal(); else dialog.current?.close(); }, [preview]);
 useEffect(() => { const warn = (e: BeforeUnloadEvent) => { if (saveStatus !== 'Saved' || uploading) { e.preventDefault(); e.returnValue = ''; } }; window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn); }, [saveStatus, uploading]);
 const update = (value: Draft) => { draftRef.current = value; setDraft(value);setGeneratorTabs(tabs=>tabs.map(tab=>tab.id===activeGeneratorTabIdRef.current?{...tab,draft:structuredClone(value)}:tab)); version.current++; setRevision(version.current); setSaveStatus('Saving'); };
 const activateGeneratorTab=(id:string,tabs=generatorTabs)=>{const tab=tabs.find(item=>item.id===id&&!item.closed);if(!tab)return;activeGeneratorTabIdRef.current=id;setActiveGeneratorTabId(id);draftRef.current=structuredClone(tab.draft);setDraft(draftRef.current);version.current++;setRevision(version.current);setSaveStatus('Saving');setError(null);};
 const addGeneratorTab=()=>{const tab=makeGeneratorTab(blank(),`Untitled ${generatorTabs.filter(item=>item.id!==MAIN_GENERATOR_TAB_ID).length+1}`),tabs=[...generatorTabs,tab];setGeneratorTabs(tabs);activateGeneratorTab(tab.id,tabs);};
 const closeGenerator=(id:string)=>{if(id!==activeGeneratorTabId){setGeneratorTabs(tabs=>tabs.map(tab=>tab.id===id?{...tab,closed:true}:tab));return;}const result=closeGeneratorTab(generatorTabs,id);setGeneratorTabs(result.tabs);activateGeneratorTab(result.activeId,result.tabs);};
 const reopenGenerator=(id:string)=>{const tabs=generatorTabs.map(tab=>tab.id===id?{...tab,closed:false}:tab);setGeneratorTabs(tabs);activateGeneratorTab(id,tabs);};
 const renameGenerator=(id:string,name:string)=>setGeneratorTabs(tabs=>tabs.map(tab=>tab.id===id?{...tab,name:name.trim().slice(0,80)||tab.name}:tab));
 const renameGeneratorFolder=(id:string,name:string)=>setGeneratorFolders(folders=>folders.map(folder=>folder.id===id?{...folder,name:name.trim().slice(0,80)||folder.name}:folder));
 const setGeneratorFolderOpen=(id:string,open:boolean)=>setGeneratorFolders(folders=>folders.map(folder=>folder.id===id?{...folder,open}:folder));
 const moveGeneratorToFolder=(tabId:string,folderId?:string)=>setGeneratorTabs(tabs=>moveGeneratorTabToFolder(tabs,tabId,folderId));
 const moveGeneratorFolderToFolder=(folderId:string,parentId?:string)=>setGeneratorFolders(folders=>moveGeneratorFolder(folders,folderId,parentId));
 const deleteGeneratorFolderById=(folderId:string)=>{const result=deleteGeneratorFolder(generatorTabs,generatorFolders,folderId);setGeneratorTabs(result.tabs);setGeneratorFolders(result.folders);};
 const createGeneratorFolder=(sourceTabId:string,targetTabId:string)=>{if(sourceTabId===targetTabId||sourceTabId===MAIN_GENERATOR_TAB_ID||targetTabId===MAIN_GENERATOR_TAB_ID)return;const target=generatorTabs.find(tab=>tab.id===targetTabId);if(target?.folderId&&generatorFolders.some(folder=>folder.id===target.folderId)){moveGeneratorToFolder(sourceTabId,target.folderId);setGeneratorFolderOpen(target.folderId,true);return;}const folder=makeGeneratorFolder(`Folder ${generatorFolders.length+1}`);setGeneratorFolders(folders=>[...folders,folder]);setGeneratorTabs(tabs=>tabs.map(tab=>tab.id===sourceTabId||tab.id===targetTabId?{...tab,folderId:folder.id}:tab));};
 const load = (value: Draft) => { setSection('images'); update(structuredClone(value)); setPreview(null); setError(null); requestAnimationFrame(() => document.getElementById('prompt')?.focus()); };
 const upload = async (files: File[]) => {
  if (uploadLock.current || !files.length) return;
  const originTabId = activeGeneratorTabIdRef.current;
  if (files.length + draftRef.current.referenceIds.length > 5) return setError('Up to 5 references. Remove one to add another.');
  if (files.some(f => !['image/png', 'image/jpeg', 'image/webp'].includes(f.type) || f.size > 20 * 1024 * 1024)) return setError('Use PNG, JPEG, or WebP, up to 20 MB each.');
  uploadLock.current = true; setUploading(true); setError(null);
  try { const body = new FormData(); files.forEach(f => body.append('images', f)); const assets = await api<Asset[]>('/api/assets', { method: 'POST', body });
   setState(s => s && ({ ...s, assets: { ...s.assets, ...Object.fromEntries(assets.map(a => [a.id, a])) } }));
   const ids=assets.map(a=>a.id);
   setGeneratorTabs(tabs=>{const next=attachReferencesToTab(tabs,originTabId,ids);if(activeGeneratorTabIdRef.current===originTabId){const origin=next.find(tab=>tab.id===originTabId)!;draftRef.current=structuredClone(origin.draft);setDraft(draftRef.current);version.current++;setRevision(version.current);setSaveStatus('Saving');}return next;});
  } catch (e) { setError((e as Error).message); } finally { uploadLock.current = false; setUploading(false); }
 };
 const saveOpenAIKey=async(key:string)=>{await api('/api/openai/key',{method:'PUT',body:JSON.stringify({key})});await checkConnection();setError(null);};
 const submit = async (override?: Draft, generatorTabId = activeGeneratorTabIdRef.current) => {
  if (submitLock.current || uploadLock.current || !status?.connected) return;
  const snapshot = structuredClone(override || draftRef.current);
  if (!snapshot.prompt.trim()) return;
  submitLock.current = true; setSubmitting(true); setError(null);
  const content = JSON.stringify({ draft: snapshot, generatorTabId });
  if (!submitId.current || submitId.current.content !== content) submitId.current = { id: crypto.randomUUID(), content };
  try { await api('/api/runs', { method: 'POST', body: JSON.stringify({ id: submitId.current.id, draft: snapshot, generatorTabId }) }); submitId.current = null; await refresh(); }
  catch (e) { setError((e as Error).message); }
  finally { submitLock.current = false; setSubmitting(false); }
 };
 const reuse = (id: string) => { setSection('images'); if (draftRef.current.referenceIds.includes(id)) return; if (draftRef.current.referenceIds.length >= 5) return setError('All 5 reference slots are filled. Remove one first.'); update({ ...draftRef.current, referenceIds: [...draftRef.current.referenceIds, id] }); setPreview(null); };
 const retry = async (runId: string, jobId: string) => { try { await api(`/api/runs/${runId}/jobs/${jobId}/retry`, { method: 'POST' }); await refresh(); } catch (e) { setError((e as Error).message); } };
 const remove = async (id: string) => {
  if (deleting) return;
  setDeleting(true);
  try { await api(`/api/images/${id}`, { method: 'DELETE' }); setPreview(null); setDismissedDeletion(null); await refresh(); }
  catch (e) { setError((e as Error).message); }
  finally { setDeleting(false); }
 };
 const restore = async (id: string) => {
  if (deleting) return;
  setDeleting(true);
  try { await api(`/api/images/${id}/restore`, { method: 'POST' }); await refresh(); }
  catch (e) { setError((e as Error).message); }
  finally { setDeleting(false); }
 };
 const hide = async (runId:string,jobId:string) => {try{await api(`/api/runs/${runId}/jobs/${jobId}/hide`,{method:'POST'});setHiddenUndo({runId,jobId});await refresh();}catch(e){setError((e as Error).message);}};
 const showHidden = async () => {if(!hiddenUndo)return;try{await api(`/api/runs/${hiddenUndo.runId}/jobs/${hiddenUndo.jobId}/restore`,{method:'POST'});setHiddenUndo(null);await refresh();}catch(e){setError((e as Error).message);}};
 const openUpscale=(asset:Asset)=>{setPreview(null);setUpscale(asset);setSection('upscaler');window.scrollTo(0,0);};
 const lastDeleted = state && Object.values(state.assets).filter(a => a.deletedAt).sort((a, b) => b.deletedAt!.localeCompare(a.deletedAt!))[0];
 const previewRun = preview && state?.runs.find(r => r.jobs.some(j => j.assetId === preview.id));
 const previewSource = previewRun?.sourceAssetId ? state?.assets[previewRun.sourceAssetId] : undefined;
 const visibleRuns = state?.runs.filter(r => r.kind !== 'upscale') || [];
 const tabRuns = runsForGeneratorTab(visibleRuns, activeGeneratorTabId);
 const imageCount = tabRuns.reduce((n,r) => n + r.jobs.filter(j => j.assetId && !j.hiddenAt && !state?.assets[j.assetId]?.deletedAt).length, 0);
 useEffect(()=>{if(!lastDeleted)return;const timer=setTimeout(()=>{setDismissedDeletion(lastDeleted.id);localStorage.setItem('grain-dismissed-deletion',lastDeleted.id);},5000);return()=>clearTimeout(timer);},[lastDeleted?.id]);
 return <><nav className="side-nav" aria-label="Main navigation"><div className="brand" aria-label="Grain"><span className="grain-sigil" aria-hidden="true">{'::\n:∙:\n ::'}</span><span>grain</span></div><button aria-current={section==='images'?'page':undefined} onClick={()=>{setSection('images');window.scrollTo(0,0);}}><Images size={20}/><span>Create</span></button><button aria-current={section==='upscaler'?'page':undefined} onClick={()=>{setSection('upscaler');window.scrollTo(0,0);}}><Maximize2 size={20}/><span>Upscaler</span></button><button className="theme-toggle" aria-label={theme==='dark'?'Switch to light mode':'Switch to dark mode'} onClick={()=>setTheme(theme==='dark'?'light':'dark')}>{theme==='dark'?'Light':'Dark'}</button></nav><div className="app-content">{section==='upscaler'&&error&&<div className="global-error" role="alert"><span>{error}</span><button aria-label="Dismiss error" onClick={()=>setError(null)}><X size={16}/></button></div>}<Toolbar size={thumbnailSize} setSize={setThumbnailSize} section={section} count={imageCount} saveStatus={saveStatus}/>{ready && state ? section==='upscaler'?<UpscalePanel asset={upscale} setAsset={setUpscale} state={state} refresh={refresh}/>:<><GeneratorTabs tabs={generatorTabs} folders={generatorFolders} activeId={activeGeneratorTabId} select={activateGeneratorTab} add={addGeneratorTab} close={closeGenerator} reopen={reopenGenerator} rename={renameGenerator} renameFolder={renameGeneratorFolder} deleteFolder={deleteGeneratorFolderById} setFolderOpen={setGeneratorFolderOpen} moveToFolder={moveGeneratorToFolder} moveFolder={moveGeneratorFolderToFolder} createFolder={createGeneratorFolder}/><div className="creation-workspace">{imageCount>0&&<GrainField/>}<Composer draft={draft} assets={state.assets} update={update} upload={upload} uploading={uploading} generating={submitting} connection={status} saveStatus={saveStatus} submit={() => void submit()} saveKey={saveOpenAIKey} error={error} clearError={() => { setError(null); if (saveStatus === 'Not saved') update(draftRef.current); if (!status?.connected) void checkConnection(); }}/><Gallery size={thumbnailSize} runs={tabRuns} assets={state.assets} load={load} reuse={reuse} preview={setPreview} retry={retry} remove={id => void remove(id)} hide={(r,j)=>void hide(r,j)} upscale={openUpscale}/></div></> : <div className="loading-state" role="status">{error ? <><p>{error}</p><button onClick={() => location.reload()}>Retry</button></> : <LoaderCircle className="spin" size={22}/>}</div>}
 {hiddenUndo&&<div className="delete-notice" role="status"><span>Generation hidden</span><button onClick={()=>void showHidden()}>Undo</button><button aria-label="Dismiss notification" onClick={()=>setHiddenUndo(null)}><X size={14}/></button></div>}
 {!hiddenUndo && lastDeleted && dismissedDeletion !== '__initial__' && dismissedDeletion !== lastDeleted.id && <div className="delete-notice" role="status"><span>Image deleted</span><button disabled={deleting} onClick={() => void restore(lastDeleted.id)}>Undo</button><button aria-label="Dismiss notification" onClick={() => {setDismissedDeletion(lastDeleted.id);localStorage.setItem('grain-dismissed-deletion',lastDeleted.id);}}><X size={14}/></button></div>}
 <dialog className="preview-dialog" ref={dialog} onCancel={() => setPreview(null)} onClick={e => { if (e.target === e.currentTarget) setPreview(null); }} aria-label="Image preview">{preview && <><div className="preview-heading"><div><h2>{previewSource ? 'Inspect upscale' : 'Image detail'}</h2><span>{preview.name}</span></div><button className="icon-button" onClick={() => setPreview(null)} aria-label="Close preview"><X size={20}/></button></div><ImageInspector key={preview.id} image={preview} original={previewSource}/><div className="preview-actions"><CopyImageButton url={preview.url}/><a className="round-action" href={`${preview.url}?download=1`} aria-label="Download original image" title="Download"><ArrowDownToLine size={19}/><span>Download</span></a>{previewRun && previewRun.kind !== 'upscale' && <button className="round-action" onClick={() => load(previewRun.draft)} aria-label="Recreate" title="Recreate"><Copy size={19}/><span className="action-tooltip">Recreate</span></button>}<button className="round-action" onClick={() => reuse(preview.id)} aria-label="Use image as reference" title="Use as reference"><ImagePlus size={19}/><span>Use as reference</span></button><button className="round-action" onClick={()=>openUpscale(preview)} aria-label="Upscale image" title="Upscale"><Maximize2 size={19}/><span>Upscale</span></button><button className="round-action" disabled={deleting} onClick={() => void remove(preview.id)} aria-label="Delete image" title="Delete image"><Trash2 size={19}/></button></div></>}</dialog>
 </div>
 </>;
}
