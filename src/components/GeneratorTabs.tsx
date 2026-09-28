import { useEffect, useRef, useState } from 'react';
import { ArchiveRestore, Folder, FolderOpen, Plus, X } from 'lucide-react';
import { MAIN_GENERATOR_TAB_ID, type GeneratorFolder, type GeneratorTab } from '../generator-tabs';

type Props = {
  tabs: GeneratorTab[];
  folders: GeneratorFolder[];
  activeId: string;
  select: (id: string) => void;
  add: () => void;
  close: (id: string) => void;
  reopen: (id: string) => void;
  rename: (id: string, name: string) => void;
  renameFolder: (id: string, name: string) => void;
  deleteFolder: (id: string) => void;
  setFolderOpen: (id: string, open: boolean) => void;
  moveToFolder: (tabId: string, folderId?: string) => void;
  moveFolder: (folderId: string, parentId?: string) => void;
  createFolder: (sourceTabId: string, targetTabId: string) => void;
};

type FolderMenu = { folderId: string; x: number; y: number };

export default function GeneratorTabs({ tabs, folders, activeId, select, add, close, reopen, rename, renameFolder, deleteFolder, setFolderOpen, moveToFolder, moveFolder, createFolder }: Props) {
  const [editingTab, setEditingTab] = useState<string | null>(null);
  const [editingFolder, setEditingFolder] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [draggingTab, setDraggingTab] = useState<string | null>(null);
  const [draggingFolder, setDraggingFolder] = useState<string | null>(null);
  const [dropFolder, setDropFolder] = useState<string | null>(null);
  const [dropTab, setDropTab] = useState<string | null>(null);
  const [folderMenu, setFolderMenu] = useState<FolderMenu | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const open = tabs.filter(tab => !tab.closed);
  const closed = tabs.filter(tab => tab.closed);
  const main = open.find(tab => tab.id === MAIN_GENERATOR_TAB_ID);
  const knownFolders = new Set(folders.map(folder => folder.id));
  const loose = open.filter(tab => tab.id !== MAIN_GENERATOR_TAB_ID && (!tab.folderId || !knownFolders.has(tab.folderId)));
  const roots = folders.filter(folder => !folder.parentId || !knownFolders.has(folder.parentId));

  const tabsInside = (folderId: string) => open.filter(tab => tab.folderId === folderId);
  const childFolders = (folderId: string) => folders.filter(folder => folder.parentId === folderId);
  const visibleInside = (folder: GeneratorFolder): GeneratorTab[] => folder.open ? [...tabsInside(folder.id), ...childFolders(folder.id).flatMap(visibleInside)] : [];
  const visibleTabs = [main, ...loose, ...roots.flatMap(visibleInside)].filter(Boolean) as GeneratorTab[];
  const activeFolderId = open.find(tab => tab.id === activeId)?.folderId;
  const containsActive = (folderId: string) => { let cursor = activeFolderId; while (cursor) { if (cursor === folderId) return true; cursor = folders.find(folder => folder.id === cursor)?.parentId; } return false; };

  useEffect(() => { if (editingTab || editingFolder) input.current?.select(); }, [editingTab, editingFolder]);
  useEffect(() => {
    if (!folderMenu) return;
    menuRef.current?.querySelector('button')?.focus();
    const dismiss = (event: PointerEvent) => { if (!menuRef.current?.contains(event.target as Node)) setFolderMenu(null); };
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') setFolderMenu(null); };
    window.addEventListener('pointerdown', dismiss); window.addEventListener('keydown', key);
    return () => { window.removeEventListener('pointerdown', dismiss); window.removeEventListener('keydown', key); };
  }, [folderMenu]);
  const clearDrag = () => { setDraggingTab(null); setDraggingFolder(null); setDropFolder(null); setDropTab(null); };
  const beginTabRename = (tab: GeneratorTab) => { setEditingFolder(null); setEditingTab(tab.id); setName(tab.name); };
  const beginFolderRename = (folder: GeneratorFolder) => { setFolderMenu(null); setEditingTab(null); setEditingFolder(folder.id); setName(folder.name); };
  const finishRename = () => {
    if (editingTab) rename(editingTab, name);
    if (editingFolder) renameFolder(editingFolder, name);
    setEditingTab(null); setEditingFolder(null);
  };
  const keyboardMove = (event: React.KeyboardEvent, tab: GeneratorTab) => {
    if (event.key === 'F2' && tab.id !== MAIN_GENERATOR_TAB_ID) { event.preventDefault(); beginTabRename(tab); return; }
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const at = visibleTabs.findIndex(item => item.id === tab.id);
    const next = event.key === 'ArrowRight' ? visibleTabs[(at + 1) % visibleTabs.length] : visibleTabs[(at - 1 + visibleTabs.length) % visibleTabs.length];
    if (!next) return;
    select(next.id);
    requestAnimationFrame(() => document.querySelector<HTMLElement>('[role=tab][aria-selected=true]')?.focus());
  };
  const tabView = (tab: GeneratorTab) => <div className={`generator-tab ${draggingTab === tab.id ? 'is-dragging' : ''} ${dropTab === tab.id ? 'is-drop-target' : ''}`} key={tab.id}
    draggable={tab.id !== MAIN_GENERATOR_TAB_ID}
    onDragStart={event => { if (tab.id === MAIN_GENERATOR_TAB_ID) return; setDraggingFolder(null); setDraggingTab(tab.id); event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', `tab:${tab.id}`); }}
    onDragEnd={clearDrag}
    onDragOver={event => { if (draggingFolder && tab.id !== MAIN_GENERATOR_TAB_ID) return; if ((!draggingTab && !draggingFolder) || draggingTab === tab.id) return; event.preventDefault(); event.stopPropagation(); event.dataTransfer.dropEffect = 'move'; if (tab.id !== MAIN_GENERATOR_TAB_ID) setDropTab(tab.id); }}
    onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDropTab(null); }}
    onDrop={event => { event.preventDefault(); event.stopPropagation(); if (tab.id === MAIN_GENERATOR_TAB_ID) { if (draggingTab) moveToFolder(draggingTab); if (draggingFolder) moveFolder(draggingFolder); clearDrag(); return; } if (!draggingTab || draggingTab === tab.id) return; if (tab.folderId && knownFolders.has(tab.folderId)) moveToFolder(draggingTab, tab.folderId); else createFolder(draggingTab, tab.id); clearDrag(); }}>
    {editingTab === tab.id ? <input ref={input} aria-label="Generator tab name" value={name} maxLength={80} onChange={event => setName(event.target.value)} onBlur={finishRename} onKeyDown={event => {
      if (event.key === 'Enter') finishRename();
      if (event.key === 'Escape') setEditingTab(null);
    }}/> : <button role="tab" aria-selected={tab.id === activeId} title={tab.id === MAIN_GENERATOR_TAB_ID ? 'Drop a tab or folder here to move it to the top level' : 'Drag onto another tab to create a folder'} onClick={() => select(tab.id)} onDoubleClick={() => { if (tab.id !== MAIN_GENERATOR_TAB_ID) beginTabRename(tab); }} onKeyDown={event => keyboardMove(event, tab)}>{tab.name}</button>}
    {tab.id !== MAIN_GENERATOR_TAB_ID && <button className="generator-tab-close" aria-label={`Close ${tab.name}`} title="Close tab" onClick={() => close(tab.id)}><X size={13}/></button>}
  </div>;

  const folderView = (folder: GeneratorFolder): React.ReactNode => {
    const directTabs = tabsInside(folder.id), nested = childFolders(folder.id);
    return <div className={`generator-folder ${dropFolder === folder.id ? 'is-drop-target' : ''} ${containsActive(folder.id) ? 'contains-active' : ''}`} key={folder.id} role="group" aria-label={`${folder.name} folder`}
      onDragOver={event => { if ((!draggingTab && !draggingFolder) || draggingFolder === folder.id) return; event.preventDefault(); event.stopPropagation(); event.dataTransfer.dropEffect = 'move'; setDropFolder(folder.id); }}
      onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDropFolder(null); }}
      onDrop={event => { event.preventDefault(); event.stopPropagation(); if (draggingTab) moveToFolder(draggingTab, folder.id); if (draggingFolder && draggingFolder !== folder.id) moveFolder(draggingFolder, folder.id); setFolderOpen(folder.id, true); clearDrag(); }}>
      <div className={`generator-folder-chip ${draggingFolder === folder.id ? 'is-dragging' : ''}`} draggable={editingFolder !== folder.id}
        onDragStart={event => { setDraggingTab(null); setDraggingFolder(folder.id); event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', `folder:${folder.id}`); }} onDragEnd={clearDrag}>
        {editingFolder === folder.id ? <input ref={input} aria-label="Folder name" value={name} maxLength={80} onChange={event => setName(event.target.value)} onBlur={finishRename} onKeyDown={event => {
          if (event.key === 'Enter') finishRename();
          if (event.key === 'Escape') setEditingFolder(null);
        }}/> : <button aria-expanded={folder.open} title="Double-click to open · right-click for folder actions" onDoubleClick={() => setFolderOpen(folder.id, !folder.open)} onContextMenu={event => { event.preventDefault(); setFolderMenu({ folderId: folder.id, x: Math.min(event.clientX, window.innerWidth - 170), y: Math.min(event.clientY, window.innerHeight - 100) }); }} onKeyDown={event => {
          if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setFolderOpen(folder.id, !folder.open); }
          if (event.key === 'F2') { event.preventDefault(); beginFolderRename(folder); }
        }}>{folder.open ? <FolderOpen size={14}/> : <Folder size={14}/>}<span>{folder.name}</span><small>{directTabs.length + nested.length}</small></button>}
      </div>
      {folder.open && (directTabs.length > 0 || nested.length > 0) && <div className="generator-folder-contents">{nested.map(folderView)}{directTabs.map(tabView)}</div>}
    </div>;
  };

  const menuFolder = folderMenu && folders.find(folder => folder.id === folderMenu.folderId);
  return <div className="generator-tabs" role="tablist" aria-label="Generator tabs">
    {main && tabView(main)}
    {loose.map(tabView)}
    {roots.map(folderView)}
    <button className="generator-tab-add" aria-label="Add generator tab" title="Add tab" onClick={add}><Plus size={15}/></button>
    {closed.length > 0 && <details className="generator-tab-saved"><summary aria-label="Saved generator tabs" title="Saved tabs"><ArchiveRestore size={15}/></summary><div>{closed.map(tab => <button key={tab.id} onClick={() => { if (tab.folderId) setFolderOpen(tab.folderId, true); reopen(tab.id); }}>{tab.name}</button>)}</div></details>}
    {menuFolder && folderMenu && <div ref={menuRef} className="node-context-menu generator-folder-menu" role="menu" aria-label={`${menuFolder.name} actions`} style={{ left: folderMenu.x, top: folderMenu.y }}><button role="menuitem" onClick={() => beginFolderRename(menuFolder)}>Rename</button><button role="menuitem" onClick={() => { deleteFolder(menuFolder.id); setFolderMenu(null); }}>Delete folder</button></div>}
  </div>;
}
