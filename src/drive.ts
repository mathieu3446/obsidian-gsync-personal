import { requestUrl, RequestUrlResponse } from "obsidian";
import { hash, safeSegment } from "./security";
const API = "https://www.googleapis.com/drive/v3";
const UPLOAD = "https://www.googleapis.com/upload/drive/v3";
// Drive v3 File metadata has no ETag. Use v2 for the complete conditional
// replacement (metadata AND upload), rather than passing a v2 tag to v3.
const WRITE_API = "https://www.googleapis.com/drive/v2";
const WRITE_UPLOAD = "https://www.googleapis.com/upload/drive/v2";
const WRITE_FIELDS = "id,title,mimeType,md5Checksum,modifiedDate,fileSize,version,labels(trashed),etag";
const FOLDER = "application/vnd.google-apps.folder";
const FIELDS = "id,name,mimeType,md5Checksum,modifiedTime,size,version,trashed,appProperties";
export interface RemoteFile { id: string; name: string; mimeType: string; md5Checksum?: string; modifiedTime: string; size?: string; version: string; trashed?: boolean; appProperties?: Record<string,string> }
interface WriteFile { id: string; title: string; mimeType: string; md5Checksum?: string; modifiedDate: string; fileSize?: string; version: string; labels?: { trashed?: boolean }; etag?: string }
export interface RemoteTree { files: Map<string, RemoteFile>; folders: Map<string,string> }
const q = (s: string) => s.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
const id = (s: string) => encodeURIComponent(s);
export class DriveClient {
  constructor(private getToken: () => Promise<string>) {}
  private async req(url: string, opts: { method?: string; body?: string | ArrayBuffer; contentType?: string; etag?: string } = {}): Promise<RequestUrlResponse> {
    if (![API, UPLOAD, WRITE_API, WRITE_UPLOAD].some(base => url.startsWith(base + "/"))) throw new Error("Invalid API destination");
    const r = await requestUrl({ url, method: opts.method ?? "GET", body: opts.body, contentType: opts.contentType,
      headers: { Authorization: `Bearer ${await this.getToken()}`, ...(opts.etag ? { "If-Match": opts.etag } : {}) }, throw: false });
    if (r.status >= 300) throw new Error(r.status === 412 ? "Drive file changed during sync. Retry." : `Drive API error ${r.status}.`);
    return r;
  }
  async metadata(fileId: string): Promise<RemoteFile> {
    const r = await this.req(`${API}/files/${id(fileId)}?fields=${FIELDS}`);
    return r.json as RemoteFile;
  }
  private async list(query: string): Promise<RemoteFile[]> {
    const out: RemoteFile[] = []; let pageToken = ""; const seen = new Set<string>();
    do {
      const params = new URLSearchParams({ q: query, fields: `nextPageToken,incompleteSearch,files(${FIELDS})`, pageSize: "1000", spaces: "drive" });
      if (pageToken) params.set("pageToken", pageToken);
      const r = await this.req(`${API}/files?${params}`);
      const j = r.json as { files: RemoteFile[]; nextPageToken?: string; incompleteSearch?: boolean };
      if (j.incompleteSearch) throw new Error("Drive listing incomplete; sync stopped.");
      out.push(...j.files); pageToken = j.nextPageToken ?? "";
      if (out.length > 50000 || (pageToken && seen.has(pageToken))) throw new Error("Drive listing limit reached.");
      seen.add(pageToken);
    } while (pageToken);
    return out;
  }
  async root(name: string, savedId: string): Promise<string> {
    if (!safeSegment(name)) throw new Error("Enter one non-empty dedicated folder name, without slashes.");
    if (savedId) {
      const f = await this.metadata(savedId);
      if (f.trashed || f.mimeType !== FOLDER || f.appProperties?.gsyncPersonal !== "1") throw new Error("Bound folder unavailable. Sync stopped; it will not be recreated automatically.");
      return f.id;
    }
    throw new Error('No destination bound. Create a destination on ONE device in settings, then copy its folder ID to all other devices.');
  }
  async createRoot(name: string): Promise<string> {
    if (!safeSegment(name)) throw new Error('Invalid dedicated folder name.');
    // Explicit destinations have unique names; sync never creates or guesses a root.
    return this.createFolder(name.slice(0,140)+' - '+crypto.randomUUID(),'root',true);
  }
  async createFolder(name: string, parentId: string, root = false): Promise<string> {
    if (!safeSegment(name)) throw new Error("Unsafe folder name");
    const r = await this.req(`${API}/files?fields=id`, { method: "POST", contentType: "application/json",
      body: JSON.stringify({ name, mimeType: FOLDER, parents: [parentId], ...(root ? { appProperties: { gsyncPersonal: "1" } } : {}) }) });
    return (r.json as { id: string }).id;
  }
  async listTree(rootId: string): Promise<RemoteTree> {
    const files = new Map<string,RemoteFile>(); const folders = new Map([["",rootId]]);
    const queue: [string,string][] = [["",rootId]]; const names = new Set<string>(); const visited = new Set<string>();
    while (queue.length) {
      const [prefix,parent] = queue.shift()!;
      if (visited.has(parent) || visited.size > 5000) throw new Error("Folder traversal limit reached.");
      visited.add(parent);
      for (const f of await this.list(`'${q(parent)}' in parents and trashed = false`)) {
        if (!safeSegment(f.name)) throw new Error("Unsafe remote filename; sync stopped.");
        const path = prefix ? `${prefix}/${f.name}` : f.name;
        if (path.length > 1000 || path.split("/").length > 30) throw new Error("Remote path too deep.");
        const canonical = path.normalize("NFC").toLowerCase();
        if (names.has(canonical)) throw new Error("Duplicate or case-colliding remote paths; sync stopped.");
        names.add(canonical);
        if (names.size > 50000) throw new Error("Too many remote files.");
        if (f.mimeType === FOLDER) { folders.set(path,f.id); queue.push([path,f.id]); }
        else if (!f.mimeType.startsWith("application/vnd.google-apps.")) files.set(path,f);
      }
    }
    return { files, folders };
  }
  async download(file: RemoteFile): Promise<ArrayBuffer> {
    const r = await this.req(`${API}/files/${id(file.id)}?alt=media`);
    const current = await this.metadata(file.id);
    if (current.trashed || current.version !== file.version) throw new Error("Drive file changed during download. Retry.");
    return r.arrayBuffer;
  }
  async createFile(name: string, parentId: string, data: ArrayBuffer): Promise<RemoteFile> {
    if (!safeSegment(name)) throw new Error("Unsafe filename");
    const boundary = "gsync-" + crypto.randomUUID(); const enc = new TextEncoder();
    const head = enc.encode(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` + JSON.stringify({name,parents:[parentId]}) + `\r\n--${boundary}\r\nContent-Type: application/octet-stream\r\n\r\n`);
    const tail = enc.encode(`\r\n--${boundary}--`); const body = new Uint8Array(head.length + data.byteLength + tail.length);
    body.set(head); body.set(new Uint8Array(data),head.length); body.set(tail,head.length+data.byteLength);
    const r = await this.req(`${UPLOAD}/files?uploadType=multipart&fields=${FIELDS}`,{method:"POST",contentType:`multipart/related; boundary=${boundary}`,body:body.buffer});
    return r.json as RemoteFile;
  }
  async updateFile(expected: RemoteFile, data: ArrayBuffer): Promise<RemoteFile> {
    const response = await this.req(`${WRITE_API}/files/${id(expected.id)}?fields=${WRITE_FIELDS}`);
    const latest = response.json as WriteFile;
    if (latest.id !== expected.id || !/^\d+$/.test(expected.version) || latest.labels?.trashed || latest.version !== expected.version) throw new Error("Drive changed since comparison; retry.");
    if (typeof latest.mimeType !== "string" || !latest.mimeType || latest.mimeType.startsWith("application/vnd.google-apps.")) throw new Error("Drive file type changed; update refused.");
    // The v2 JSON ETag is the metadata validator, not the media download tag.
    // Refuse weak tags, wildcard conditions and malformed header values.
    if (typeof latest.etag !== "string" || !/^"[\x21\x23-\x7e]+"$/.test(latest.etag)) throw new Error("Google did not provide a valid Drive v2 ETag. Update refused to protect concurrent edits.");
    const r = await this.req(`${WRITE_UPLOAD}/files/${id(expected.id)}?uploadType=media&newRevision=true&fields=${WRITE_FIELDS}`,
      { method:"PUT",contentType:latest.mimeType,body:data,etag:latest.etag });
    const written = r.json as WriteFile;
    // Use the version in THIS write response. A later metadata request could
    // already describe somebody else's edit and must never be checkpointed.
    if (written.id !== expected.id || typeof written.version !== "string" || !/^\d+$/.test(written.version) || BigInt(written.version) <= BigInt(expected.version)) throw new Error("Drive upload result could not be verified. Retry sync; local changes are preserved.");
    const updated: RemoteFile = { id:written.id, name:written.title, mimeType:written.mimeType, md5Checksum:written.md5Checksum,
      modifiedTime:written.modifiedDate, size:written.fileSize, version:written.version, trashed:written.labels?.trashed };
    const verified = await this.download(updated);
    if (await hash(verified) !== await hash(data)) throw new Error("Drive upload content could not be verified. Retry sync; local changes are preserved.");
    return updated;
  }
}
