import { useRef } from 'react';
import { Check, Scan } from 'lucide-react';
import { ratios, currentRatio, withRatio } from '../ratio';

function RatioIcon({ ratio }: { ratio: string }) {
 if (ratio === 'Auto') return <Scan size={17} strokeWidth={1.6}/>;
 const [w, h] = ratio.split(':').map(Number);
 return <span className="ratio-icon"><span style={{ width: 18 * Math.min(1, w / h), height: 18 * Math.min(1, h / w) }}/></span>;
}
export default function AspectRatio({ prompt, update }: { prompt: string; update: (prompt: string) => void }) {
 const popup = useRef<HTMLDivElement>(null), trigger = useRef<HTMLButtonElement>(null);
 const selected = currentRatio(prompt);
 return <div className="ratio-control">
  <button ref={trigger} className="ratio-button" popoverTarget="aspect-ratios" aria-label={`Aspect ratio: ${selected}`} title="Aspect ratio"><RatioIcon ratio={selected}/><span>{selected}</span></button>
  <div ref={popup} id="aspect-ratios" className="ratio-menu" popover="auto" aria-label="Aspect ratio">
   <div className="ratio-heading">Aspect ratio</div>
   {ratios.map(ratio => <button key={ratio} className={selected === ratio ? 'selected' : ''} aria-label={ratio} aria-pressed={selected === ratio} disabled={withRatio(prompt, ratio).length > 20000} onClick={() => { update(withRatio(prompt, ratio)); popup.current?.hidePopover(); trigger.current?.focus(); }}><RatioIcon ratio={ratio}/><span>{ratio}</span>{selected === ratio && <Check size={16}/>}</button>)}
  </div>
 </div>;
}
