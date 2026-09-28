import type { Asset, StudioState } from './types';
export type CanvasNode={id:string;assetId?:string;parentId?:string;runId?:string;x:number;y:number;percent:number;factor:number;pendingWidth?:number;pendingHeight?:number};
export type UpscaleProject={id:string;name:string;closed:boolean;nodes:CanvasNode[];selectedId?:string;view:{x:number;y:number;zoom:number}};
export const makeProject=(name:string):UpscaleProject=>({id:crypto.randomUUID(),name,closed:false,nodes:[],view:{x:80,y:70,zoom:1}});
export const nodeSize=(node:CanvasNode,asset?:Asset)=>{const w=asset?.width??node.pendingWidth??1200,h=asset?.height??node.pendingHeight??1200;const ratio=h/w;const width=w/4*node.percent/100;return {width,height:width*ratio};};
export function reconcileProjects(projects:UpscaleProject[],state:StudioState){let changed=false;const next=projects.map(p=>({...p,nodes:p.nodes.map(n=>{if(!n.runId||n.assetId)return n;const job=state.runs.find(r=>r.id===n.runId)?.jobs.find(j=>j.status==='succeeded'&&j.assetId);if(!job?.assetId)return n;changed=true;return {...n,assetId:job.assetId};})}));return changed?next:projects;}
export function childNode(parent:CanvasNode,asset:Asset,nodes:CanvasNode[],assets:Record<string,Asset>={}):CanvasNode{const size=nodeSize(parent,asset);const siblings=nodes.filter(n=>n.parentId===parent.id);return {id:crypto.randomUUID(),parentId:parent.id,runId:crypto.randomUUID(),x:parent.x+size.width+150,y:siblings.length?Math.max(...siblings.map(n=>n.y+nodeSize(n,n.assetId?assets[n.assetId]:undefined).height))+100:parent.y,percent:100,factor:2,pendingWidth:Math.round(asset.width*parent.percent/100)*parent.factor,pendingHeight:Math.round(asset.height*parent.percent/100)*parent.factor};}
/** Rebuild old source/result links so existing upscales stay reachable after the canvas upgrade. */
export function legacyProject(state:StudioState):UpscaleProject|undefined{
 const runs=state.runs.filter(r=>r.kind==='upscale'&&r.sourceAssetId).slice().reverse();if(!runs.length)return;
 const p=makeProject('Previous upscales');const byAsset=new Map<string,CanvasNode>();
 for(const run of runs){const a=state.assets[run.sourceAssetId!];if(!a)continue;let parent=byAsset.get(a.id);if(!parent){parent={id:crypto.randomUUID(),assetId:a.id,x:0,y:p.nodes.length*450,percent:100,factor:2};p.nodes.push(parent);byAsset.set(a.id,parent);}
 for(const job of run.jobs){if(job.hiddenAt||(job.assetId&&state.assets[job.assetId]?.deletedAt))continue;const n={...childNode(parent,a,p.nodes,state.assets),runId:run.id,assetId:job.assetId};p.nodes.push(n);if(n.assetId)byAsset.set(n.assetId,n);}}
 p.nodes=arrangeNodes(p.nodes,state.assets);p.selectedId=p.nodes[0]?.id;return p.nodes.length?p:undefined;
}

export function arrangeNodes(nodes:CanvasNode[],assets:Record<string,Asset>):CanvasNode[]{
 const depths=new Map<string,number>();const depth=(n:CanvasNode):number=>{if(depths.has(n.id))return depths.get(n.id)!;depths.set(n.id,0);const parent=nodes.find(p=>p.id===n.parentId);const d=parent?depth(parent)+1:0;depths.set(n.id,d);return d;};nodes.forEach(depth);
 const widths:number[]=[];nodes.forEach(n=>{const d=depth(n);widths[d]=Math.max(widths[d]||0,nodeSize(n,n.assetId?assets[n.assetId]:undefined).width);});const ys:number[]=[],xs:number[]=[0];widths.forEach((w,i)=>{xs[i+1]=xs[i]+w+150;});return nodes.map(n=>{const d=depth(n),y=ys[d]||0;ys[d]=y+nodeSize(n,n.assetId?assets[n.assetId]:undefined).height+100;return {...n,x:xs[d],y};});
}
