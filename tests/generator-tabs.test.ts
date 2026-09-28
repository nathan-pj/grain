import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Draft } from '../src/types';

const legacy: Draft = { prompt: 'existing prompt', referenceIds: ['reference'], count: 2, quality: 'high' };

test('a legacy generator draft gets a permanent Main library tab', async () => {
  const { MAIN_GENERATOR_TAB_ID, restoreGeneratorTabs } = await import('../src/generator-tabs');
  const restored = restoreGeneratorTabs(null, legacy, null);
  assert.equal(restored.tabs.length, 1);
  assert.equal(restored.tabs[0].id, MAIN_GENERATOR_TAB_ID);
  assert.equal(restored.tabs[0].name, 'Main');
  assert.deepEqual(restored.tabs[0].draft, legacy);
  assert.equal(restored.activeId, restored.tabs[0].id);
});

test('old saved tabs gain high quality without losing their draft', async () => {
  const { restoreGeneratorTabs } = await import('../src/generator-tabs');
  const old = [{ id: 'old', name: 'Old', closed: false, draft: { prompt: 'kept', referenceIds: [], count: 1 } }];
  const restored = restoreGeneratorTabs(JSON.stringify(old), legacy, 'old');
  assert.equal(restored.tabs[1].draft.prompt, 'kept');
  assert.equal(restored.tabs[1].draft.quality, 'high');
});

test('saved tabs retain separate prompts, references, names, and active tab', async () => {
  const { makeGeneratorTab, restoreGeneratorTabs, serializeGeneratorTabs } = await import('../src/generator-tabs');
  const first = makeGeneratorTab({ prompt: 'one', referenceIds: ['a'], count: 1 }, 'Product');
  const second = makeGeneratorTab({ prompt: 'two', referenceIds: ['b', 'c'], count: 4 }, 'Portrait');
  const restored = restoreGeneratorTabs(serializeGeneratorTabs([first, second]), legacy, second.id);
  assert.equal(restored.tabs[0].name, 'Main');
  assert.deepEqual(restored.tabs.slice(1), [first, second]);
  assert.equal(restored.activeId, second.id);
});

test('Main retains its own prompt and references when another tab was saved last', async () => {
  const { MAIN_GENERATOR_TAB_ID, makeGeneratorTab, restoreGeneratorTabs, serializeGeneratorTabs } = await import('../src/generator-tabs');
  const main = { id: MAIN_GENERATOR_TAB_ID, name: 'Main', closed: false, draft: { prompt: 'main prompt', referenceIds: ['main-ref'], count: 3, quality: 'max' as const } };
  const named = makeGeneratorTab({ prompt: 'named prompt', referenceIds: ['named-ref'], count: 1, quality: 'low' }, 'Named');
  const restored = restoreGeneratorTabs(serializeGeneratorTabs([main, named]), named.draft, named.id);
  assert.deepEqual(restored.tabs[0].draft, main.draft);
  assert.equal(restored.activeId, named.id);
});

test('an invalid or closed active tab falls back to Main', async () => {
  const { makeGeneratorTab, restoreGeneratorTabs, serializeGeneratorTabs } = await import('../src/generator-tabs');
  const closed = { ...makeGeneratorTab(legacy, 'Closed'), closed: true };
  const open = makeGeneratorTab({ prompt: '', referenceIds: [], count: 1 }, 'Open');
  const restored = restoreGeneratorTabs(serializeGeneratorTabs([closed, open]), legacy, closed.id);
  assert.equal(restored.activeId, 'main');
});

test('closing the active tab preserves it and selects an open sibling', async () => {
  const { closeGeneratorTab, makeGeneratorTab } = await import('../src/generator-tabs');
  const first = makeGeneratorTab(legacy, 'First');
  const second = makeGeneratorTab({ prompt: 'second', referenceIds: [], count: 1 }, 'Second');
  const result = closeGeneratorTab([first, second], first.id);
  assert.equal(result.tabs[0].closed, true);
  assert.equal(result.activeId, second.id);
});

test('closing the final named tab falls back to permanent Main', async () => {
  const { closeGeneratorTab, MAIN_GENERATOR_TAB_ID, makeGeneratorTab, restoreGeneratorTabs } = await import('../src/generator-tabs');
  const only = makeGeneratorTab(legacy, 'Only');
  const restored = restoreGeneratorTabs(JSON.stringify([only]), legacy, only.id);
  const result = closeGeneratorTab(restored.tabs, only.id);
  assert.equal(result.tabs[1].closed, true);
  assert.equal(result.tabs.length, 2);
  assert.equal(result.activeId, MAIN_GENERATOR_TAB_ID);
});

test('Main shows every generation while named tabs show only their own', async () => {
  const { MAIN_GENERATOR_TAB_ID, runsForGeneratorTab } = await import('../src/generator-tabs');
  const runs = [{ id: 'legacy' }, { id: 'a', generatorTabId: 'tab-a' }, { id: 'b', generatorTabId: 'tab-b' }] as never[];
  assert.deepEqual(runsForGeneratorTab(runs, MAIN_GENERATOR_TAB_ID).map((run: {id:string}) => run.id), ['legacy', 'a', 'b']);
  assert.deepEqual(runsForGeneratorTab(runs, 'tab-a').map((run: {id:string}) => run.id), ['a']);
  assert.deepEqual(runsForGeneratorTab(runs, 'new-tab'), []);
});

test('a completed upload stays with the tab where it started', async () => {
  const { attachReferencesToTab, makeGeneratorTab } = await import('../src/generator-tabs');
  const first = makeGeneratorTab({ prompt: 'first', referenceIds: [], count: 1, quality: 'high' }, 'First');
  const second = makeGeneratorTab({ prompt: 'second', referenceIds: [], count: 1, quality: 'max' }, 'Second');
  const tabs = attachReferencesToTab([first, second], first.id, ['uploaded']);
  assert.deepEqual(tabs[0].draft.referenceIds, ['uploaded']);
  assert.deepEqual(tabs[1].draft.referenceIds, []);
});

test('folders persist names and open state while rejecting malformed entries', async () => {
  const { makeGeneratorFolder, restoreGeneratorFolders, serializeGeneratorFolders } = await import('../src/generator-tabs');
  const folder = { ...makeGeneratorFolder('Campaigns'), open: false };
  const restored = restoreGeneratorFolders(serializeGeneratorFolders([folder]));
  assert.deepEqual(restored, [folder]);
  assert.deepEqual(restoreGeneratorFolders(JSON.stringify([{ id: 4, name: 'Bad', open: true }])), []);
});

test('tabs can move into, between, and out of folders without moving Main', async () => {
  const { MAIN_GENERATOR_TAB_ID, makeGeneratorTab, moveGeneratorTabToFolder, restoreGeneratorTabs } = await import('../src/generator-tabs');
  const tab = makeGeneratorTab(legacy, 'Product');
  const restored = restoreGeneratorTabs(JSON.stringify([tab]), legacy, tab.id).tabs;
  const filed = moveGeneratorTabToFolder(restored, tab.id, 'folder-a');
  assert.equal(filed.find(item => item.id === tab.id)?.folderId, 'folder-a');
  const moved = moveGeneratorTabToFolder(filed, tab.id, 'folder-b');
  assert.equal(moved.find(item => item.id === tab.id)?.folderId, 'folder-b');
  const loose = moveGeneratorTabToFolder(moved, tab.id);
  assert.equal(loose.find(item => item.id === tab.id)?.folderId, undefined);
  assert.deepEqual(moveGeneratorTabToFolder(loose, MAIN_GENERATOR_TAB_ID, 'folder-a'), loose);
});

test('folders can nest without cycles and return to the root', async () => {
  const { makeGeneratorFolder, moveGeneratorFolder } = await import('../src/generator-tabs');
  const parent = makeGeneratorFolder('Parent'), child = makeGeneratorFolder('Child'), leaf = makeGeneratorFolder('Leaf');
  let folders = moveGeneratorFolder([parent, child, leaf], child.id, parent.id);
  folders = moveGeneratorFolder(folders, leaf.id, child.id);
  assert.equal(folders.find(folder => folder.id === child.id)?.parentId, parent.id);
  assert.equal(folders.find(folder => folder.id === leaf.id)?.parentId, child.id);
  assert.deepEqual(moveGeneratorFolder(folders, parent.id, leaf.id), folders);
  folders = moveGeneratorFolder(folders, leaf.id);
  assert.equal(folders.find(folder => folder.id === leaf.id)?.parentId, undefined);
});

test('deleting a folder keeps its tabs and child folders by lifting them one level', async () => {
  const { deleteGeneratorFolder, makeGeneratorFolder, makeGeneratorTab } = await import('../src/generator-tabs');
  const parent = makeGeneratorFolder('Parent'), doomed = { ...makeGeneratorFolder('Delete me'), parentId: parent.id }, child = { ...makeGeneratorFolder('Child'), parentId: doomed.id };
  const tab = { ...makeGeneratorTab(legacy, 'Kept'), folderId: doomed.id };
  const result = deleteGeneratorFolder([tab], [parent, doomed, child], doomed.id);
  assert.equal(result.tabs[0].folderId, parent.id);
  assert.equal(result.folders.find(folder => folder.id === child.id)?.parentId, parent.id);
  assert.equal(result.folders.some(folder => folder.id === doomed.id), false);
});
