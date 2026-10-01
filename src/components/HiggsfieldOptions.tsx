import { useEffect, useState } from 'react';
import { api } from '../api';
import type { Draft, HiggsModel, HiggsParam } from '../types';
const label=(name:string)=>name.replaceAll('_',' ').replace(/^./,c=>c.toUpperCase());
export default function HiggsfieldOptions({draft,update}:{draft:Draft;update:(draft:Draft)=>void}) {
 const [models,setModels]=useState<HiggsModel[]>([]),[schema,setSchema]=useState<HiggsModel|null>(null),[error,setError]=useState('');
 const [loading,setLoading]=useState(false);
 const model=draft.higgsfieldModel || 'gpt_image_2_5';
 useEffect(()=>{let active=true;api<HiggsModel[]>('/api/higgsfield/models').then(data=>{if(active)setModels(data);}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[]);
 useEffect(()=>{let active=true;setSchema(null);setError('');setLoading(true);api<HiggsModel>('/api/higgsfield/models/'+encodeURIComponent(model)).then(data=>{if(active)setSchema(data);}).catch(e=>{if(active)setError(e.message);}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[model]);
 const defaults=Object.fromEntries((schema?.params || []).filter(p=>p.default!==undefined&&p.default!==null).map(p=>[p.name,p.default]));
 const legacy=!draft.higgsfieldModel?{variant:'sunburst',quality:draft.quality||'high',resolution:draft.resolution||'1k',aspect_ratio:draft.prompt.match(/(?:\n|^)Make it ([0-9]+:[0-9]+)\s*$/)?.[1]||'1:1'}:{};
 const options:Record<string,unknown>={...defaults,...legacy,...draft.higgsfieldOptions};
 const set=(name:string,value:unknown)=>update({...draft,higgsfieldModel:model,higgsfieldOptions:{...options,[name]:value}});
 function field(p:HiggsParam) {
  const value=options[p.name];
  if(p.enum)return <select aria-label={label(p.name)} value={value===undefined?'':String(value)} onChange={e=>set(p.name,p.enum!.find(v=>String(v)===e.target.value)??null)}><option value="">Default</option>{p.enum.map(v=><option key={String(v)} value={String(v)}>{String(v)}</option>)}</select>;
  if(p.type.includes('boolean'))return <input aria-label={label(p.name)} type="checkbox" checked={value===true} onChange={e=>set(p.name,e.target.checked)}/>;
  if(/array|object/.test(p.type))return <JsonOption key={model+p.name} name={label(p.name)} value={value} change={v=>set(p.name,v)}/>;
  const numeric=/number|integer|int|float/.test(p.type);
  return <input aria-label={label(p.name)} type={numeric?'number':'text'} step={p.type.includes('int')?1:'any'} value={value==null?'':String(value)} placeholder="Default" onChange={e=>set(p.name,e.target.value===''?null:numeric?Number(e.target.value):e.target.value)}/>;
 }
 return <><label className="quality-control"><span className="sr-only">Higgsfield model</span><select aria-label="Higgsfield model" value={model} onChange={e=>update({...draft,higgsfieldModel:e.target.value,higgsfieldOptions:{}})}>{!models.length&&<option value={model}>{model==='gpt_image_2_5'?'GPT Image 2.5':model}</option>}{models.map(m=><option key={m.job_type} value={m.job_type}>{m.display_name}{models.filter(x=>x.display_name===m.display_name).length>1?' · '+label(m.job_type):''}</option>)}</select></label><details className="higgs-options" key={model}><summary>Options</summary><div className="higgs-options-panel">{loading?<span>Loading options…</span>:null}{error&&<p role="alert">{error}</p>}{schema?.params?.filter(p=>!['prompt','image_references'].includes(p.name)).map(p=><label key={p.name} className="higgs-option"><span>{label(p.name)}{p.required?' *':''}</span>{field(p)}</label>)}{schema?.rules?.map((r,i)=><small key={i}>{r.message}</small>)}</div></details></>;
}
function JsonOption({name,value,change}:{name:string;value:unknown;change:(value:unknown)=>void}) {
 const [text,setText]=useState(value==null?'':JSON.stringify(value)),[invalid,setInvalid]=useState(false);
 return <><textarea aria-label={name} aria-invalid={invalid} value={text} placeholder="JSON" onChange={e=>{setText(e.target.value);try{const parsed=e.target.value.trim()?JSON.parse(e.target.value):null;change(parsed);setInvalid(false);}catch{setInvalid(true);}}}/>{invalid&&<small role="alert">Enter valid JSON.</small>}</>;
}
