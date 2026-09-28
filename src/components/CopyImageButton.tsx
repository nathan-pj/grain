import { useEffect, useState } from 'react';
import { Clipboard } from 'lucide-react';
import { copyImage } from '../clipboard-image';
export default function CopyImageButton({url}:{url:string}) {
 const [status,setStatus]=useState('');
 useEffect(()=>{setStatus('');},[url]);
 useEffect(()=>{if(!status)return;const timer=setTimeout(()=>setStatus(''),4000);return()=>clearTimeout(timer);},[status]);
 return <><button className="round-action" aria-label="Copy image" title="Copy image" onClick={()=>{const promise=copyImage(url);setStatus('Copying…');void promise.then(()=>setStatus('Copied')).catch(()=>setStatus('Could not copy image'));}}><Clipboard size={19}/><span>{status||'Copy image'}</span></button><span className="sr-only" role="status">{status}</span></>;
}
