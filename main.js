"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key2 of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key2) && key2 !== except)
        __defProp(to, key2, { get: () => from[key2], enumerable: !(desc = __getOwnPropDesc(from, key2)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/main.ts
var main_exports = {};
__export(main_exports, {
  default: () => GSyncPlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian5 = require("obsidian");

// src/auth.ts
var import_obsidian = require("obsidian");
var AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
var TOKEN_URL = "https://oauth2.googleapis.com/token";
var SCOPE = "https://www.googleapis.com/auth/drive";
function validateScope(scope) {
  if (scope === void 0) return;
  const scopes = scope.split(/\s+/).filter(Boolean);
  if (!scopes.includes(SCOPE)) throw new Error("Full Drive access required. Sign in again to upgrade the previous limited permission.");
  if (scopes.some((s) => s !== SCOPE && s !== "https://www.googleapis.com/auth/drive.file")) throw new Error("Unexpected Google permissions. Use the dedicated GSync OAuth client.");
}
var DEFAULT_REDIRECT = "https://mathieu3446.github.io/obsidian-gsync-personal/callback.html";
var PROTOCOL_ACTION = "gsync-personal-auth";
var PENDING_TTL_MS = 15 * 60 * 1e3;
function base64url(bytes2) {
  let s = "";
  bytes2.forEach((b) => s += String.fromCharCode(b));
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function formBody(o) {
  return Object.entries(o).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join("&");
}
async function prepareSignIn(clientId, redirectUri, vaultName) {
  const redirect = new URL(redirectUri);
  if (redirect.protocol !== "https:" || redirect.username || redirect.password || redirect.search || redirect.hash) throw new Error("Redirect must be a plain HTTPS URL.");
  const verifier = base64url(crypto.getRandomValues(new Uint8Array(32)));
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  const challenge = base64url(new Uint8Array(digest));
  const state = base64url(crypto.getRandomValues(new Uint8Array(32)));
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: SCOPE,
    code_challenge: challenge,
    code_challenge_method: "S256",
    access_type: "offline",
    prompt: "consent",
    state
  });
  return {
    url: `${AUTH_URL}?${params.toString()}`,
    pending: { verifier, state, redirectUri, createdAt: Date.now() }
  };
}
function isPendingValid(p) {
  return !!p && Date.now() >= p.createdAt && Date.now() - p.createdAt < PENDING_TTL_MS;
}
async function exchangeCode(clientId, clientSecret, code, pending) {
  const r = await (0, import_obsidian.requestUrl)({
    url: TOKEN_URL,
    method: "POST",
    contentType: "application/x-www-form-urlencoded",
    body: formBody({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      code_verifier: pending.verifier,
      grant_type: "authorization_code",
      redirect_uri: pending.redirectUri
    }),
    throw: false
  });
  if (r.status !== 200) throw new Error(`Token exchange failed (${r.status}). Check OAuth configuration.`);
  const j = r.json;
  validateScope(j.scope);
  if (!j.refresh_token) {
    throw new Error("Google did not return a refresh token. Remove the app at myaccount.google.com/permissions and sign in again.");
  }
  return {
    accessToken: j.access_token,
    refreshToken: j.refresh_token,
    expiresAt: Date.now() + (j.expires_in - 60) * 1e3
  };
}
async function refreshAccessToken(clientId, clientSecret, refreshToken) {
  const r = await (0, import_obsidian.requestUrl)({
    url: TOKEN_URL,
    method: "POST",
    contentType: "application/x-www-form-urlencoded",
    body: formBody({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token"
    }),
    throw: false
  });
  if (r.status !== 200) {
    if (r.text.includes("invalid_grant")) {
      throw new Error(
        "Google rejected the saved sign-in (invalid_grant). Sign in again. If this happens every ~7 days, publish your OAuth app to 'In production' in Google Cloud."
      );
    }
    if (r.text.includes("invalid_client") || r.text.includes("unauthorized_client")) {
      throw new Error("Google rejected the client ID/secret. If you switched OAuth clients, sign in again with the new one.");
    }
    throw new Error(`Token refresh failed (${r.status}). Sign in again.`);
  }
  const j = r.json;
  validateScope(j.scope);
  return { accessToken: j.access_token, expiresAt: Date.now() + (j.expires_in - 60) * 1e3 };
}
async function revokeToken(token) {
  const r = await (0, import_obsidian.requestUrl)({
    url: "https://oauth2.googleapis.com/revoke",
    method: "POST",
    contentType: "application/x-www-form-urlencoded",
    body: formBody({ token }),
    throw: false
  });
  if (r.status !== 200) throw new Error(`Google revocation failed (${r.status}). Credentials retained; retry or revoke in your Google account.`);
}

// src/drive.ts
var import_obsidian2 = require("obsidian");

// src/security.ts
var enc = new TextEncoder();
var iterations = 6e5;
function b64(data) {
  let s = "";
  for (const b of data) s += String.fromCharCode(b);
  return btoa(s);
}
function bytes(s) {
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
}
async function key(password, salt) {
  const raw = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
    raw,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}
async function seal(value, password) {
  if (password.length < 14) throw new Error("Use a passphrase of at least 14 characters.");
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: enc.encode("gsync-personal:v1") },
    await key(password, salt),
    enc.encode(JSON.stringify(value))
  );
  return { version: 1, salt: b64(salt), iv: b64(iv), ciphertext: b64(new Uint8Array(ciphertext)) };
}
async function unseal(value, password) {
  if (value.version !== 1 || bytes(value.salt).length !== 16 || bytes(value.iv).length !== 12 || value.ciphertext.length > 1e5) throw new Error("Invalid encrypted credentials.");
  try {
    const clear = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: bytes(value.iv), additionalData: enc.encode("gsync-personal:v1") },
      await key(password, bytes(value.salt)),
      bytes(value.ciphertext)
    );
    return JSON.parse(new TextDecoder().decode(clear));
  } catch (e) {
    throw new Error("Wrong passphrase or damaged credentials.");
  }
}
async function hash(data) {
  return b64(new Uint8Array(await crypto.subtle.digest("SHA-256", data)));
}
function safeSegment(name) {
  return !!name && name.length <= 200 && !/[\\/\x00-\x1f<>:"|?*]/.test(name) && !name.startsWith(".") && !/[. ]$/.test(name) && !/^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(name) && !["__proto__", "constructor", "prototype"].includes(name);
}
function safePath(path, configDir) {
  return path.length < 1e3 && path.split("/").every(safeSegment) && path.toLowerCase() !== configDir.toLowerCase() && !path.toLowerCase().startsWith(configDir.toLowerCase() + "/");
}
function uniqueSuffix() {
  return crypto.randomUUID();
}
function conflictPath(path) {
  const slash = path.lastIndexOf("/");
  const prefix = path.slice(0, slash + 1);
  const file = path.slice(slash + 1);
  const dot = file.lastIndexOf(".");
  const ext = dot > 0 ? file.slice(dot) : "";
  const base = dot > 0 ? file.slice(0, dot) : file;
  const suffix = " (conflict " + uniqueSuffix() + ")";
  const budget = Math.min(200, 999 - prefix.length) - suffix.length - ext.length;
  if (budget < 1) throw new Error("Path too long for a safe conflict copy.");
  let short = base.slice(0, budget);
  if (/[\uD800-\uDBFF]$/.test(short)) short = short.slice(0, -1);
  const result = prefix + short + suffix + ext;
  if (!safeSegment(short + suffix + ext)) throw new Error("Unsafe conflict filename.");
  return result;
}

// src/drive.ts
var API = "https://www.googleapis.com/drive/v3";
var UPLOAD = "https://www.googleapis.com/upload/drive/v3";
var WRITE_API = "https://www.googleapis.com/drive/v2";
var WRITE_UPLOAD = "https://www.googleapis.com/upload/drive/v2";
var WRITE_FIELDS = "id,title,mimeType,md5Checksum,modifiedDate,fileSize,version,labels(trashed),etag";
var FOLDER = "application/vnd.google-apps.folder";
var FIELDS = "id,name,mimeType,md5Checksum,modifiedTime,size,version,trashed,appProperties";
var q = (s) => s.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
var id = (s) => encodeURIComponent(s);
var DriveClient = class {
  constructor(getToken) {
    this.getToken = getToken;
  }
  async req(url, opts = {}) {
    var _a;
    if (![API, UPLOAD, WRITE_API, WRITE_UPLOAD].some((base) => url.startsWith(base + "/"))) throw new Error("Invalid API destination");
    const r = await (0, import_obsidian2.requestUrl)({
      url,
      method: (_a = opts.method) != null ? _a : "GET",
      body: opts.body,
      contentType: opts.contentType,
      headers: { Authorization: `Bearer ${await this.getToken()}`, ...opts.etag ? { "If-Match": opts.etag } : {} },
      throw: false
    });
    if (r.status >= 300) throw new Error(r.status === 412 ? "Drive file changed during sync. Retry." : `Drive API error ${r.status}.`);
    return r;
  }
  async metadata(fileId) {
    const r = await this.req(`${API}/files/${id(fileId)}?fields=${FIELDS}`);
    return r.json;
  }
  async list(query) {
    var _a;
    const out = [];
    let pageToken = "";
    const seen = /* @__PURE__ */ new Set();
    do {
      const params = new URLSearchParams({ q: query, fields: `nextPageToken,incompleteSearch,files(${FIELDS})`, pageSize: "1000", spaces: "drive" });
      if (pageToken) params.set("pageToken", pageToken);
      const r = await this.req(`${API}/files?${params}`);
      const j = r.json;
      if (j.incompleteSearch) throw new Error("Drive listing incomplete; sync stopped.");
      out.push(...j.files);
      pageToken = (_a = j.nextPageToken) != null ? _a : "";
      if (out.length > 5e4 || pageToken && seen.has(pageToken)) throw new Error("Drive listing limit reached.");
      seen.add(pageToken);
    } while (pageToken);
    return out;
  }
  async root(name, savedId) {
    var _a;
    if (!safeSegment(name)) throw new Error("Enter one non-empty dedicated folder name, without slashes.");
    if (savedId) {
      const f = await this.metadata(savedId);
      if (f.trashed || f.mimeType !== FOLDER || ((_a = f.appProperties) == null ? void 0 : _a.gsyncPersonal) !== "1") throw new Error("Bound folder unavailable. Sync stopped; it will not be recreated automatically.");
      return f.id;
    }
    throw new Error("No destination bound. Create a destination on ONE device in settings, then copy its folder ID to all other devices.");
  }
  async createRoot(name) {
    if (!safeSegment(name)) throw new Error("Invalid dedicated folder name.");
    return this.createFolder(name.slice(0, 140) + " - " + crypto.randomUUID(), "root", true);
  }
  async createFolder(name, parentId, root = false) {
    if (!safeSegment(name)) throw new Error("Unsafe folder name");
    const r = await this.req(`${API}/files?fields=id`, {
      method: "POST",
      contentType: "application/json",
      body: JSON.stringify({ name, mimeType: FOLDER, parents: [parentId], ...root ? { appProperties: { gsyncPersonal: "1" } } : {} })
    });
    return r.json.id;
  }
  async listTree(rootId) {
    const files = /* @__PURE__ */ new Map();
    const folders = /* @__PURE__ */ new Map([["", rootId]]);
    const queue = [["", rootId]];
    const names = /* @__PURE__ */ new Set();
    const visited = /* @__PURE__ */ new Set();
    while (queue.length) {
      const [prefix, parent] = queue.shift();
      if (visited.has(parent) || visited.size > 5e3) throw new Error("Folder traversal limit reached.");
      visited.add(parent);
      for (const f of await this.list(`'${q(parent)}' in parents and trashed = false`)) {
        if (!safeSegment(f.name)) throw new Error("Unsafe remote filename; sync stopped.");
        const path = prefix ? `${prefix}/${f.name}` : f.name;
        if (path.length > 1e3 || path.split("/").length > 30) throw new Error("Remote path too deep.");
        const canonical = path.normalize("NFC").toLowerCase();
        if (names.has(canonical)) throw new Error("Duplicate or case-colliding remote paths; sync stopped.");
        names.add(canonical);
        if (names.size > 5e4) throw new Error("Too many remote files.");
        if (f.mimeType === FOLDER) {
          folders.set(path, f.id);
          queue.push([path, f.id]);
        } else if (!f.mimeType.startsWith("application/vnd.google-apps.")) files.set(path, f);
      }
    }
    return { files, folders };
  }
  async download(file) {
    const r = await this.req(`${API}/files/${id(file.id)}?alt=media`);
    const current = await this.metadata(file.id);
    if (current.trashed || current.version !== file.version) throw new Error("Drive file changed during download. Retry.");
    return r.arrayBuffer;
  }
  async createFile(name, parentId, data) {
    if (!safeSegment(name)) throw new Error("Unsafe filename");
    const boundary = "gsync-" + crypto.randomUUID();
    const enc2 = new TextEncoder();
    const head = enc2.encode(`--${boundary}\r
Content-Type: application/json; charset=UTF-8\r
\r
` + JSON.stringify({ name, parents: [parentId] }) + `\r
--${boundary}\r
Content-Type: application/octet-stream\r
\r
`);
    const tail = enc2.encode(`\r
--${boundary}--`);
    const body = new Uint8Array(head.length + data.byteLength + tail.length);
    body.set(head);
    body.set(new Uint8Array(data), head.length);
    body.set(tail, head.length + data.byteLength);
    const r = await this.req(`${UPLOAD}/files?uploadType=multipart&fields=${FIELDS}`, { method: "POST", contentType: `multipart/related; boundary=${boundary}`, body: body.buffer });
    return r.json;
  }
  async updateFile(expected, data) {
    var _a, _b;
    const response = await this.req(`${WRITE_API}/files/${id(expected.id)}?fields=${WRITE_FIELDS}`);
    const latest = response.json;
    if (latest.id !== expected.id || !/^\d+$/.test(expected.version) || ((_a = latest.labels) == null ? void 0 : _a.trashed) || latest.version !== expected.version) throw new Error("Drive changed since comparison; retry.");
    if (typeof latest.mimeType !== "string" || !latest.mimeType || latest.mimeType.startsWith("application/vnd.google-apps.")) throw new Error("Drive file type changed; update refused.");
    if (typeof latest.etag !== "string" || !/^"[\x21\x23-\x7e]+"$/.test(latest.etag)) throw new Error("Google did not provide a valid Drive v2 ETag. Update refused to protect concurrent edits.");
    const r = await this.req(
      `${WRITE_UPLOAD}/files/${id(expected.id)}?uploadType=media&newRevision=true&fields=${WRITE_FIELDS}`,
      { method: "PUT", contentType: latest.mimeType, body: data, etag: latest.etag }
    );
    const written = r.json;
    if (written.id !== expected.id || typeof written.version !== "string" || !/^\d+$/.test(written.version) || BigInt(written.version) <= BigInt(expected.version)) throw new Error("Drive upload result could not be verified. Retry sync; local changes are preserved.");
    const updated = {
      id: written.id,
      name: written.title,
      mimeType: written.mimeType,
      md5Checksum: written.md5Checksum,
      modifiedTime: written.modifiedDate,
      size: written.fileSize,
      version: written.version,
      trashed: (_b = written.labels) == null ? void 0 : _b.trashed
    };
    const verified = await this.download(updated);
    if (await hash(verified) !== await hash(data)) throw new Error("Drive upload content could not be verified. Retry sync; local changes are preserved.");
    return updated;
  }
};

// src/settings.ts
var import_obsidian3 = require("obsidian");
var DEFAULT_SETTINGS = { redirectUri: DEFAULT_REDIRECT, remoteFolder: "Obsidian Personal", remoteFolderId: "", autoSyncMinutes: 0, excludes: "", extensions: "md,txt,canvas,pdf,png,jpg,jpeg,gif,webp,mp3,wav,m4a,ogg,mp4,webm", maxFileSizeMB: 25 };
var GSyncSettingTab = class extends import_obsidian3.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  display() {
    const el = this.containerEl;
    el.empty();
    const action = async (fn) => {
      try {
        await fn();
      } catch (e) {
        new import_obsidian3.Notice(e.message, 12e3);
      }
    };
    new import_obsidian3.Setting(el).setName("GSync Personal").setHeading();
    el.createEl("p", { text: "Full Google Drive permission; this plugin synchronizes only the bound folder. No automatic deletions. Credentials are encrypted locally; unlock after each restart. Notes uploaded to Drive are not end-to-end encrypted." });
    el.createEl("p", { text: this.plugin.unlocked ? this.plugin.signedIn ? "Unlocked \u2022 Google connected" : "Unlocked \u2022 Google not connected" : "Locked" });
    if (this.plugin.encrypted && !this.plugin.unlocked) {
      let pass = "";
      new import_obsidian3.Setting(el).setName("Passphrase").addText((t) => {
        t.inputEl.type = "password";
        t.onChange((v) => pass = v);
      });
      new import_obsidian3.Setting(el).setName("Unlock").addButton((b) => b.setButtonText("Unlock").onClick(() => void action(async () => {
        await this.plugin.unlock(pass);
        pass = "";
      })));
    }
    if (!this.plugin.encrypted || this.plugin.unlocked) {
      if (!this.plugin.signedIn) {
        let clientId = "", secret = "", password = "";
        new import_obsidian3.Setting(el).setName("New OAuth client ID").setDesc("Use a dedicated Web application client for this fork on every device.").addText((t) => t.onChange((v) => clientId = v));
        new import_obsidian3.Setting(el).setName("Client secret").addText((t) => {
          t.inputEl.type = "password";
          t.onChange((v) => secret = v);
        });
        new import_obsidian3.Setting(el).setName("Encryption passphrase").setDesc("At least 14 characters. Not saved. Required after restarting Obsidian.").addText((t) => {
          t.inputEl.type = "password";
          t.onChange((v) => password = v);
        });
        new import_obsidian3.Setting(el).setName("Store encrypted credentials").addButton((b) => b.setButtonText("Save credentials").onClick(() => void action(async () => {
          await this.plugin.configure(clientId, secret, password);
          secret = "";
          password = "";
        })));
      }
      if (this.plugin.unlocked) {
        new import_obsidian3.Setting(el).setName("Google sign-in").setDesc("Copy your Bound folder ID before signing in again; restore it after authorization.").addButton((b) => b.setButtonText(this.plugin.signedIn ? "Sign in again" : "Sign in with Google").onClick(() => void action(() => this.plugin.startSignIn())));
        new import_obsidian3.Setting(el).setName("Lock locally").setDesc("Does not revoke Google access.").addButton((b) => b.setButtonText("Lock").onClick(() => void action(() => this.plugin.lock())));
        if (this.plugin.signedIn) new import_obsidian3.Setting(el).setName("Revoke Google access").setDesc("Revokes this authorization at Google, including other devices sharing it.").addButton((b) => b.setButtonText("Revoke and disconnect").onClick(() => void action(() => this.plugin.revoke())));
      }
    }
    if (this.plugin.signedIn && !this.plugin.settings.remoteFolderId) new import_obsidian3.Setting(el).setName("First device only: create destination").setDesc("On other devices, enter the existing folder ID instead. Sync never creates a destination automatically.").addButton((b) => b.setButtonText("Create new destination").onClick(() => void action(() => this.plugin.initializeFolder())));
    const draft = { ...this.plugin.settings };
    new import_obsidian3.Setting(el).setName("Synchronization").setHeading();
    new import_obsidian3.Setting(el).setName("Dedicated folder name").setDesc("Created by this app. Existing arbitrary Drive files are not imported.").addText((t) => t.setValue(draft.remoteFolder).onChange((v) => draft.remoteFolder = v.trim()));
    new import_obsidian3.Setting(el).setName("Bound folder ID").setDesc("Filled after first sync. Copy this ID to another device using the same Google account and OAuth client. Keep it after renaming the folder.").addText((t) => t.setValue(draft.remoteFolderId).onChange((v) => draft.remoteFolderId = v.trim()));
    new import_obsidian3.Setting(el).setName("Auto-sync interval (minutes)").setDesc("0 disables it. Runs only after unlocking.").addText((t) => t.setValue(String(draft.autoSyncMinutes)).onChange((v) => draft.autoSyncMinutes = Number(v)));
    new import_obsidian3.Setting(el).setName("Maximum file size (MB)").addText((t) => t.setValue(String(draft.maxFileSizeMB)).onChange((v) => draft.maxFileSizeMB = Number(v)));
    new import_obsidian3.Setting(el).setName("Allowed extensions").setDesc("Comma-separated. Executables and archives are not included by default.").addText((t) => t.setValue(draft.extensions).onChange((v) => draft.extensions = v));
    new import_obsidian3.Setting(el).setName("Excluded paths").setDesc("One path, folder/ or *.extension per line.").addTextArea((t) => t.setValue(draft.excludes).onChange((v) => draft.excludes = v));
    new import_obsidian3.Setting(el).setName("Your static sign-in page").setDesc("Your own GitHub Pages HTTPS URL, also registered in Google Cloud. No server to administer.").addText((t) => t.setValue(draft.redirectUri).onChange((v) => draft.redirectUri = v.trim()));
    new import_obsidian3.Setting(el).setName("Save settings").addButton((b) => b.setButtonText("Save settings").onClick(() => void action(async () => {
      await this.plugin.updateSettings(draft);
      this.display();
    })));
    new import_obsidian3.Setting(el).setName("Sync now").addButton((b) => b.setButtonText("Sync").onClick(() => void this.plugin.sync()));
    el.createEl("p", { text: "Deleted files return from the other side. Binary conflicts create separate copies. Local recovery snapshots are in .gsync-personal-backups inside the vault; retain an independent backup." });
  }
};

// src/sync.ts
var import_obsidian4 = require("obsidian");
function excluded(path, settings, configDir) {
  var _a, _b;
  if (!safePath(path, configDir)) return true;
  const ext = (_b = (_a = path.split(".").pop()) == null ? void 0 : _a.toLowerCase()) != null ? _b : "";
  if (!settings.extensions.split(",").map((x) => x.trim().toLowerCase()).includes(ext)) return true;
  return settings.excludes.split("\n").map((x) => x.trim()).filter((x) => x && !x.startsWith("#")).some((rule) => rule.startsWith("*.") ? path.toLowerCase().endsWith(rule.slice(1).toLowerCase()) : path === rule || path.startsWith(rule.endsWith("/") ? rule : rule + "/") || path.split("/").pop() === rule);
}
async function runSync(app, drive, settings, state, hooks) {
  const vault = app.vault;
  const result = { uploaded: 0, downloaded: 0, conflicts: [], skipped: [], errors: [] };
  const check = () => {
    if (hooks.cancelled()) throw new Error("Sync cancelled.");
  };
  check();
  const root = await drive.root(settings.remoteFolder, settings.remoteFolderId);
  if (!settings.remoteFolderId) {
    settings.remoteFolderId = root;
    await hooks.checkpoint();
  }
  const tree = await drive.listTree(root);
  const locals = vault.getFiles().filter((f) => !excluded(f.path, settings, vault.configDir));
  const canonical = /* @__PURE__ */ new Map();
  for (const path of [...locals.map((f) => f.path), ...tree.files.keys()]) {
    const key2 = path.normalize("NFC").toLowerCase();
    if (canonical.has(key2) && canonical.get(key2) !== path) throw new Error("Case/Unicode path collision; sync stopped.");
    canonical.set(key2, path);
  }
  const paths = [.../* @__PURE__ */ new Set([...locals.map((f) => f.path), ...tree.files.keys()])].sort();
  const maxBytes = Math.min(100, Math.max(1, settings.maxFileSizeMB)) * 1024 * 1024;
  const parents = async (path) => {
    let cur = "";
    for (const part of path.split("/").slice(0, -1)) {
      cur = cur ? cur + "/" + part : part;
      if (!vault.getAbstractFileByPath(cur)) await vault.createFolder(cur);
    }
  };
  const upload = async (path, data) => {
    check();
    let current = "";
    let parent = root;
    for (const part of path.split("/").slice(0, -1)) {
      current = current ? current + "/" + part : part;
      if (!tree.folders.has(current)) tree.folders.set(current, await drive.createFolder(part, parent));
      parent = tree.folders.get(current);
    }
    return drive.createFile(path.split("/").pop(), parent, data);
  };
  const remember = async (path, r, data) => {
    state[path] = { remoteId: r.id, remoteVersion: r.version, localHash: await hash(data) };
    await hooks.checkpoint();
  };
  const backup = async (path, data) => {
    check();
    const dir = ".gsync-personal-backups";
    if (!await vault.adapter.exists(dir)) await vault.adapter.mkdir(dir);
    const base = `${dir}/${Date.now()}-${uniqueSuffix()}`;
    await vault.adapter.writeBinary(base + ".bin", data);
    await vault.adapter.write(base + ".json", JSON.stringify({ path, createdAt: (/* @__PURE__ */ new Date()).toISOString() }));
  };
  const conflict = async (path, data) => {
    check();
    const cp = conflictPath(path);
    await parents(cp);
    await vault.createBinary(cp, data);
    const remote = await upload(cp, data);
    await remember(cp, remote, data);
    result.conflicts.push(cp);
  };
  for (const path of paths) {
    check();
    if (excluded(path, settings, vault.configDir)) continue;
    try {
      const found = vault.getAbstractFileByPath(path);
      const l = found instanceof import_obsidian4.TFile ? found : null;
      if (found && !l) throw new Error("Local folder occupies a remote file path.");
      const r = tree.files.get(path);
      if (l && l.stat.size > maxBytes || r && (!r.size || Number(r.size) > maxBytes)) {
        result.skipped.push(path);
        continue;
      }
      const ld = l ? await vault.readBinary(l) : null;
      if (ld && ld.byteLength > maxBytes) {
        result.skipped.push(path);
        continue;
      }
      const lh = ld ? await hash(ld) : "";
      const s = Object.prototype.hasOwnProperty.call(state, path) ? state[path] : void 0;
      if (l && ld && !r) {
        const created = await upload(path, ld);
        await remember(path, created, ld);
        result.uploaded++;
        continue;
      }
      if (!r) continue;
      const localChanged = !s || s.localHash !== lh;
      const remoteChanged = !s || s.remoteId !== r.id || s.remoteVersion !== r.version;
      if (l && !localChanged && !remoteChanged) continue;
      const rd = await drive.download(r);
      check();
      if (rd.byteLength > maxBytes) {
        result.skipped.push(path);
        continue;
      }
      if (!l) {
        await parents(path);
        check();
        await vault.createBinary(path, rd);
        await remember(path, r, rd);
        result.downloaded++;
        continue;
      }
      if (await hash(rd) === lh) {
        await remember(path, r, ld);
        continue;
      }
      if (localChanged) {
        await backup(path, rd);
        if (remoteChanged) await conflict(path, rd);
        check();
        const updated = await drive.updateFile(r, ld);
        await remember(path, updated, ld);
        result.uploaded++;
      } else {
        await backup(path, ld);
        check();
        if (path.toLowerCase().endsWith(".md") || path.toLowerCase().endsWith(".txt") || path.toLowerCase().endsWith(".canvas")) {
          const decoder = new TextDecoder("utf-8", { fatal: true });
          const before = decoder.decode(ld);
          const after = decoder.decode(rd);
          if (await hash(new TextEncoder().encode(before).buffer) !== lh || await hash(new TextEncoder().encode(after).buffer) !== await hash(rd)) throw new Error("Text encoding requires manual conflict resolution.");
          await vault.process(l, (current) => {
            if (current !== before) throw new Error("Local note changed during download. Retry.");
            return after;
          });
          await remember(path, r, rd);
          result.downloaded++;
        } else {
          await conflict(path, rd);
          await remember(path, r, ld);
        }
      }
    } catch (e) {
      result.errors.push(`${path}: ${e.message}`);
    }
  }
  return result;
}

// src/main.ts
var GSyncPlugin = class extends import_obsidian5.Plugin {
  constructor() {
    super(...arguments);
    this.settings = { ...DEFAULT_SETTINGS };
    this.state = /* @__PURE__ */ Object.create(null);
    this.encrypted = null;
    this.credentials = null;
    this.password = "";
    this.accessToken = "";
    this.expiresAt = 0;
    this.pending = null;
    this.prepared = null;
    this.active = true;
    this.busy = false;
    this.signingIn = false;
    this.credentialBusy = false;
    this.queue = Promise.resolve();
    this.interval = null;
  }
  get unlocked() {
    return this.credentials !== null;
  }
  get signedIn() {
    var _a;
    return !!((_a = this.credentials) == null ? void 0 : _a.refreshToken);
  }
  get working() {
    return this.busy || this.signingIn || this.credentialBusy;
  }
  async onload() {
    const d = await this.loadData();
    if (d && d.schema !== 2) throw new Error("Unsupported settings. Install this fork in its own plugin directory.");
    if (d) {
      this.settings = { ...DEFAULT_SETTINGS, ...d.settings };
      this.state = Object.assign(/* @__PURE__ */ Object.create(null), d.state);
      this.encrypted = d.credentials;
    }
    this.tab = new GSyncSettingTab(this.app, this);
    this.addSettingTab(this.tab);
    this.addRibbonIcon("refresh-cw", "GSync Personal: sync", () => void this.sync());
    this.addCommand({ id: "sync", name: "Sync now", callback: () => void this.sync() });
    this.addCommand({ id: "lock", name: "Lock credentials", callback: () => {
      try {
        this.lock();
      } catch (e) {
        new import_obsidian5.Notice(e.message);
      }
    } });
    this.registerObsidianProtocolHandler(PROTOCOL_ACTION, (p) => void this.finishSignIn(p));
    this.schedule();
  }
  onunload() {
    this.active = false;
    this.credentials = null;
    this.password = "";
    this.accessToken = "";
    this.pending = null;
    this.prepared = null;
  }
  saveAll() {
    const snapshot = JSON.parse(JSON.stringify({ schema: 2, settings: this.settings, state: this.state, credentials: this.encrypted }));
    const job = this.queue.then(() => this.saveData(snapshot));
    this.queue = job.catch(() => void 0);
    return job;
  }
  async unlock(password) {
    if (this.working) throw new Error("Wait for the current operation.");
    this.credentialBusy = true;
    try {
      if (!this.encrypted) throw new Error("Save credentials first.");
      const value = await unseal(this.encrypted, password);
      if (!value || typeof value.clientId !== "string" || typeof value.clientSecret !== "string" || typeof value.refreshToken !== "string") throw new Error("Invalid credential format.");
      if (!this.active) throw new Error("Plugin unloaded.");
      this.credentials = value;
      this.password = password;
      await this.prepare();
      this.tab.display();
    } finally {
      this.credentialBusy = false;
    }
  }
  async configure(clientId, clientSecret, password) {
    if (this.working) throw new Error("Wait for the current operation.");
    this.credentialBusy = true;
    try {
      if (this.encrypted && !this.unlocked) throw new Error("Unlock existing credentials before changing them.");
      if (!clientId.endsWith(".apps.googleusercontent.com") || !clientSecret) throw new Error("Enter a Google OAuth client ID and secret.");
      if (this.signedIn) throw new Error("Revoke the existing Google connection before replacing credentials.");
      const next = { clientId: clientId.trim(), clientSecret: clientSecret.trim(), refreshToken: "" };
      const encrypted = await seal(next, password);
      if (!this.active) throw new Error("Plugin unloaded.");
      this.encrypted = encrypted;
      this.credentials = next;
      this.password = password;
      this.state = /* @__PURE__ */ Object.create(null);
      this.settings.remoteFolderId = "";
      await this.saveAll();
      await this.prepare();
      this.tab.display();
    } finally {
      this.credentialBusy = false;
    }
  }
  lock() {
    if (this.working) throw new Error("Wait for the current operation before locking.");
    this.credentials = null;
    this.password = "";
    this.accessToken = "";
    this.expiresAt = 0;
    this.pending = null;
    this.prepared = null;
    this.tab.display();
  }
  async prepare() {
    this.prepared = null;
    if (this.credentials) this.prepared = await prepareSignIn(this.credentials.clientId, this.settings.redirectUri, "");
  }
  async refreshSignInLink() {
    if (this.working) throw new Error("Wait for current operation.");
    await this.prepare();
  }
  startSignIn() {
    if (this.working || !this.credentials) throw new Error("Unlock credentials and wait for current operation.");
    if (!this.prepared || !isPendingValid(this.prepared.pending)) {
      void this.prepare().catch(() => void 0);
      throw new Error("Preparing a fresh sign-in link. Press the button again.");
    }
    this.pending = this.prepared.pending;
    const url = this.prepared.url;
    this.prepared = null;
    window.open(url, "_blank", "noopener,noreferrer");
    new import_obsidian5.Notice("Complete Google sign-in. Keep this vault open.");
  }
  async finishSignIn(params) {
    if (this.working || !this.credentials || !isPendingValid(this.pending) || params.state !== this.pending.state) return;
    const pending = this.pending;
    this.pending = null;
    this.signingIn = true;
    try {
      if (params.error || !params.code) throw new Error("Google sign-in cancelled or incomplete.");
      const tokens = await exchangeCode(this.credentials.clientId, this.credentials.clientSecret, params.code, pending);
      const next = { ...this.credentials, refreshToken: tokens.refreshToken, driveAccess: "full" };
      this.encrypted = await seal(next, this.password);
      this.credentials = next;
      this.accessToken = tokens.accessToken;
      this.expiresAt = tokens.expiresAt;
      this.state = /* @__PURE__ */ Object.create(null);
      this.settings.remoteFolderId = "";
      await this.saveAll();
      new import_obsidian5.Notice("Google connected with full Drive permission. Restore your existing Bound folder ID before syncing.");
    } catch (e) {
      new import_obsidian5.Notice(e.message, 12e3);
    } finally {
      this.signingIn = false;
      this.tab.display();
    }
  }
  async revoke() {
    if (this.working || !this.credentials) throw new Error("Unlock credentials and wait for current operation.");
    this.signingIn = true;
    try {
      if (this.credentials.refreshToken) await revokeToken(this.credentials.refreshToken);
      this.credentials = { ...this.credentials, refreshToken: "" };
      this.encrypted = await seal(this.credentials, this.password);
      this.accessToken = "";
      this.expiresAt = 0;
      this.pending = null;
      this.prepared = null;
      await this.saveAll();
      new import_obsidian5.Notice("Google access revoked. Other devices using this authorization may need to sign in again.");
    } finally {
      this.signingIn = false;
      this.tab.display();
    }
  }
  async token() {
    var _a;
    if (!this.active || !((_a = this.credentials) == null ? void 0 : _a.refreshToken)) throw new Error("Credentials locked or Google disconnected.");
    if (this.credentials.driveAccess !== "full") throw new Error("Permission upgrade required: use Sign in again in GSync Personal settings, then restore the existing folder ID.");
    if (!this.accessToken || Date.now() >= this.expiresAt) {
      const t = await refreshAccessToken(this.credentials.clientId, this.credentials.clientSecret, this.credentials.refreshToken);
      this.accessToken = t.accessToken;
      this.expiresAt = t.expiresAt;
    }
    return this.accessToken;
  }
  async updateSettings(next) {
    if (this.working) throw new Error("Wait for the current operation before changing settings.");
    if (!safeSegment(next.remoteFolder)) throw new Error("Use one non-empty folder name, without slashes.");
    if (next.remoteFolderId && !/^[a-zA-Z0-9_-]{10,200}$/.test(next.remoteFolderId)) throw new Error("Invalid folder ID.");
    const uri = new URL(next.redirectUri);
    if (uri.protocol !== "https:" || uri.search || uri.hash || uri.username || uri.password) throw new Error("Use a plain HTTPS redirect URL.");
    if (!Number.isFinite(next.autoSyncMinutes) || next.autoSyncMinutes < 0 || next.autoSyncMinutes > 1440 || !Number.isFinite(next.maxFileSizeMB) || next.maxFileSizeMB < 1 || next.maxFileSizeMB > 100) throw new Error("Invalid interval or file size (1\u2013100 MB).");
    if (next.remoteFolderId !== this.settings.remoteFolderId || next.remoteFolder !== this.settings.remoteFolder) this.state = /* @__PURE__ */ Object.create(null);
    this.settings = { ...next };
    this.pending = null;
    await this.saveAll();
    await this.prepare();
    this.schedule();
  }
  async initializeFolder() {
    if (this.working || !this.signedIn) throw new Error("Unlock credentials and connect Google first.");
    if (this.settings.remoteFolderId) throw new Error("A destination is already bound. Use its ID on other devices.");
    this.busy = true;
    try {
      const id2 = await new DriveClient(() => this.token()).createRoot(this.settings.remoteFolder);
      if (!this.active) throw new Error("Plugin unloaded.");
      this.settings.remoteFolderId = id2;
      this.state = /* @__PURE__ */ Object.create(null);
      await this.saveAll();
      new import_obsidian5.Notice("Destination created. Copy its folder ID to your other devices before syncing.", 15e3);
    } finally {
      this.busy = false;
      if (this.active) this.tab.display();
    }
  }
  schedule() {
    if (this.interval !== null) window.clearInterval(this.interval);
    this.interval = null;
    if (this.settings.autoSyncMinutes > 0) {
      this.interval = window.setInterval(() => {
        if (this.signedIn && !this.working) void this.sync();
      }, Math.max(1, this.settings.autoSyncMinutes) * 6e4);
      this.registerInterval(this.interval);
    }
  }
  async sync() {
    if (this.working) {
      new import_obsidian5.Notice("An operation is already running.");
      return;
    }
    if (!this.signedIn) {
      new import_obsidian5.Notice("Unlock GSync Personal and connect Google in settings.");
      return;
    }
    this.busy = true;
    try {
      const r = await runSync(this.app, new DriveClient(() => this.token()), this.settings, this.state, { checkpoint: () => this.saveAll(), cancelled: () => !this.active });
      new import_obsidian5.Notice(`GSync Personal: ${r.uploaded} uploaded, ${r.downloaded} downloaded, ${r.conflicts.length} conflict copies, ${r.skipped.length} skipped, ${r.errors.length} errors.`, 1e4);
      if (r.errors.length) new import_obsidian5.Notice(r.errors.slice(0, 3).join("\n"), 2e4);
      if (r.conflicts.length) new import_obsidian5.Notice("Both versions preserved. Review: " + r.conflicts.slice(0, 3).join(", "), 2e4);
    } catch (e) {
      new import_obsidian5.Notice(e.message, 15e3);
    } finally {
      this.busy = false;
      if (this.active) this.tab.display();
    }
  }
};
