import { App, TFile } from "obsidian";
import { DriveApiError, DriveClient, RemoteFile } from "./drive";
import type { GSyncSettings } from "./settings";
import { hash, safePath, uniqueSuffix, conflictPath } from "./security";
export interface SyncRecord { remoteId: string; remoteVersion: string; localHash: string }
export type SyncState = Record<string,SyncRecord>;
export interface SyncResult { uploaded: number; downloaded: number; deletedLocal:number; deletedRemote:number; conflicts: string[]; skipped: string[]; errors: string[] }
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
  const result: SyncResult = { uploaded:0, downloaded:0, deletedLocal:0, deletedRemote:0, conflicts:[], skipped:[], errors:[] };
  const check = () => { if (hooks.cancelled()) throw new Error('Sync cancelled.'); };
  check();
  const root = await drive.root(settings.remoteFolder,settings.remoteFolderId);
  if (!settings.remoteFolderId) { settings.remoteFolderId = root; await hooks.checkpoint(); }
  const tree = await drive.listTree(root);
  const remoteById=new Map([...tree.files].map(([path,file])=>[file.id,path]));
  const deletedIds=new Set(tree.deletions.map(d=>d.remoteId));
  const locals = vault.getFiles().filter(f=>!excluded(f.path,settings,vault.configDir));
  const canonical = new Map<string,string>();
  for (const path of [...locals.map(f=>f.path),...tree.files.keys()]) {
    const key = path.normalize('NFC').toLowerCase();
    if (canonical.has(key) && canonical.get(key) !== path) throw new Error('Case/Unicode path collision; sync stopped.');
    canonical.set(key,path);
  }
  const paths = [...new Set([...locals.map(f=>f.path),...tree.files.keys(),...Object.keys(state)])].sort();
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
  const forget=async(path:string)=>{delete state[path];await hooks.checkpoint();};
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
  const trashLocal=async(path:string,file:TFile,data:ArrayBuffer,expectedHash:string)=>{
    await backup(path,data);check();
    if(vault.getAbstractFileByPath(path)!==file || await hash(await vault.readBinary(file))!==expectedHash) throw new Error('Local note changed before deletion. Retry.');
    // Use the vault trash on every platform, never permanent delete.
    await vault.trash(file,false);result.deletedLocal++;await forget(path);
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
      if (!r && s) {
        const movedInside=remoteById.has(s.remoteId);
        if(!movedInside) {
          // A historical marker must not hide an explicit restore/move outside
          // the vault. Only a proven 404 after a recorded deletion is accepted.
          try {
            const previous=await drive.metadata(s.remoteId);
            if(!previous.trashed) throw new Error('Previous Drive file moved outside the destination or is unavailable. Local copy preserved.');
          } catch(e) {
            if(!(e instanceof DriveApiError && e.status===404 && deletedIds.has(s.remoteId))) throw e;
          }
          await drive.recordDeletion(path,s.remoteId,s.localHash);
        }
        if(l && ld) {
          if(lh!==s.localHash) await conflict(path,ld); // edit versus deletion/move: preserve the edit under a new name
          await trashLocal(path,l,ld,lh);
        } else await forget(path);
        continue;
      }
      if(l && ld && !r) {
        const pathHash=await hash(new TextEncoder().encode(path).buffer);
        if(tree.deletions.some(d=>d.pathHash===pathHash && d.localHash===lh)) throw new Error('Previously deleted copy detected. Restore the original from Drive trash or use a new filename; it was not re-uploaded.');
        const created=await upload(path,ld);await remember(path,created,ld);result.uploaded++;continue;
      }
      if(!r) continue;
      const localChanged = !s || s.localHash !== lh;
      const remoteChanged = !s || s.remoteId !== r.id || s.remoteVersion !== r.version;
      if (l && !localChanged && !remoteChanged) continue;
      const rd = await drive.download(r); check();
      if (rd.byteLength > maxBytes) { result.skipped.push(path); continue; }
      if(!l && s && s.remoteId===r.id) {
        if(await hash(rd)===s.localHash) {
          await backup(path,rd);check();
          if(vault.getAbstractFileByPath(path)) throw new Error('Local path reappeared before deletion. Retry.');
          const folder=path.includes('/')?path.slice(0,path.lastIndexOf('/')):'';
          const parentId=tree.folders.get(folder);
          if(!parentId) throw new Error('Remote parent unavailable; deletion refused.');
          await drive.trashFile(r,parentId);
          // Append-only markers survive Drive trash retention and state resets.
          await drive.recordDeletion(path,r.id,s.localHash);deletedIds.add(r.id);
          result.deletedRemote++;await forget(path);continue;
        }
        // The other device edited after our last sync: keep that edit visibly.
        await backup(path,rd);result.conflicts.push(path);
      }
      if (!l) { await parents(path); check(); if(vault.getAbstractFileByPath(path)) throw new Error('Local path changed during download. Retry.');await vault.createBinary(path,rd); await remember(path,r,rd); result.downloaded++; continue; }
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
