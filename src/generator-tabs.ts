import type { Draft, Run } from './types';

export const MAIN_GENERATOR_TAB_ID = 'main';

export type GeneratorTab = {
  id: string;
  name: string;
  draft: Draft;
  closed: boolean;
  folderId?: string;
};

export type GeneratorFolder = { id: string; name: string; open: boolean; parentId?: string };

const cloneDraft = (draft: Draft): Draft => ({
  prompt: draft.prompt,
  referenceIds: [...draft.referenceIds],
  count: draft.count,
  quality: draft.quality ?? 'high',
  ...(draft.resolution ? { resolution: draft.resolution } : {}),
  ...(draft.higgsfieldModel ? {higgsfieldModel:draft.higgsfieldModel} : {}),
  ...(draft.higgsfieldOptions ? {higgsfieldOptions:structuredClone(draft.higgsfieldOptions)} : {}),
  ...(draft.provider ? { provider: draft.provider } : {}),
});

export function makeGeneratorTab(draft: Draft, name = 'Untitled 1'): GeneratorTab {
  return { id: crypto.randomUUID(), name, draft: cloneDraft(draft), closed: false };
}

export function makeGeneratorFolder(name = 'Folder 1'): GeneratorFolder {
  return { id: crypto.randomUUID(), name, open: true };
}

function mainGeneratorTab(draft: Draft): GeneratorTab {
  return { id: MAIN_GENERATOR_TAB_ID, name: 'Main', draft: cloneDraft(draft), closed: false };
}

function isDraft(value: unknown): value is Draft {
  const draft = value as Draft | undefined;
  return !!draft && typeof draft.prompt === 'string' && Array.isArray(draft.referenceIds) && draft.referenceIds.every(id => typeof id === 'string') && Number.isInteger(draft.count) && draft.count >= 1 && draft.count <= 4 && (draft.quality === undefined || ['low','medium','high','xhigh','max'].includes(draft.quality));
}

function isTab(value: unknown): value is GeneratorTab {
  const tab = value as GeneratorTab | undefined;
  return !!tab && typeof tab.id === 'string' && typeof tab.name === 'string' && typeof tab.closed === 'boolean' && (tab.folderId === undefined || typeof tab.folderId === 'string') && isDraft(tab.draft);
}

function isFolder(value: unknown): value is GeneratorFolder {
  const folder = value as GeneratorFolder | undefined;
  return !!folder && typeof folder.id === 'string' && typeof folder.name === 'string' && typeof folder.open === 'boolean' && (folder.parentId === undefined || typeof folder.parentId === 'string');
}

export function serializeGeneratorTabs(tabs: GeneratorTab[]): string {
  return JSON.stringify(tabs);
}

export function serializeGeneratorFolders(folders: GeneratorFolder[]): string {
  return JSON.stringify(folders);
}

export function restoreGeneratorFolders(raw: string | null): GeneratorFolder[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const ids = new Set<string>();
    const folders = parsed.filter(isFolder).filter(folder => !ids.has(folder.id) && ids.add(folder.id)).map(folder => ({ ...folder, name: folder.name.trim().slice(0, 80) || 'Folder' }));
    const known = new Set(folders.map(folder => folder.id));
    for (const folder of folders) {
      if (!folder.parentId || !known.has(folder.parentId) || folder.parentId === folder.id) { delete folder.parentId; continue; }
      const seen = new Set([folder.id]); let cursor: GeneratorFolder | undefined = folder;
      while (cursor?.parentId) { if (seen.has(cursor.parentId)) { delete folder.parentId; break; } seen.add(cursor.parentId); cursor = folders.find(item => item.id === cursor?.parentId); }
    }
    return folders;
  } catch { return []; }
}

export function moveGeneratorTabToFolder(tabs: GeneratorTab[], tabId: string, folderId?: string): GeneratorTab[] {
  if (tabId === MAIN_GENERATOR_TAB_ID) return tabs;
  return tabs.map(tab => tab.id === tabId ? { ...tab, ...(folderId ? { folderId } : {}), ...(!folderId ? { folderId: undefined } : {}) } : tab);
}

export function moveGeneratorFolder(folders: GeneratorFolder[], folderId: string, parentId?: string): GeneratorFolder[] {
  if (folderId === parentId || !folders.some(folder => folder.id === folderId)) return folders;
  if (parentId && !folders.some(folder => folder.id === parentId)) return folders;
  let cursor = parentId;
  while (cursor) {
    if (cursor === folderId) return folders;
    cursor = folders.find(folder => folder.id === cursor)?.parentId;
  }
  return folders.map(folder => folder.id === folderId ? { ...folder, parentId } : folder);
}

export function deleteGeneratorFolder(tabs: GeneratorTab[], folders: GeneratorFolder[], folderId: string): { tabs: GeneratorTab[]; folders: GeneratorFolder[] } {
  const target = folders.find(folder => folder.id === folderId);
  if (!target) return { tabs, folders };
  return {
    tabs: tabs.map(tab => tab.folderId === folderId ? { ...tab, folderId: target.parentId } : tab),
    folders: folders.filter(folder => folder.id !== folderId).map(folder => folder.parentId === folderId ? { ...folder, parentId: target.parentId } : folder),
  };
}

export function restoreGeneratorTabs(raw: string | null, legacyDraft: Draft, requestedActiveId: string | null): { tabs: GeneratorTab[]; activeId: string } {
  let tabs: GeneratorTab[] = [];
  if (raw) {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) tabs = parsed.filter(isTab).map(tab => ({ ...tab, name: tab.name.trim().slice(0, 80) || 'Untitled', draft: cloneDraft(tab.draft) }));
    } catch { /* Fall through to legacy migration. */ }
  }
  const savedMain = tabs.find(tab => tab.id === MAIN_GENERATOR_TAB_ID);
  tabs = [mainGeneratorTab(savedMain?.draft ?? legacyDraft), ...tabs.filter(tab => tab.id !== MAIN_GENERATOR_TAB_ID)];
  let active = tabs.find(tab => tab.id === requestedActiveId && !tab.closed) ?? tabs.find(tab => !tab.closed);
  if (!active) {
    active = makeGeneratorTab({ prompt: '', referenceIds: [], count: 1, quality: 'high' }, `Untitled ${tabs.length + 1}`);
    tabs = [...tabs, active];
  }
  return { tabs, activeId: active.id };
}

export function closeGeneratorTab(tabs: GeneratorTab[], id: string): { tabs: GeneratorTab[]; activeId: string } {
  if (id === MAIN_GENERATOR_TAB_ID) return { tabs, activeId: MAIN_GENERATOR_TAB_ID };
  let next = tabs.map(tab => tab.id === id ? { ...tab, closed: true } : tab);
  let active = next.find(tab => !tab.closed);
  if (!active) active = mainGeneratorTab({ prompt: '', referenceIds: [], count: 1, quality: 'high' });
  return { tabs: next, activeId: active.id };
}

export function attachReferencesToTab(tabs: GeneratorTab[], id: string, referenceIds: string[]) {
  return tabs.map(tab => tab.id === id ? { ...tab, draft: { ...tab.draft, referenceIds: [...tab.draft.referenceIds, ...referenceIds].slice(0, 20) } } : tab);
}

export function runsForGeneratorTab(runs: Run[], id: string) {
  return id === MAIN_GENERATOR_TAB_ID ? runs : runs.filter(run => run.generatorTabId === id);
}
