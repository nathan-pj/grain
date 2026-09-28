import { useEffect, useRef, useState } from 'react';
import { MoveHorizontal, RotateCcw, Maximize2, Minimize2 } from 'lucide-react';
import type { Asset } from '../types';

/** Both layers occupy the output's exact rectangle; zoom is output pixels per CSS pixel. */
export default function ImageInspector({ image, original }: { image: Asset; original?: Asset }) {
 const [focused,setFocused]=useState(false);
 useEffect(()=>{if(!focused)return;const close=(e:KeyboardEvent)=>{if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();setFocused(false);}};window.addEventListener('keydown',close,true);return()=>window.removeEventListener('keydown',close,true);},[focused]);
 const viewport = useRef<HTMLDivElement>(null);
 const [bounds, setBounds] = useState({ width: 600, height: 500 });
 const [zoom, setZoom] = useState<number | 'fit'>('fit');
 const [position, setPosition] = useState({ x: 0, y: 0 });
 const [split, setSplit] = useState(50);
 const [failed, setFailed] = useState(false);
 const pan = useRef<{ x: number; y: number; startX: number; startY: number } | null>(null);
 useEffect(() => {
  const el = viewport.current; if (!el) return;
  const observer = new ResizeObserver(([entry]) => setBounds({ width: entry.contentRect.width, height: entry.contentRect.height }));
  observer.observe(el); return () => observer.disconnect();
 }, []);
 useEffect(() => { setZoom('fit'); setPosition({ x: 0, y: 0 }); setSplit(50); setFailed(false); }, [image.id, original?.id]);
 const scale = zoom === 'fit' ? Math.min((bounds.width - 48) / image.width, (bounds.height - 48) / image.height, 1) : zoom;
 useEffect(()=>{const el=viewport.current;if(!el)return;
  const wheel=(e:WheelEvent)=>{e.preventDefault();const rect=el.getBoundingClientRect();const delta=e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?bounds.height:1);const next=Math.max(.02,Math.min(8,scale*Math.exp(-delta*.003)));const ratio=next/scale;const x=e.clientX-rect.left-bounds.width/2,y=e.clientY-rect.top-bounds.height/2;setZoom(next);setPosition(p=>({x:x-(x-p.x)*ratio,y:y-(y-p.y)*ratio}));};
  el.addEventListener('wheel',wheel,{passive:false});return()=>el.removeEventListener('wheel',wheel);
 },[scale,bounds]);
 const width = Math.max(1, image.width * scale), height = Math.max(1, image.height * scale);
 const limit = (x: number, y: number) => ({ x: Math.max(-Math.max(0, (width - bounds.width) / 2 + 24), Math.min(Math.max(0, (width - bounds.width) / 2 + 24), x)), y: Math.max(-Math.max(0, (height - bounds.height) / 2 + 24), Math.min(Math.max(0, (height - bounds.height) / 2 + 24), y)) });
 const changeZoom = (value: number | 'fit') => { setZoom(value); setPosition({ x: 0, y: 0 }); };
 const layerStyle = { width, height, transform: `translate(-50%, -50%) translate(${position.x}px, ${position.y}px)` };
 return <section className={`inspector ${focused?'viewer-focused':''}`} aria-label="Image inspection">
  <div className="inspector-toolbar">
   <div className="zoom-controls" aria-label="Image zoom"><output aria-label="Current zoom">{Math.round(scale*100)}%</output><button aria-label={focused?"Exit focus view":"Focus image"} onClick={()=>setFocused(!focused)}>{focused?<Minimize2 size={16}/>:<Maximize2 size={16}/>}</button>{(['fit', 1, 2] as const).map(value => <button key={value} aria-pressed={zoom === value} onClick={() => changeZoom(value)}>{value === 'fit' ? 'Fit' : `${value * 100}%`}</button>)}<button aria-label="Reset image view" title="Reset view" onClick={() => { changeZoom('fit'); setSplit(50); }}><RotateCcw size={14}/></button></div>
  </div>
  <div className={`inspection-viewport ${zoom !== 'fit' ? 'can-pan' : ''}`} ref={viewport} tabIndex={0} aria-label="Image canvas. Use arrow keys to pan when zoomed." onKeyDown={e=>{if(e.target!==e.currentTarget||zoom==='fit')return;const step=e.shiftKey?200:50;const direction:Record<string,[number,number]>={ArrowLeft:[step,0],ArrowRight:[-step,0],ArrowUp:[0,step],ArrowDown:[0,-step]};const delta=direction[e.key];if(delta){e.preventDefault();setPosition(p=>limit(p.x+delta[0],p.y+delta[1]));}}}
   onPointerDown={e => { if ((e.target as HTMLElement).closest('.compare-divider') || e.button !== 0) return; pan.current = { x: e.clientX, y: e.clientY, startX: position.x, startY: position.y }; e.currentTarget.setPointerCapture(e.pointerId); }}
   onPointerMove={e => { if (pan.current) setPosition(limit(pan.current.startX + e.clientX - pan.current.x, pan.current.startY + e.clientY - pan.current.y)); }}
   onPointerUp={() => { pan.current = null; }} onPointerCancel={() => { pan.current = null; }}
   onDoubleClick={() => changeZoom(zoom === 'fit' ? 1 : 'fit')}>
   <img className="inspection-layer" style={layerStyle} src={image.url} alt={image.name} draggable={false} onError={() => setFailed(true)}/>
   {original && <><div className="comparison-clip" style={{ clipPath: `inset(0 ${100 - split}% 0 0)` }}><img className="inspection-layer" style={layerStyle} src={original.url} alt="Original image before upscaling" draggable={false} onError={() => setFailed(true)}/></div><div className="compare-divider" style={{ left: `${split}%` }}><span><MoveHorizontal size={20}/></span><div role="slider" tabIndex={0} aria-label="Before and after comparison" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(split)} aria-valuetext={`${Math.round(split)}% original, ${Math.round(100-split)}% upscaled`} onKeyDown={e=>{const delta=e.key==='ArrowLeft'?-2:e.key==='ArrowRight'?2:0;if(delta||e.key==='Home'||e.key==='End'){e.preventDefault();setSplit(e.key==='Home'?0:e.key==='End'?100:Math.max(0,Math.min(100,split+delta)));}}} onPointerDown={e=>{e.stopPropagation();e.currentTarget.setPointerCapture(e.pointerId);}} onPointerMove={e=>{if(!e.currentTarget.hasPointerCapture(e.pointerId))return;const rect=viewport.current!.getBoundingClientRect();setSplit(Math.max(0,Math.min(100,(e.clientX-rect.left)/rect.width*100)));}} onPointerUp={e=>{e.currentTarget.releasePointerCapture(e.pointerId);}}/></div><span className="compare-label before">Before</span><span className="compare-label after">After</span></>}
   {failed && <p className="inspection-error" role="alert">Image couldn’t load. Reopen it or reload Grain to try again.</p>}
  </div>
  <footer className="inspector-footer"><span>{original ? `${original.width.toLocaleString()} × ${original.height.toLocaleString()} → ` : ''}{image.width.toLocaleString()} × {image.height.toLocaleString()}</span></footer>
 </section>;
}
