import { App, Notice, PluginSettingTab, Setting } from 'obsidian';
import type GSyncPlugin from './main';
import { DEFAULT_REDIRECT } from './auth';
export interface GSyncSettings { redirectUri:string; remoteFolder:string; remoteFolderId:string; autoSyncMinutes:number; excludes:string; extensions:string; maxFileSizeMB:number }
export const DEFAULT_SETTINGS: GSyncSettings = { redirectUri:DEFAULT_REDIRECT,remoteFolder:'Obsidian Personal',remoteFolderId:'',autoSyncMinutes:0,excludes:'',extensions:'md,txt,canvas,pdf,png,jpg,jpeg,gif,webp,mp3,wav,m4a,ogg,mp4,webm',maxFileSizeMB:25 };
export class GSyncSettingTab extends PluginSettingTab {
  constructor(app:App,private plugin:GSyncPlugin){super(app,plugin);}
  display() {
    const el=this.containerEl; el.empty();
    const action=async(fn:()=>Promise<void>|void)=>{try{await fn();}catch(e){new Notice((e as Error).message,12000);}};
    new Setting(el).setName('GSync Personal').setHeading();
    el.createEl('p',{text:'Restricted Google access. No automatic deletions. Credentials are encrypted locally; unlock after each restart. Notes uploaded to Drive are not end-to-end encrypted.'});
    el.createEl('p',{text:this.plugin.unlocked ? (this.plugin.signedIn?'Unlocked • Google connected':'Unlocked • Google not connected') : 'Locked'});
    if(this.plugin.encrypted && !this.plugin.unlocked) {
      let pass='';
      new Setting(el).setName('Passphrase').addText(t=>{t.inputEl.type='password';t.onChange(v=>pass=v);});
      new Setting(el).setName('Unlock').addButton(b=>b.setButtonText('Unlock').onClick(()=>void action(async()=>{await this.plugin.unlock(pass);pass='';})));
    }
    if(!this.plugin.encrypted || this.plugin.unlocked) {
      if(!this.plugin.signedIn) {
        let clientId='',secret='',password='';
        new Setting(el).setName('New OAuth client ID').setDesc('Use a dedicated Web application client for this fork on every device.').addText(t=>t.onChange(v=>clientId=v));
        new Setting(el).setName('Client secret').addText(t=>{t.inputEl.type='password';t.onChange(v=>secret=v);});
        new Setting(el).setName('Encryption passphrase').setDesc('At least 14 characters. Not saved. Required after restarting Obsidian.').addText(t=>{t.inputEl.type='password';t.onChange(v=>password=v);});
        new Setting(el).setName('Store encrypted credentials').addButton(b=>b.setButtonText('Save credentials').onClick(()=>void action(async()=>{await this.plugin.configure(clientId,secret,password);secret='';password='';})));
      }
      if(this.plugin.unlocked) {
        if(!this.plugin.signedIn) new Setting(el).setName('Google sign-in').addButton(b=>b.setButtonText('Sign in with Google').onClick(()=>void action(()=>this.plugin.startSignIn())));
        new Setting(el).setName('Lock locally').setDesc('Does not revoke Google access.').addButton(b=>b.setButtonText('Lock').onClick(()=>void action(()=>this.plugin.lock())));
        if(this.plugin.signedIn) new Setting(el).setName('Revoke Google access').setDesc('Revokes this authorization at Google, including other devices sharing it.').addButton(b=>b.setButtonText('Revoke and disconnect').onClick(()=>void action(()=>this.plugin.revoke())));
      }
    }
    const draft={...this.plugin.settings};
    new Setting(el).setName('Synchronization').setHeading();
    new Setting(el).setName('Dedicated folder name').setDesc('Created by this app. Existing arbitrary Drive files are not imported.').addText(t=>t.setValue(draft.remoteFolder).onChange(v=>draft.remoteFolder=v.trim()));
    new Setting(el).setName('Bound folder ID').setDesc('Filled after first sync. Copy this ID to another device using the same Google account and OAuth client. Keep it after renaming the folder.').addText(t=>t.setValue(draft.remoteFolderId).onChange(v=>draft.remoteFolderId=v.trim()));
    new Setting(el).setName('Auto-sync interval (minutes)').setDesc('0 disables it. Runs only after unlocking.').addText(t=>t.setValue(String(draft.autoSyncMinutes)).onChange(v=>draft.autoSyncMinutes=Number(v)));
    new Setting(el).setName('Maximum file size (MB)').addText(t=>t.setValue(String(draft.maxFileSizeMB)).onChange(v=>draft.maxFileSizeMB=Number(v)));
    new Setting(el).setName('Allowed extensions').setDesc('Comma-separated. Executables and archives are not included by default.').addText(t=>t.setValue(draft.extensions).onChange(v=>draft.extensions=v));
    new Setting(el).setName('Excluded paths').setDesc('One path, folder/ or *.extension per line.').addTextArea(t=>t.setValue(draft.excludes).onChange(v=>draft.excludes=v));
    new Setting(el).setName('Your static sign-in page').setDesc('Your own GitHub Pages HTTPS URL, also registered in Google Cloud. No server to administer.').addText(t=>t.setValue(draft.redirectUri).onChange(v=>draft.redirectUri=v.trim()));
    new Setting(el).setName('Save settings').addButton(b=>b.setButtonText('Save settings').onClick(()=>void action(async()=>{await this.plugin.updateSettings(draft);this.display();})));
    new Setting(el).setName('Sync now').addButton(b=>b.setButtonText('Sync').onClick(()=>void this.plugin.sync()));
    el.createEl('p',{text:'Deleted files return from the other side. Binary conflicts create separate copies. Local recovery snapshots are in .gsync-personal-backups inside the vault; retain an independent backup.'});
  }
}
