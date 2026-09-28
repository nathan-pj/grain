/** Starts the clipboard write in the click gesture (required by WebKit). */
export function copyImage(url:string):Promise<void>{
 if(!navigator.clipboard?.write||typeof ClipboardItem==='undefined')return Promise.reject(new Error('Image copying is unavailable in this browser. Download the image instead.'));
 const png=(async()=>{const response=await fetch(url);if(!response.ok)throw new Error('Could not load the image to copy.');const blob=await response.blob();if(blob.type==='image/png')return blob;
 const objectURL=URL.createObjectURL(blob);try{const image=new Image();image.src=objectURL;await image.decode();const canvas=document.createElement('canvas');canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;const ctx=canvas.getContext('2d');if(!ctx)throw new Error('Could not prepare image for copying.');ctx.drawImage(image,0,0);return await new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('Could not prepare image for copying.')),'image/png'));}finally{URL.revokeObjectURL(objectURL);}})();
 return navigator.clipboard.write([new ClipboardItem({'image/png':png})]);
}
