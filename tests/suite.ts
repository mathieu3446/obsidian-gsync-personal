import test from 'node:test';
import assert from 'node:assert/strict';
import { seal,unseal,hash,safePath } from '../src/security';
import { prepareSignIn,exchangeCode,refreshAccessToken,revokeToken,SCOPE } from '../src/auth';
import { runSync } from '../src/sync';
import { DEFAULT_SETTINGS } from '../src/settings';
import { DriveClient } from '../src/drive';
import GSyncPlugin from '../src/main';
import { TFile,requests,responses } from 'obsidian';
const bytes=(s:string)=>new TextEncoder().encode(s).buffer;
const text=(b:ArrayBuffer)=>new TextDecoder().decode(b);
const rf=(name='note.md',version='1')=>({id:'id-'+name,name,mimeType:'application/octet-stream',version,size:'3',modifiedTime:'now'});
const wf=(version='1')=>({id:'id-note.md',title:'note.md',mimeType:'text/markdown',version,fileSize:'3',modifiedDate:'now',labels:{trashed:false},etag:'"metadata-'+version+'"'});
function fixture(local:Record<string,string>={},remote:Record<string,string>={}) {
  const files=new Map(Object.entries(local).map(([p,s])=>[p,new TFile(p,bytes(s))]));
  const remoteData=new Map(Object.entries(remote).map(([p,s])=>[p,bytes(s)]));
  const remoteFiles=new Map(Object.keys(remote).map(p=>[p,rf(p)]));
  const backups=new Map(); const settings={...DEFAULT_SETTINGS,remoteFolderId:'bound-folder'};
  const state={}; let hook=()=>{}; let updateHook=()=>{};
  const vault={configDir:'.obsidian',getFiles:()=>[...files.values()],getAbstractFileByPath:(p:string)=>files.get(p),
    readBinary:async(f:any)=>f.data,createFolder:async()=>{},
    createBinary:async(p:string,d:ArrayBuffer)=>{assert.ok(!files.has(p),'must not overwrite existing file');files.set(p,new TFile(p,d));},
    process:async(f:any,fn:any)=>{hook();f.data=bytes(fn(text(f.data)));},
    adapter:{exists:async()=>true,mkdir:async()=>{},writeBinary:async(p:string,d:ArrayBuffer)=>backups.set(p,d),write:async(p:string,d:string)=>backups.set(p,d)}};
  const drive={root:async()=>settings.remoteFolderId,listTree:async()=>({files:remoteFiles,folders:new Map([['',settings.remoteFolderId]])}),
    createFolder:async()=> 'folder',download:async(f:any)=>remoteData.get(f.name),
    createFile:async(name:string,parent:string,d:ArrayBuffer)=>{remoteData.set(name,d);const r=rf(name);remoteFiles.set(name,r);return r;},
    updateFile:async(f:any,d:ArrayBuffer)=>{updateHook();remoteData.set(f.name,d);return {...f,version:'2'};}};
  const run=()=>runSync({vault} as any,drive as any,settings,state,{checkpoint:async()=>{},cancelled:()=>false});
  return {files,remoteData,remoteFiles,backups,settings,state,vault,drive,run,setHook:(v:any)=>hook=v,setUpdateHook:(v:any)=>updateHook=v};
}
test('credentials encrypted, random, authenticated and wrong password rejected',async()=>{
  const p='a long unique passphrase';const s={clientSecret:'secret-value',refreshToken:'refresh-value'};
  const a=await seal(s,p),b=await seal(s,p);assert.notEqual(a.ciphertext,b.ciphertext);
  assert.ok(!JSON.stringify(a).includes('refresh-value'));assert.deepEqual(await unseal(a,p),s);
  await assert.rejects(unseal(a,'wrong'));await assert.rejects(seal(s,'short'));
  const tampered={...a,ciphertext:(a.ciphertext[0]==='A'?'B':'A')+a.ciphertext.slice(1)};await assert.rejects(unseal(tampered,p));
});
test('dangerous, hidden, Windows and config paths rejected',()=>{
  for(const p of ['../x','a/../x','a\\..\\x','.obsidian/plugins/x','CON.md','a/b:stream','/absolute','x.','x/constructor','settings/x']) assert.equal(safePath(p,'settings'),false,p);
  assert.equal(safePath('Notes/hello.md','.obsidian'),true);
});
test('OAuth full Drive scope, PKCE S256, no vault name in state',async()=>{
  const p=await prepareSignIn('client','https://example.com/callback','SECRET-VAULT'); const u=new URL(p.url);
  assert.equal(u.searchParams.get('scope'),SCOPE);assert.equal(SCOPE,'https://www.googleapis.com/auth/drive');
  assert.equal(u.searchParams.get('code_challenge_method'),'S256');assert.ok(!p.pending.state.includes('~'));
  await assert.rejects(prepareSignIn('client','http://example.com','vault'));
});
test('revocation failure preserves error and uses Google endpoint',async()=>{
  requests.length=0;responses.push({status:500});await assert.rejects(revokeToken('TEST-TOKEN'));
  assert.equal(requests[0].url,'https://oauth2.googleapis.com/revoke');assert.equal(requests[0].method,'POST');
});
test('full Drive grant accepted including legacy scope bundled by Google',async()=>{
 responses.push({status:200,json:{access_token:'a',refresh_token:'r',expires_in:3600,scope:SCOPE+' https://www.googleapis.com/auth/drive.file'}});
 const t=await exchangeCode('c','s','code',{verifier:'v',state:'s',redirectUri:'https://example.com',createdAt:Date.now()});assert.equal(t.refreshToken,'r');
});
test('missing remote file restored instead of deleting local note',async()=>{
  const f=fixture({'note.md':'old'});f.state['note.md']={remoteId:'gone',remoteVersion:'1',localHash:await hash(bytes('old'))};
  await f.run();assert.equal(text(f.files.get('note.md').data),'old');assert.equal(text(f.remoteData.get('note.md')),'old');
});
test('missing local file restored instead of deleting Drive file',async()=>{
  const f=fixture({}, {'note.md':'old'});const r=await f.run();assert.equal(r.downloaded,1);assert.equal(text(f.files.get('note.md').data),'old');
});
test('local edits during upload are not marked synchronized',async()=>{
  const f=fixture({'note.md':'new'},{'note.md':'old'});f.state['note.md']={remoteId:'id-note.md',remoteVersion:'1',localHash:await hash(bytes('old'))};
  f.setUpdateHook(()=>f.files.get('note.md').data=bytes('edited-again'));await f.run();
  assert.equal(f.state['note.md'].localHash,await hash(bytes('new')));assert.notEqual(f.state['note.md'].localHash,await hash(f.files.get('note.md').data));
});
test('atomic local compare prevents overwrite during download',async()=>{
  const f=fixture({'note.md':'old'},{'note.md':'new'});f.remoteFiles.get('note.md').version='2';
  f.state['note.md']={remoteId:'id-note.md',remoteVersion:'1',localHash:await hash(bytes('old'))};
  f.setHook(()=>f.files.get('note.md').data=bytes('typed meanwhile'));const r=await f.run();
  assert.equal(r.errors.length,1);assert.equal(text(f.files.get('note.md').data),'typed meanwhile');assert.equal(f.state['note.md'].remoteVersion,'1');
});
test('two-sided change preserves remote copy with unique name and backup',async()=>{
  const f=fixture({'note.md':'local'},{'note.md':'remote'});const r=await f.run();assert.equal(r.conflicts.length,1);
  assert.equal(text(f.files.get(r.conflicts[0]).data),'remote');assert.equal(text(f.remoteData.get('note.md')),'local');assert.ok(f.backups.size>=2);
});
test('binary download preserves both versions without unsafe replacement',async()=>{
  const f=fixture({'image.png':'old'},{'image.png':'new'});f.remoteFiles.get('image.png').version='2';
  f.state['image.png']={remoteId:'id-image.png',remoteVersion:'1',localHash:await hash(bytes('old'))};const r=await f.run();
  assert.equal(text(f.files.get('image.png').data),'old');assert.equal(r.conflicts.length,1);assert.equal(text(f.files.get(r.conflicts[0]).data),'new');
});
test('configuration, secrets and executable files are excluded',async()=>{
  const f=fixture({'.obsidian/data.json':'secret','bad.exe':'binary','note.md':'yes'});await f.run();assert.deepEqual([...f.remoteData.keys()],['note.md']);
});
test('case collisions stop before transfers',async()=>{const f=fixture({'Note.md':'a'},{'note.md':'b'});await assert.rejects(f.run(),/collision/);});
test('missing bound folder stops before reading or changing notes',async()=>{const f=fixture({'note.md':'a'});f.drive.root=async()=>{throw Error('unavailable');};await assert.rejects(f.run());assert.equal(f.remoteData.size,0);});
test('blank root rejected before any request',async()=>{const d=new DriveClient(async()=>'token');requests.length=0;await assert.rejects(d.root('',''));assert.equal(requests.length,0);});
test('renamed bound folder is looked up by ID, never recreated',async()=>{
  const d=new DriveClient(async()=>'token');requests.length=0;responses.push({status:200,json:{id:'bound',name:'renamed',mimeType:'application/vnd.google-apps.folder',appProperties:{gsyncPersonal:'1'}},headers:{}});
  assert.equal(await d.root('old-name','bound'),'bound');assert.equal(requests.length,1);assert.ok(requests[0].url.includes('/files/bound?'));
});
test('Drive updates refuse absent ETag and reject stale version',async()=>{
  const d=new DriveClient(async()=>'token');const f=rf();requests.length=0;
  responses.push({status:200,json:{...wf(),etag:undefined},headers:{}});await assert.rejects(d.updateFile(f,bytes('new')),/ETag/);
  responses.push({status:200,json:wf('2'),headers:{}});await assert.rejects(d.updateFile(f,bytes('new')),/changed/);
  assert.ok(requests.every(r=>r.method==='GET'));
});
test('Drive update sends conditional header and handles 412',async()=>{
  const d=new DriveClient(async()=>'token');const f=rf();requests.length=0;
  responses.push({status:200,json:wf(),headers:{}},{status:412});await assert.rejects(d.updateFile(f,bytes('new')),/changed/);
  assert.equal(requests[1].headers['If-Match'],'"metadata-1"');assert.equal(requests[1].method,'PUT');
  assert.equal(new URL(requests[1].url).pathname,'/upload/drive/v2/files/id-note.md');
});
test('raw Google error bodies never appear in errors',async()=>{
  const d=new DriveClient(async()=>'token');responses.push({status:403,text:'SECRET'});await assert.rejects(d.metadata('x'),e=>!String(e).includes('SECRET'));
});
test('settings persistence never serializes in-memory credentials',async()=>{
  const p=new GSyncPlugin();p.credentials={clientId:'id',clientSecret:'TOP-SECRET',refreshToken:'TOKEN-SECRET'};p.password='PASSWORD-SECRET';p.pending={verifier:'VERIFIER-SECRET'};
  await p.saveAll();const s=JSON.stringify(p.saved);for(const x of ['TOP-SECRET','TOKEN-SECRET','PASSWORD-SECRET','VERIFIER-SECRET']) assert.ok(!s.includes(x));
});

test('two conflict runs produce different filenames',async()=>{
  const f=fixture({'note.md':'local'},{'note.md':'remote'});const first=await f.run();
  f.remoteData.set('note.md',bytes('remote again'));f.remoteFiles.get('note.md').version='3';f.files.get('note.md').data=bytes('local again');
  const second=await f.run();assert.notEqual(first.conflicts[0],second.conflicts[0]);assert.ok(f.files.has(first.conflicts[0]));
});
test('Drive download refuses bytes when version changed during transfer',async()=>{
  const d=new DriveClient(async()=>'token');const f=rf();responses.push({status:200,arrayBuffer:bytes('new')},{status:200,json:{...f,version:'2'},headers:{}});
  await assert.rejects(d.download(f),/changed during download/);
});
test('duplicate remote filenames abort tree scan',async()=>{
  const d=new DriveClient(async()=>'token');responses.push({status:200,json:{files:[rf('Note.md'),rf('note.md')]}});
  await assert.rejects(d.listTree('root-id'),/colliding/);
});
test('partial Drive listing aborts sync',async()=>{
  const d=new DriveClient(async()=>'token');responses.push({status:200,json:{files:[],incompleteSearch:true}});
  await assert.rejects(d.listTree('root-id'),/incomplete/);
});
test('invalid OAuth state cannot exchange a token or discard valid pending state',async()=>{
  const p=new GSyncPlugin();p.credentials={clientId:'id',clientSecret:'secret',refreshToken:''};p.pending={state:'expected',createdAt:Date.now()};
  requests.length=0;await p.finishSignIn({state:'wrong',code:'attacker'});assert.equal(requests.length,0);assert.equal(p.pending.state,'expected');
});
test('failed initial persistence releases synchronization lock',async()=>{
  const p=new GSyncPlugin();p.credentials={clientId:'id',clientSecret:'secret',refreshToken:'token'};p.accessToken='access';p.expiresAt=Date.now()+100000;p.tab={display(){}};
  p.saveData=async()=>{throw Error('Disk full');};p.app={vault:{}};
  responses.push({status:200,json:{files:[{id:'new-root'}]}});
  await p.sync();assert.equal(p.working,false);
});

test('credential setup blocks lock and concurrent setup until complete',async()=>{
 const p=new GSyncPlugin();p.tab={display(){}};
 const pending=p.configure('test.apps.googleusercontent.com','secret','a long test passphrase');
 assert.equal(p.working,true);assert.throws(()=>p.lock(),/Wait/);
 await assert.rejects(p.configure('other.apps.googleusercontent.com','secret','a long test passphrase'),/Wait/);
 await pending;assert.equal(p.working,false);p.lock();assert.equal(p.unlocked,false);
});
test('unloaded plugin does not resurrect credentials after encryption',async()=>{
 const p=new GSyncPlugin();p.tab={display(){}};
 const pending=p.configure('test.apps.googleusercontent.com','secret','a long test passphrase');p.onunload();
 await assert.rejects(pending,/unloaded/);assert.equal(p.unlocked,false);assert.equal(p.working,false);
});
test('simultaneous unbound syncs never create a root',async()=>{
 responses.length=0;requests.length=0;const d=new DriveClient(async()=>'token');
 const results=await Promise.allSettled([d.root('Dedicated',''),d.root('Dedicated','')]);
 assert.ok(results.every(r=>r.status==='rejected'));assert.equal(requests.length,0);
});
test('long conflict filenames remain valid and preserve original extension',async()=>{
 const {conflictPath,safeSegment}=await import('../src/security');
 const path='Folder/'+ 'a'.repeat(190)+'.md';const cp=conflictPath(path);
 assert.ok(cp.startsWith('Folder/'));assert.ok(cp.endsWith('.md'));assert.ok(safeSegment(cp.split('/').pop()));
 assert.notEqual(cp,conflictPath(path));
});

test('legacy encrypted credentials require explicit reauthorization before any API request',async()=>{
 const p=new GSyncPlugin();p.credentials={clientId:'id',clientSecret:'secret',refreshToken:'legacy'};requests.length=0;
 await assert.rejects(p.token(),/upgrade required/);assert.equal(requests.length,0);
});
test('limited OAuth grant fails without revoking authorizations on other devices',async()=>{
 responses.length=0;requests.length=0;responses.push({status:200,json:{access_token:'a',refresh_token:'r',expires_in:3600,scope:'https://www.googleapis.com/auth/drive.file'}});
 await assert.rejects(exchangeCode('c','s','code',{verifier:'v',state:'s',redirectUri:'https://example.com',createdAt:Date.now()}),/Full Drive/);
 assert.equal(requests.length,1);assert.ok(!requests.some(r=>r.url.includes('revoke')));
});
test('full Drive refresh works and unrelated scopes remain rejected',async()=>{
 responses.push({status:200,json:{access_token:'a',expires_in:3600,scope:SCOPE}});assert.equal((await refreshAccessToken('c','s','r')).accessToken,'a');
 responses.push({status:200,json:{access_token:'a',expires_in:3600,scope:SCOPE+' https://www.googleapis.com/auth/gmail.readonly'}});
 await assert.rejects(refreshAccessToken('c','s','r'),/Unexpected/);
});
test('successful reauthorization persists the full-access marker only inside encrypted credentials',async()=>{
 const p=new GSyncPlugin();p.credentials={clientId:'id',clientSecret:'secret',refreshToken:'old'};p.password='a long test passphrase';p.pending={state:'correct',verifier:'v',redirectUri:'https://example.com',createdAt:Date.now()};p.tab={display(){}};
 responses.push({status:200,json:{access_token:'a',refresh_token:'new-secret-token',expires_in:3600,scope:SCOPE}});
 await p.finishSignIn({state:'correct',code:'code'});
 assert.equal(p.credentials.driveAccess,'full');assert.equal((await unseal(p.encrypted,p.password)).refreshToken,'new-secret-token');
 assert.ok(!JSON.stringify(p.saved).includes('new-secret-token'));assert.equal(p.settings.remoteFolderId,'');
});
test('Drive discovery remains bounded to configured folder even with full authorization',async()=>{
 responses.length=0;requests.length=0;const d=new DriveClient(async()=>'full-token');
 responses.push({status:200,json:{files:[rf('created-by-another-app.md')]}});
 const tree=await d.listTree('bound-folder-id');assert.equal(tree.files.size,1);
 const query=new URL(requests[0].url).searchParams.get('q');assert.ok(query.includes("'bound-folder-id' in parents"));assert.ok(!query.includes("'root' in parents"));
});

test('existing Markdown link edit succeeds with JSON v2 ETag and no HTTP ETag header',async()=>{
 responses.length=0;requests.length=0;const d=new DriveClient(async()=>'token');const content=bytes('hello [[Other note]]');
 responses.push({status:200,json:wf(),headers:{}},{status:200,json:wf('2')},
   {status:200,arrayBuffer:content},{status:200,json:rf('note.md','2')});
 const updated=await d.updateFile(rf(),content);
 assert.equal(updated.version,'2');assert.equal(updated.name,'note.md');assert.equal(updated.size,'3');
 assert.equal(new URL(requests[0].url).pathname,'/drive/v2/files/id-note.md');
 assert.ok(new URL(requests[0].url).searchParams.get('fields').includes('etag'));
 assert.equal(requests[1].headers['If-Match'],'"metadata-1"');assert.equal(requests[1].contentType,'text/markdown');
 assert.equal(new URL(requests[1].url).searchParams.get('newRevision'),'true');assert.equal(text(requests[1].body),'hello [[Other note]]');
 assert.equal(requests.length,4);assert.equal(responses.length,0);
});

test('weak, wildcard and malformed ETags never produce a write',async()=>{
 const d=new DriveClient(async()=>'token');
 for(const etag of ['W/"weak"','*','', 'unquoted','"one", "two"','"bad\r\nheader"']) {
   requests.length=0;responses.push({status:200,json:{...wf(),etag}});
   await assert.rejects(d.updateFile(rf(),bytes('new')),/ETag/);assert.equal(requests.length,1);
 }
});

test('trashed, wrong-ID and missing-version metadata abort before uploading',async()=>{
 const d=new DriveClient(async()=>'token');
 for(const metadata of [{...wf(),labels:{trashed:true}},{...wf(),id:'other-file'},{...wf(),version:undefined}]) {
   requests.length=0;responses.push({status:200,json:metadata});
   await assert.rejects(d.updateFile(rf(),bytes('new')),/changed/);assert.equal(requests.length,1);
 }
 requests.length=0;responses.push({status:200,json:{...wf(),version:undefined}});
 await assert.rejects(d.updateFile({...rf(),version:undefined} as any,bytes('new')),/changed/);assert.equal(requests.length,1);
});

test('ambiguous upload response cannot checkpoint somebody else’s later version',async()=>{
 const d=new DriveClient(async()=>'token');
 for(const written of [{...wf(),version:undefined},{...wf('2'),id:'other'},wf(),wf('0')]) {
   requests.length=0;responses.push({status:200,json:wf()},{status:200,json:written});
   await assert.rejects(d.updateFile(rf(),bytes('new')),/could not be verified/);assert.equal(requests.length,2);
 }
});

test('readback mismatch and remote edit during readback remain errors',async()=>{
 const d=new DriveClient(async()=>'token');
 responses.push({status:200,json:wf()},{status:200,json:wf('2')},
   {status:200,arrayBuffer:bytes('wrong bytes')},{status:200,json:rf('note.md','2')});
 await assert.rejects(d.updateFile(rf(),bytes('new')),/content could not be verified/);
 responses.push({status:200,json:wf()},{status:200,json:wf('2')},
   {status:200,arrayBuffer:bytes('other edit')},{status:200,json:rf('note.md','3')});
 await assert.rejects(d.updateFile(rf(),bytes('new')),/changed during download/);
});

test('a second device writing after comparison gets 412 without losing local edit or checkpoint',async()=>{
 responses.length=0;requests.length=0;
 const f=fixture({'note.md':'local [[Link]]'},{'note.md':'old'});
 f.state['note.md']={remoteId:'id-note.md',remoteVersion:'1',localHash:await hash(bytes('old'))};
 const d=new DriveClient(async()=>'token');f.drive.updateFile=d.updateFile.bind(d);
 responses.push({status:200,json:wf()},options=>{
   // Another device wins after the metadata GET but before the conditional PUT.
   f.remoteData.set('note.md',bytes('second device edit'));f.remoteFiles.set('note.md',rf('note.md','2'));
   return {status:options.headers['If-Match']==='"metadata-2"'?200:412};
 });
 const result=await f.run();assert.equal(result.uploaded,0);assert.equal(result.errors.length,1);
 assert.equal(text(f.files.get('note.md').data),'local [[Link]]');assert.equal(text(f.remoteData.get('note.md')),'second device edit');
 assert.equal(f.state['note.md'].remoteVersion,'1');assert.ok(f.backups.size>=2);
});

test('two successive Markdown edits sync through DriveClient and preserve the previous bytes',async()=>{
 responses.length=0;requests.length=0;const f=fixture({'note.md':'first [[Link]]'},{'note.md':'old'});
 f.state['note.md']={remoteId:'id-note.md',remoteVersion:'1',localHash:await hash(bytes('old'))};
 const d=new DriveClient(async()=>'token');f.drive.updateFile=d.updateFile.bind(d);
 for(const [from,to,content] of [['1','2','first [[Link]]'],['2','3','second [[Other]]']]) {
   f.files.get('note.md').data=bytes(content);
   responses.push({status:200,json:wf(from)},options=>{
     assert.equal(options.headers['If-Match'],wf(from).etag);f.remoteData.set('note.md',options.body);
     f.remoteFiles.set('note.md',rf('note.md',to));return {status:200,json:wf(to)};
   },{status:200,arrayBuffer:bytes(content)},{status:200,json:rf('note.md',to)});
   const result=await f.run();assert.deepEqual(result.errors,[]);assert.equal(result.uploaded,1);
   assert.equal(f.state['note.md'].remoteVersion,to);assert.equal(f.state['note.md'].localHash,await hash(bytes(content)));
   assert.equal(text(f.remoteData.get('note.md')),content);
 }
 const saved=[...f.backups.entries()].filter(([p])=>p.endsWith('.bin')).map(([,data])=>text(data));
 assert.ok(saved.includes('old'));assert.ok(saved.includes('first [[Link]]'));assert.equal(responses.length,0);
});
