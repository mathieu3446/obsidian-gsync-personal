import { App, TFile } from "obsidian";
import { DriveClient, RemoteFile } from "./drive";
import type { GSyncSettings } from "./settings";
import { hash, safePath, uniqueSuffix, conflictPath } from "./security";
export interface SyncRecord { remoteId: string; remoteVersion: string; localHash: string }
export type SyncState = Record<string,SyncRecord>;
export interface SyncResult { uploaded: number; downloaded: number; conflicts: string[]; skipped: string[]; errors: string[] }
export interface SyncHooks { checkpoint: () => Promise<void>; cancelled: () => boolean }
export function excluded(path: string, settings: GSyncSettings, configDir: string): boolean {
  if (!safePath(path,configDir)) return true;
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  if (!settings.extensions.split(',').map(x=>x.trim().toLowerCase()).includes(ext)) return true;
  return settings.excludes.split('\n').map(x=>x.trim()).filter(x=>x && !x.startsWith('#')).some(rule =>
    rule.startsWith('*.') ? path.toLowerCase().endsWith(rule.slice(1).toLowerCase()) :
    path === rule || path.startsWith(rule.endsWith('/') ? rule : rule+'/') || path.split('/').pop() === rule);
}
export async function runSync(app: App, drive: DriveClient, settings: GSyncSettings, state: SyncState, hooks: SyncHooks): Promise<SyncResult> {
  const vault = app.vault;
  const result: SyncResult = { uploaded:0, downloaded:0, conflicts:[], skipped:[], errors:[] };
  const check = () => { if (hooks.cancelled()) throw new Error('Sync cancelled.'); };
  check();
  const root = await drive.root(settings.remoteFolder,settings.remoteFolderId);
  if (!settings.remoteFolderId) { settings.remoteFolderId = root; await hooks.checkpoint(); }
  const tree = await drive.listTree(root);
  const locals = vault.getFiles().filter(f=>!excluded(f.path,settings,vault.configDir));
  const canonical = new Map<string,string>();
  for (const path of [...locals.map(f=>f.path),...tree.files.keys()]) {
    const key = path.normalize('NFC').toLowerCase();
    if (canonical.has(key) && canonical.get(key) !== path) throw new Error('Case/Unicode path collision; sync stopped.');
    canonical.set(key,path);
  }
  const paths = [...new Set([...locals.map(f=>f.path),...tree.files.keys()])].sort();
  const maxBytes = Math.min(100, Math.max(1,settings.maxFileSizeMB)) * 1024 * 1024;
  const parents = async (path: string) => {
    let cur = '';
    for (const part of path.split('/').slice(0,-1)) {
      cur = cur ? cur+'/'+part : part;
      if (!vault.getAbstractFileByPath(cur)) await vault.createFolder(cur);
    }
  };
  const upload = async (path: string, data: ArrayBuffer) => {
    check(); let current = ''; let parent = root;
    for (const part of path.split('/').slice(0,-1)) {
      current = current ? current+'/'+part : part;
      if (!tree.folders.has(current)) tree.folders.set(current,await drive.createFolder(part,parent));
      parent = tree.folders.get(current)!;
    }
    return drive.createFile(path.split('/').pop()!,parent,data);
  };
  const remember = async (path: string, r: RemoteFile, data: ArrayBuffer) => {
    state[path] = { remoteId:r.id, remoteVersion:r.version, localHash:await hash(data) };
    await hooks.checkpoint();
  };
  const backup = async (path: string, data: ArrayBuffer) => {
    check(); const dir = '.gsync-personal-backups';
    if (!await vault.adapter.exists(dir)) await vault.adapter.mkdir(dir);
    const base = `${dir}/${Date.now()}-${uniqueSuffix()}`;
    await vault.adapter.writeBinary(base+'.bin',data);
    await vault.adapter.write(base+'.json',JSON.stringify({path,createdAt:new Date().toISOString()}));
  };
  const conflict = async (path: string, data: ArrayBuffer) => {
    check(); const cp = conflictPath(path);
    await parents(cp); await vault.createBinary(cp,data); // never overwrite an existing copy
    const remote = await upload(cp,data); await remember(cp,remote,data);
    result.conflicts.push(cp);
  };
  for (const path of paths) {
    check();
    if (excluded(path,settings,vault.configDir)) continue;
    try {
      const found = vault.getAbstractFileByPath(path); const l = found instanceof TFile ? found : null;
      if (found && !l) throw new Error('Local folder occupies a remote file path.');
      const r = tree.files.get(path);
      if ((l && l.stat.size > maxBytes) || (r && (!r.size || Number(r.size)>maxBytes))) { result.skipped.push(path); continue; }
      const ld = l ? await vault.readBinary(l) : null;
      if (ld && ld.byteLength > maxBytes) { result.skipped.push(path); continue; }
      const lh = ld ? await hash(ld) : '';
      const s = Object.prototype.hasOwnProperty.call(state,path) ? state[path] : undefined;
      if (l && ld && !r) { const created = await upload(path,ld); await remember(path,created,ld); result.uploaded++; continue; }
      if (!r) continue;
      const localChanged = !s || s.localHash !== lh;
      const remoteChanged = !s || s.remoteId !== r.id || s.remoteVersion !== r.version;
      if (l && !localChanged && !remoteChanged) continue;
      const rd = await drive.download(r); check();
      if (rd.byteLength > maxBytes) { result.skipped.push(path); continue; }
      if (!l) { await parents(path); check(); await vault.createBinary(path,rd); await remember(path,r,rd); result.downloaded++; continue; }
      if (await hash(rd) === lh) { await remember(path,r,ld!); continue; }
      if (localChanged) {
        // Preserve the exact remote bytes before any remote replacement, even for a one-sided edit.
        await backup(path,rd);
        if (remoteChanged) await conflict(path,rd);
        check(); const updated = await drive.updateFile(r,ld!);
        // Record the bytes uploaded, not a later version edited during the request.
        await remember(path,updated,ld!); result.uploaded++;
      } else {
        await backup(path,ld!); check();
        if (path.toLowerCase().endsWith('.md') || path.toLowerCase().endsWith('.txt') || path.toLowerCase().endsWith('.canvas')) {
          const decoder = new TextDecoder('utf-8',{fatal:true});
          const before = decoder.decode(ld!); const after = decoder.decode(rd);
          // Reject BOM/normalization differences rather than silently rewriting bytes.
          if (await hash(new TextEncoder().encode(before).buffer) !== lh || await hash(new TextEncoder().encode(after).buffer) !== await hash(rd)) throw new Error('Text encoding requires manual conflict resolution.');
          await vault.process(l,current=> { if (current !== before) throw new Error('Local note changed during download. Retry.'); return after; });
          await remember(path,r,rd); result.downloaded++;
        } else {
          // Obsidian has no public atomic compare-and-swap for binaries: preserve both versions.
          await conflict(path,rd); await remember(path,r,ld!);
        }
      }
    } catch (e) { result.errors.push(`${path}: ${(e as Error).message}`); }
  }
  return result;
}
