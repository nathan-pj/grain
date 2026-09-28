import { useEffect, useRef, useState } from 'react';
import { Maximize2, Minimize2, MoveDiagonal2 } from 'lucide-react';
import type { Asset } from '../types';
import { inputDimensions } from '../resize';
import { draggedInputPercent } from '../resize-preview';

/** Resizing the frame changes the actual input dimensions, not the final upscale factor. */
export default function ResizeCanvas({asset,percent,setPercent}:{asset:Asset;percent:number;setPercent:(n:number)=>void}) {
 const [viewZoom,setViewZoom]=useState(1),[focused,setFocused]=useState(false);
 const pan=useRef<{x:number;y:number;left:number;top:number}|null>(null);
 useEffect(()=>{setViewZoom(1);},[asset.id]);
 useEffect(()=>{if(!focused)return;const close=(e:KeyboardEvent)=>{if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();setFocused(false);}};window.addEventListener('keydown',close,true);return()=>window.removeEventListener('keydown',close,true);},[focused]);
 const viewport=useRef<HTMLDivElement>(null);
 const [bounds,setBounds]=useState({width:700,height:480});
 const drag=useRef<{x:number;y:number;percent:number}|null>(null);
 useEffect(()=>{const el=viewport.current;if(!el)return;const observer=new ResizeObserver(([entry])=>setBounds({width:entry.contentRect.width,height:entry.contentRect.height}));observer.observe(el);return()=>observer.disconnect();},[]);
 useEffect(()=>{const el=viewport.current;if(!el)return;const wheel=(e:WheelEvent)=>{e.preventDefault();const delta=e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?bounds.height:1);setViewZoom(z=>Math.max(.2,Math.min(8,z*Math.exp(-delta*.003))));};el.addEventListener('wheel',wheel,{passive:false});return()=>el.removeEventListener('wheel',wheel);},[bounds.height]);
 const fit=Math.max(.001,Math.min((bounds.width-100)/asset.width,(bounds.height-100)/asset.height,1));
 const baseW=asset.width*fit*viewZoom,baseH=asset.height*fit*viewZoom;
 const anchorX=Math.max(48,(bounds.width-baseW)/2),anchorY=Math.max(48,(bounds.height-baseH)/2);
 const width=Math.max(8,baseW*percent/100),height=Math.max(8,baseH*percent/100);
 let dimensions='';try{const size=inputDimensions(asset.width,asset.height,percent);dimensions=`${size.width.toLocaleString()} × ${size.height.toLocaleString()}`;}catch{dimensions='Invalid size';}
 const resize=(value:number)=>setPercent(Math.max(10,Math.min(400,Math.round(value*10)/10)));
 return <section className={`resize-editor ${focused?'viewer-focused':''}`} aria-label="Resize image before upscaling">
 <div className="resize-toolbar"><span>Input preview</span><div className="zoom-controls"><button onClick={()=>setViewZoom(1)}>Fit</button><output aria-label="Preview zoom">{Math.round(fit*viewZoom*100)}%</output><button aria-label={focused?"Exit focus view":"Focus image"} onClick={()=>setFocused(!focused)}>{focused?<Minimize2 size={16}/>:<Maximize2 size={16}/>}</button></div></div>
 <div className="resize-viewport" ref={viewport} onPointerDown={e=>{if((e.target as HTMLElement).closest('.resize-handle')||e.button!==0)return;pan.current={x:e.clientX,y:e.clientY,left:e.currentTarget.scrollLeft,top:e.currentTarget.scrollTop};e.currentTarget.setPointerCapture(e.pointerId);}} onPointerMove={e=>{if(!pan.current)return;e.currentTarget.scrollLeft=pan.current.left+pan.current.x-e.clientX;e.currentTarget.scrollTop=pan.current.top+pan.current.y-e.clientY;}} onPointerUp={()=>{pan.current=null;}} onPointerCancel={()=>{pan.current=null;}}><div className="resize-stage" style={{width:Math.max(bounds.width,width+anchorX+48),height:Math.max(bounds.height,height+anchorY+48),paddingLeft:anchorX,paddingTop:anchorY}}><div className="resize-image-frame" style={{width,height}}>
 <img src={asset.url} alt="Input image before upscaling" draggable={false}/><span className="resize-size">{dimensions}</span>
 <span className="frame-corner top-left"/><span className="frame-corner top-right"/><span className="frame-corner bottom-left"/>
 <button className="resize-handle" role="slider" aria-label="Drag to resize input" aria-valuemin={10} aria-valuemax={400} aria-valuenow={Number(percent.toFixed(1))} aria-valuetext={`${Number(percent.toFixed(1))} percent, ${dimensions} pixels`} title="Drag to resize. Arrow keys change size; Shift changes faster."
 onPointerDown={e=>{e.preventDefault();drag.current={x:e.clientX,y:e.clientY,percent};e.currentTarget.setPointerCapture(e.pointerId);}}
 onPointerMove={e=>{if(!drag.current)return;const d=drag.current;resize(draggedInputPercent(d.percent,e.clientX-d.x,e.clientY-d.y,baseW,baseH));}}
 onPointerUp={e=>{drag.current=null;if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);}}
 onPointerCancel={()=>{drag.current=null;}}
 onKeyDown={e=>{const delta=['ArrowRight','ArrowUp'].includes(e.key)?1:['ArrowLeft','ArrowDown'].includes(e.key)?-1:0;if(delta||e.key==='Home'||e.key==='End'){e.preventDefault();resize(e.key==='Home'?10:e.key==='End'?400:percent+delta*(e.shiftKey?10:1));}}}><MoveDiagonal2 size={16}/></button>
 </div></div></div>
 <div className="resize-footer"><span>{asset.width.toLocaleString()} × {asset.height.toLocaleString()}</span></div>
 </section>;
}
