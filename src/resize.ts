export function inputDimensions(width: number, height: number, percent: number) {
 if (!Number.isFinite(percent) || percent < 10 || percent > 400) throw new Error('Choose an input scale from 10% to 400%.');
 const w=Math.max(1,Math.round(width*percent/100)),h=Math.max(1,Math.round(height*percent/100));
 if(w*h>50_000_000 || Math.max(w,h)>8192)throw new Error('Starting image must fit within 8192 pixels per side and 50 megapixels.');
 return {width:w,height:h};
}

export function outputDimensions(width:number,height:number,factor:number){
 if(![2,4].includes(factor))throw new Error('Choose 2× or 4× upscaling.');
 const w=width*factor,h=height*factor;
 if(w*h>50_000_000||Math.max(w,h)>8192)throw new Error('Reduce the starting resolution or upscale factor. Output must fit within 8192 pixels per side and 50 megapixels.');
 return {width:w,height:h};
}
