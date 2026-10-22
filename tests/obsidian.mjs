export class TFile { constructor(path,data){ this.path=path;this.data=data;this.stat={size:data.byteLength,mtime:1}; } }
export class Notice { constructor(){} }
export class PluginSettingTab { constructor(){} }
export class Setting { constructor(){} }
export class Plugin { constructor(){this.saved=[];} async saveData(d){this.saved.push(d);} }
export const requests=[];
export const responses=[];
export async function requestUrl(options){requests.push(options);const next=responses.shift(); if(!next) throw Error('Unexpected request');return typeof next==='function'?next(options):next;}
