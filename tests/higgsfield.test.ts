import { test } from 'node:test';
import assert from 'node:assert/strict';
import { higgsfieldGenerate, higgsfieldParams } from '../server/higgsfield.js';
const input = {prompt:'Product image\nMake it 16:9', references:['/tmp/a one.png','/tmp/b.png'],directory:'/tmp/test',quality:'max' as const,resolution:'4k' as const};
test('Sunburst parameters preserve references and explicit quality/resolution',()=>{
 const args=higgsfieldParams(input);
 assert.equal(args[args.indexOf('--variant')+1],'sunburst');
 assert.equal(args[args.indexOf('--aspect-ratio')+1],'16:9');
 assert.equal(args[args.indexOf('--resolution')+1],'4k');
 assert.equal(args[args.indexOf('--quality')+1],'max');
 assert.deepEqual(args.slice(-4),['--image-references','/tmp/a one.png','--image-references','/tmp/b.png']);
});
test('retry retrieves persisted job without a second charge',async()=>{
 const calls:string[][]=[];
 const result=await higgsfieldGenerate({...input,remoteJobId:'saved-job'},async args=>{calls.push(args);return {status:'completed',params:{model:'sunburst'},result_url:'https://example.com/result.png'};},async()=>new Response(new Uint8Array([1,2,3])));
 assert.deepEqual(calls,[['generate','get','saved-job']]);assert.deepEqual([...result.bytes],[1,2,3]);
});
test('new job ID is persisted before downloading and retained on download failure',async()=>{
 let saved='';
 await assert.rejects(higgsfieldGenerate({...input,onRemoteJob:id=>saved=id},async args=>args[1]==='create'?['new-job']:{status:'completed',params:{model:'sunburst'},result_url:'https://example.com/result.png'},async()=>new Response(null,{status:503})),/download/);
 assert.equal(saved,'new-job');
});
test('failed remote generation can be replaced by a retry',async()=>{
 let saved='old-job';await assert.rejects(higgsfieldGenerate({...input,remoteJobId:saved,onRemoteJob:id=>saved=id},async()=>({status:'failed'})),/generation failed/);assert.equal(saved,'');
});
test('does not silently accept a different image model',async()=>{
 await assert.rejects(higgsfieldGenerate({...input,remoteJobId:'saved'},async()=>({status:'completed',params:{model:'flare'},result_url:'https://example.com/a.png'})),/different model/);
});
