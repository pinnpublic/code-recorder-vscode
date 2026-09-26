const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {Recording,eligible,filename}=require('../src/recording');
const {parseRecording,Replay}=require('../player/replay');
test('UTF-16 edit, no-op save, rename, deletion, recreation and recovery preserve exact text',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'code-recorder-test-'));
 try{
  const journal=path.join(dir,'test.jsonl'),r=new Recording('test',new Map([['A.java','a😀\r\n한글']]),journal);
  r.update('A.java','a😀\r\n한글');assert.equal(r.data.events.length,0);
  r.update('A.java','a😀\r\n한글입력');r.update('A.java','a😁\r\n한글');r.move('A.java','src/B.java');
  r.update('src/B.java','final');r.update('new.js','new');r.remove('new.js');r.update('new.js','again');r.finish();
  const parsed=parseRecording(fs.readFileSync(journal,'utf8')),replay=new Replay(parsed);replay.seekEvent(parsed.events.length);
  assert.deepEqual([...replay.files.values()].map(f=>[f.path,f.text]),[['src/B.java','final'],['new.js','again']]);
  const truncated=fs.readFileSync(journal,'utf8').trimEnd().split('\n').slice(0,-1).join('\n')+'\n{"seq":';
  assert.equal(parseRecording(truncated).incomplete,true);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('filters and filenames enforce project scope',()=>{
 const options={excludes:new Set(['node_modules']),extensions:new Set(['js','json'])};
 for(const p of ['../outside.js','.env','src/.secret.js','node_modules/a.js','record.coderec.json'])assert.equal(eligible(p,options),false,p);
 assert.equal(eligible('src/a.js',options),true);
 assert.equal(filename('test',new Date(2026,8,26,13,31,59)),'vscode-test-20260926-133159.coderec.json');
});
