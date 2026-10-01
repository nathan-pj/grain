import { useEffect, useRef } from 'react';
import { api } from '../api';
import type { GeneratorTab, GeneratorFolder } from '../generator-tabs';
import { makeGeneratorTab, makeGeneratorFolder, moveGeneratorFolder } from '../generator-tabs';
export type Workspace={tabs:GeneratorTab[];folders:GeneratorFolder[];activeId:string};
export default function AgentBridge({snapshot,apply}:{snapshot:Workspace;apply:(value:Workspace)=>void}) {
 const current=useRef(snapshot),applyRef=useRef(apply),clientId=useRef(crypto.randomUUID());
 current.current=snapshot;applyRef.current=apply;
 useEffect(()=>{
  let stopped=false;let timer:ReturnType<typeof setTimeout>;let completed:{id:string;result?:unknown;error?:string}[]=[];
  const seen=new Set<string>();
  const tick=async()=>{try{
   const sent=completed;const reply=await api<{command?:{id:string;action:string;args:any}}>('/api/bridge',{method:'POST',body:JSON.stringify({clientId:clientId.current,snapshot:current.current,completed:sent})});
   if(stopped)return;completed=[];
   const c=reply.command;
   if(c&&!seen.has(c.id)){
    seen.add(c.id);
    try{
     const next=structuredClone(current.current),a=c.args;let result:unknown;
     const tab=()=>{const t=next.tabs.find(t=>t.id===a.tabId);if(!t)throw Error('Tab not found.');return t;};
     const folder=()=>{const f=next.folders.find(f=>f.id===a.folderId);if(!f)throw Error('Folder not found.');return f;};
     const folderExists=(id?:string)=>{if(id&&!next.folders.some(f=>f.id===id))throw Error('Folder not found.');};
     switch(c.action){
      case 'create_tab': {folderExists(a.folderId);const t=makeGeneratorTab({prompt:'',referenceIds:[],count:1,quality:'high'},String(a.name||'Untitled').slice(0,80));t.folderId=a.folderId;next.tabs.push(t);next.activeId=t.id;result=t;break;}
      case 'open_tab': tab().closed=false;next.activeId=tab().id;result=tab();break;
      case 'rename_tab':if(tab().id==='main')throw Error('Main cannot be renamed.');tab().name=String(a.name||'Untitled').slice(0,80);result=tab();break;
      case 'close_tab':if(tab().id==='main')throw Error('Main cannot be closed.');tab().closed=true;if(next.activeId===a.tabId)next.activeId='main';result=tab();break;
      case 'update_draft':tab().draft=a.draft;result=tab();break;
      case 'create_folder':{folderExists(a.parentId);const f=makeGeneratorFolder(String(a.name||'Folder').slice(0,80));f.parentId=a.parentId;next.folders.push(f);result=f;break;}
      case 'rename_folder':folder().name=String(a.name||'Folder').slice(0,80);result=folder();break;
      case 'open_folder':folder().open=a.open!==false;result=folder();break;
      case 'move_tab':folderExists(a.folderId);if(tab().id==='main')throw Error('Main cannot be moved.');tab().folderId=a.folderId;result=tab();break;
      case 'move_folder':folderExists(a.parentId);next.folders=moveGeneratorFolder(next.folders,folder().id,a.parentId);result=next.folders.find(f=>f.id===a.folderId);break;
      default:throw Error('Unknown command.');
     }
     // Mirror immediately on the next heartbeat, including before acknowledging the command.
     current.current=next;applyRef.current(next);completed.push({id:c.id,result});
    }catch(e){completed.push({id:c.id,error:(e as Error).message});}
   }
  }catch{ /* Preserve pending acknowledgements across a transient connection failure. */ }
  if(!stopped)timer=setTimeout(tick,700);
 };void tick();return()=>{stopped=true;clearTimeout(timer);};
 },[]);
 return null;
}
