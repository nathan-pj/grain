import { useEffect, useRef } from 'react';
const hash=(x:number,y:number)=>{const n=Math.sin(x*127.1+y*311.7)*43758.5453;return n-Math.floor(n);};
const noise=(x:number,y:number)=>{const i=Math.floor(x),j=Math.floor(y);let u=x-i,v=y-j;u=u*u*(3-2*u);v=v*v*(3-2*v);return (hash(i,j)*(1-u)+hash(i+1,j)*u)*(1-v)+(hash(i,j+1)*(1-u)+hash(i+1,j+1)*u)*v;};
const fbm=(x:number,y:number)=>noise(x,y)*.57+noise(x*2.03,y*2.03)*.28+noise(x*4.07,y*4.07)*.15;
/** Domain-warped noise moves the character texture; media pixels are never filtered. */
export default function GrainField(){
 const canvas=useRef<HTMLCanvasElement>(null);
 useEffect(()=>{const el=canvas.current;if(!el)return;const ctx=el.getContext('2d');if(!ctx)return;const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;let frame=0,last=-Infinity;
 const draw=(time:number)=>{if(time-last>80){last=time;const w=el.clientWidth,h=el.clientHeight;el.width=w;el.height=h;ctx.font='10px monospace';const t=reduced?0:time/18000;const color=getComputedStyle(document.documentElement).getPropertyValue('--field-color').trim()||'177,216,226';
 for(let y=0;y<h;y+=12)for(let x=0;x<w;x+=9){const nx=x/170,ny=y/170;const warp=fbm(nx+t*.3,ny-t*.2);const n=fbm(nx+warp*3-t*.35,ny+warp*2+t*.25);const ridge=Math.max(0,1-Math.abs(n-.51)*10);const fade=Math.sin(x/w*Math.PI)*Math.sin(y/h*Math.PI);const a=ridge*fade; if(a>.08){ctx.fillStyle=`rgba(${color},${a*.34})`;ctx.fillText('·.:;+*'[Math.min(5,Math.floor(a*6))],x,y);}}}
 if(!reduced)frame=requestAnimationFrame(draw);};frame=requestAnimationFrame(draw);const repaint=()=>{last=-Infinity;if(reduced)frame=requestAnimationFrame(draw);};const observer=new MutationObserver(repaint);observer.observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});const resize=new ResizeObserver(repaint);resize.observe(el);return()=>{cancelAnimationFrame(frame);observer.disconnect();resize.disconnect();};},[]);
 return <canvas ref={canvas} className="grain-field" aria-hidden="true"/>;
}
