import test from 'node:test';
import assert from 'node:assert/strict';
import {inputDimensions} from '../src/resize.js';
test('input scale supports downsampling, exact 2K preset, and preserves aspect ratio',()=>{
 assert.deepEqual(inputDimensions(1080,1080,50),{width:540,height:540});
 assert.deepEqual(inputDimensions(1080,1080,2048/1080*100),{width:2048,height:2048});
 assert.deepEqual(inputDimensions(1080,1920,200),{width:2160,height:3840});
 for(const percent of [NaN,0,401,-10])assert.throws(()=>inputDimensions(1080,1080,percent));
 assert.throws(()=>inputDimensions(6000,6000,400));
});

import { draggedInputPercent } from '../src/resize-preview.js';
test('dragging the input corner updates the actual dimensions before upscale',()=>{
 const percent=draggedInputPercent(100,-70,-70,318,318);
 assert.equal(percent,78);
 assert.deepEqual(inputDimensions(1254,1254,percent),{width:978,height:978});
});
test('diagonal resize keeps portrait aspect ratio and clamps both drag extremes',()=>{
 assert.equal(draggedInputPercent(100,50,100,200,400),125);
 assert.deepEqual(inputDimensions(1000,2000,125),{width:1250,height:2500});
 assert.equal(draggedInputPercent(100,-10000,-10000,200,400),10);
 assert.equal(draggedInputPercent(100,10000,10000,200,400),400);
});
