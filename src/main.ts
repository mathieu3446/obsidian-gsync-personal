import { Notice, ObsidianProtocolData, Plugin } from 'obsidian';
import { exchangeCode, isPendingValid, PendingAuth, prepareSignIn, PreparedSignIn, PROTOCOL_ACTION, refreshAccessToken, revokeToken } from './auth';
import { DriveClient } from './drive';
import { DEFAULT_SETTINGS, GSyncSettings, GSyncSettingTab } from './settings';
import { runSync, SyncState } from './sync';
import { seal, Sealed, unseal, safeSegment } from './security';
interface Credentials { clientId: string; clientSecret: string; refreshToken: string; driveAccess?: "full" }
interface Data { schema: 2; settings: GSyncSettings; state: SyncState; credentials: Sealed | null }
export default class GSyncPlugin extends Plugin {
  settings: GSyncSettings = { ...DEFAULT_SETTINGS };
  state: SyncState = Object.create(null) as SyncState;
  encrypted: Sealed | null = null;
  private credentials: Credentials | null = null;
  private password = '';
  private accessToken = '';
  private expiresAt = 0;
  private pending: PendingAuth | null = null;
  private prepared: PreparedSignIn | null = null;
  private active = true;
  private vaultReady=false;
  private busy = false;
  private signingIn = false;
  private credentialBusy = false;
  private queue: Promise<void> = Promise.resolve();
  private interval: number | null = null;
  private tab!: GSyncSettingTab;
  get unlocked() { return this.credentials !== null; }
  get signedIn() { return !!this.credentials?.refreshToken; }
  get working() { return this.busy || this.signingIn || this.credentialBusy; }
  async onload() {
    const d = await this.loadData() as Data | null;
    if (d && d.schema !== 2) throw new Error('Unsupported settings. Install this fork in its own plugin directory.');
    if (d) { this.settings = { ...DEFAULT_SETTINGS,...d.settings }; this.state = Object.assign(Object.create(null),d.state); this.encrypted = d.credentials; }
    this.tab = new GSyncSettingTab(this.app,this); this.addSettingTab(this.tab);
    this.addRibbonIcon('refresh-cw','GSync Personal: sync',()=>void this.sync());
    this.addCommand({ id:'sync',name:'Sync now',callback:()=>void this.sync() });
    this.addCommand({ id:'lock',name:'Lock credentials',callback:()=>{ try { this.lock(); } catch(e) { new Notice((e as Error).message); } } });
    this.registerObsidianProtocolHandler(PROTOCOL_ACTION,p=>void this.finishSignIn(p));
    this.app.workspace.onLayoutReady(()=>{if(this.active) this.vaultReady=true;});
    this.schedule();
  }
  onunload() { this.active = false; this.credentials = null; this.password = ''; this.accessToken = ''; this.pending = null; this.prepared = null; }
  saveAll(): Promise<void> {
    // Snapshot and serialize writes; no cleartext secret or PKCE verifier is ever persisted.
    const snapshot = JSON.parse(JSON.stringify({schema:2,settings:this.settings,state:this.state,credentials:this.encrypted}));
    const job = this.queue.then(()=>this.saveData(snapshot)); this.queue = job.catch(()=>undefined); return job;
  }
  async unlock(password: string) {
    if (this.working) throw new Error('Wait for the current operation.');
    this.credentialBusy=true;
    try {
    if (!this.encrypted) throw new Error('Save credentials first.');
    const value = await unseal(this.encrypted,password) as Credentials;
    if (!value || typeof value.clientId !== 'string' || typeof value.clientSecret !== 'string' || typeof value.refreshToken !== 'string') throw new Error('Invalid credential format.');
    if(!this.active) throw new Error('Plugin unloaded.');
    this.credentials = value; this.password = password; await this.prepare(); this.tab.display();
    } finally { this.credentialBusy=false; }
  }
  async configure(clientId: string, clientSecret: string, password: string) {
    if (this.working) throw new Error('Wait for the current operation.');
    this.credentialBusy=true;
    try {
    if (this.encrypted && !this.unlocked) throw new Error('Unlock existing credentials before changing them.');
    if (!clientId.endsWith('.apps.googleusercontent.com') || !clientSecret) throw new Error('Enter a Google OAuth client ID and secret.');
    if (this.signedIn) throw new Error('Revoke the existing Google connection before replacing credentials.');
    const next = {clientId:clientId.trim(),clientSecret:clientSecret.trim(),refreshToken:''};
    const encrypted = await seal(next,password);
    if(!this.active) throw new Error('Plugin unloaded.');
    this.encrypted = encrypted; this.credentials = next; this.password = password;
    this.state = Object.create(null); this.settings.remoteFolderId = '';
    await this.saveAll(); await this.prepare(); this.tab.display();
    } finally { this.credentialBusy=false; }
  }
  lock() {
    if (this.working) throw new Error('Wait for the current operation before locking.');
    this.credentials = null; this.password = ''; this.accessToken = ''; this.expiresAt=0; this.pending=null; this.prepared=null;
    this.tab.display();
  }
  private async prepare() {
    this.prepared = null;
    if (this.credentials) this.prepared = await prepareSignIn(this.credentials.clientId,this.settings.redirectUri,'');
  }
  async refreshSignInLink() { if (this.working) throw new Error('Wait for current operation.'); await this.prepare(); }
  startSignIn() {
    if (this.working || !this.credentials) throw new Error('Unlock credentials and wait for current operation.');
    if (!this.prepared || !isPendingValid(this.prepared.pending)) { void this.prepare().catch(()=>undefined); throw new Error('Preparing a fresh sign-in link. Press the button again.'); }
    this.pending = this.prepared.pending;
    const url = this.prepared.url; this.prepared=null;
    window.open(url,'_blank','noopener,noreferrer');
    new Notice('Complete Google sign-in. Keep this vault open.');
  }
  private async finishSignIn(params: ObsidianProtocolData) {
    if (this.working || !this.credentials || !isPendingValid(this.pending) || params.state !== this.pending.state) return;
    const pending = this.pending; this.pending=null; this.signingIn=true;
    try {
      if (params.error || !params.code) throw new Error('Google sign-in cancelled or incomplete.');
      const tokens = await exchangeCode(this.credentials.clientId,this.credentials.clientSecret,params.code,pending);
      const next: Credentials = {...this.credentials,refreshToken:tokens.refreshToken,driveAccess:"full"};
      this.encrypted = await seal(next,this.password); this.credentials=next;
      this.accessToken=tokens.accessToken; this.expiresAt=tokens.expiresAt;
      // Never reuse comparison state when a different Google account may have been selected.
      this.state=Object.create(null); this.settings.remoteFolderId='';
      await this.saveAll(); new Notice('Google connected with full Drive permission. Restore your existing Bound folder ID before syncing.');
    } catch(e) { new Notice((e as Error).message,12000); }
    finally { this.signingIn=false; this.tab.display(); }
  }
  async revoke() {
    if (this.working || !this.credentials) throw new Error('Unlock credentials and wait for current operation.');
    this.signingIn=true;
    try {
      if (this.credentials.refreshToken) await revokeToken(this.credentials.refreshToken);
      this.credentials={...this.credentials,refreshToken:''}; this.encrypted=await seal(this.credentials,this.password);
      this.accessToken=''; this.expiresAt=0; this.pending=null; this.prepared=null;
      await this.saveAll(); new Notice('Google access revoked. Other devices using this authorization may need to sign in again.');
    } finally { this.signingIn=false; this.tab.display(); }
  }
  private async token() {
    if (!this.active || !this.credentials?.refreshToken) throw new Error('Credentials locked or Google disconnected.');
    if(this.credentials.driveAccess!=='full') throw new Error('Permission upgrade required: use Sign in again in GSync Personal settings, then restore the existing folder ID.');
    if (!this.accessToken || Date.now() >= this.expiresAt) {
      const t=await refreshAccessToken(this.credentials.clientId,this.credentials.clientSecret,this.credentials.refreshToken);
      this.accessToken=t.accessToken; this.expiresAt=t.expiresAt;
    }
    return this.accessToken;
  }
  async updateSettings(next: GSyncSettings) {
    if (this.working) throw new Error('Wait for the current operation before changing settings.');
    if (!safeSegment(next.remoteFolder)) throw new Error('Use one non-empty folder name, without slashes.');
    if (next.remoteFolderId && !/^[a-zA-Z0-9_-]{10,200}$/.test(next.remoteFolderId)) throw new Error('Invalid folder ID.');
    const uri=new URL(next.redirectUri); if(uri.protocol!=='https:' || uri.search || uri.hash || uri.username || uri.password) throw new Error('Use a plain HTTPS redirect URL.');
    if (!Number.isFinite(next.autoSyncMinutes) || next.autoSyncMinutes<0 || next.autoSyncMinutes>1440 || !Number.isFinite(next.maxFileSizeMB) || next.maxFileSizeMB<1 || next.maxFileSizeMB>100) throw new Error('Invalid interval or file size (1–100 MB).');
    if(next.remoteFolderId!==this.settings.remoteFolderId || next.remoteFolder!==this.settings.remoteFolder) this.state=Object.create(null);
    this.settings={...next}; this.pending=null;
    await this.saveAll(); await this.prepare(); this.schedule();
  }
  async initializeFolder() {
    if(this.working || !this.signedIn) throw new Error('Unlock credentials and connect Google first.');
    if(this.settings.remoteFolderId) throw new Error('A destination is already bound. Use its ID on other devices.');
    this.busy=true;
    try {
      const id=await new DriveClient(()=>this.token()).createRoot(this.settings.remoteFolder);
      if(!this.active) throw new Error('Plugin unloaded.');
      this.settings.remoteFolderId=id; this.state=Object.create(null);
      await this.saveAll(); new Notice('Destination created. Copy its folder ID to your other devices before syncing.',15000);
    } finally { this.busy=false; if(this.active) this.tab.display(); }
  }
  schedule() {
    if(this.interval!==null) window.clearInterval(this.interval);
    this.interval=null;
    if(this.settings.autoSyncMinutes>0) { this.interval=window.setInterval(()=>{if(this.signedIn && !this.working) void this.sync();},Math.max(1,this.settings.autoSyncMinutes)*60000); this.registerInterval(this.interval); }
  }
  async sync() {
    if(this.working) { new Notice('An operation is already running.'); return; }
    if(!this.vaultReady) { new Notice('Wait for the vault to finish loading before syncing.'); return; }
    if(!this.signedIn) { new Notice('Unlock GSync Personal and connect Google in settings.'); return; }
    this.busy=true;
    try {
      const r=await runSync(this.app,new DriveClient(()=>this.token()),this.settings,this.state,{checkpoint:()=>this.saveAll(),cancelled:()=>!this.active});
      new Notice(`GSync Personal: ${r.uploaded} uploaded, ${r.downloaded} downloaded, ${r.deletedLocal} local / ${r.deletedRemote} Drive files moved to trash, ${r.conflicts.length} conflict copies, ${r.skipped.length} skipped, ${r.errors.length} errors.`,10000);
      if(r.errors.length) new Notice(r.errors.slice(0,3).join('\n'),20000);
      if(r.conflicts.length) new Notice('Conflicting edits preserved. Review: '+r.conflicts.slice(0,3).join(', '),20000);
    } catch(e) { new Notice((e as Error).message,15000); }
    finally { this.busy=false; if(this.active) this.tab.display(); }
  }
}
