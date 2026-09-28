import { Grid2X2, Image } from 'lucide-react';
export default function Toolbar({size,setSize,section,count,saveStatus}:{size:number;setSize:(n:number)=>void;section:string;count:number;saveStatus:string}) {
 if(section!=='images')return null;
 return <header className="gallery-toolbar"><div><span className="section-title">{section==='images'?'Images':'Upscale'}</span><span className="toolbar-subtitle">{section==='images'?`${count} ${count===1?'image':'images'} · ${saveStatus === 'Saved' ? 'Draft saved' : saveStatus}`:'SeedVR2'}</span></div>{section==='images'&&<div className="thumbnail-control"><Grid2X2 size={14}/><input aria-label="Thumbnail size" title="Thumbnail size" type="range" min="150" max="520" step="10" value={size} onChange={e=>setSize(Number(e.target.value))}/><Image size={17}/></div>}</header>;
}
