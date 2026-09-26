'use strict';
const vscode = require('vscode');
const fs = require('node:fs');
const path = require('node:path');
const {Recording, eligible, filename} = require('./recording');
const {parseRecording} = require('../player/replay');
const MAX_FILE = 2 * 1024 * 1024;
let controller;
class Controller {
  constructor(context) {
    this.context = context; this.session = null; this.busy = false; this.queue = Promise.resolve(); this.listeners = [];
    this.revisions = new Map();
    this.status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 10);
    this.status.name = 'Code Recorder'; context.subscriptions.push(this.status);
    this.statusIcon = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 10.1);
    this.statusIcon.name = 'Code Recorder 상태'; context.subscriptions.push(this.statusIcon);
    this.log = vscode.window.createOutputChannel('Code Recorder'); context.subscriptions.push(this.log);
    this.refresh();
  }
  refresh() {
    const active = !!this.session;
    this.status.text = active ? '녹화 중 · 종료' : this.busy ? '녹화 준비' : '코드 녹화';
    this.statusIcon.text = this.busy && !active ? '$(loading~spin)' : '$(circle-filled)';
    this.statusIcon.color = active ? '#ff6347' : undefined;
    this.status.tooltip = active ? `${this.root.fsPath}\n클릭하면 종료하고 녹화 파일을 저장합니다.` : 'Code Recorder: 코드 작성 과정 녹화';
    this.status.command = active ? 'codeRecorder.stop' : 'codeRecorder.start'; this.status.show();
    this.statusIcon.command = this.status.command; this.statusIcon.tooltip = this.status.tooltip; this.statusIcon.show();
    void vscode.commands.executeCommand('setContext','codeRecorder.recording',active);
    void vscode.commands.executeCommand('setContext','codeRecorder.busy',this.busy || active);
  }
  relative(uri) {
    if (uri.scheme !== 'file') return null;
    const name = path.relative(this.root.fsPath, uri.fsPath).split(path.sep).join('/');
    return name && !name.startsWith('../') && !path.isAbsolute(name) && eligible(name,this.options) ? name : null;
  }
  enqueue(work) {
    this.queue = this.queue.then(async () => { if (this.session) await work(); }).catch(error => this.fail(error));
    return this.queue;
  }
  fail(error) {
    this.log.appendLine(String(error.stack || error));
    this.detach(); this.session = null; this.busy = false; this.refresh();
    void vscode.window.showErrorMessage('녹화를 중단했습니다. 보관된 기록에서 복구할 수 있습니다. ' + error.message);
  }
  detach() { for (const item of this.listeners.splice(0)) item.dispose(); }
  async read(uri) {
    const stat = await vscode.workspace.fs.stat(uri);
    if (!(stat.type & vscode.FileType.File) || stat.type & vscode.FileType.SymbolicLink || stat.size > MAX_FILE) return null;
    const doc = await vscode.workspace.openTextDocument(uri);
    const text = doc.getText();
    return text.includes('\0') || Buffer.byteLength(text,'utf8') > MAX_FILE ? null : text;
  }
  async scan(uri, result = new Map()) {
    for (const [name,type] of await vscode.workspace.fs.readDirectory(uri)) {
      if (name.startsWith('.') || this.options.excludes.has(name.toLowerCase()) || type & vscode.FileType.SymbolicLink) continue;
      const child = vscode.Uri.joinPath(uri,name);
      if (type & vscode.FileType.Directory) await this.scan(child,result);
      else {
        const relative = this.relative(child); if (!relative) continue;
        const text = await this.read(child);
        if (text === null) { this.log.appendLine('제외 (크기/바이너리): ' + relative); continue; }
        result.set(relative,text);
        this.scanBytes += Buffer.byteLength(text,'utf8');
        if (result.size > 5000 || this.scanBytes > 64 * 1024 * 1024) throw Error('초기 코드가 너무 큽니다. 더 작은 폴더를 선택하세요. (5,000개 / 64MB)');
      }
    }
    return result;
  }
  capture(doc, activate = false) {
    if (!this.session) return;
    const name = this.relative(doc.uri); if (!name) return;
    this.revisions.set(name,(this.revisions.get(name)||0)+1);
    const text = doc.getText();
    this.enqueue(() => {
      if (text.includes('\0') || Buffer.byteLength(text,'utf8') > MAX_FILE) throw Error('기록 중 파일이 제한을 초과했습니다: ' + name);
      this.session.update(name,text); if (activate) this.session.activate(name);
    });
  }
  async reconcileUri(uri) {
    const name = this.relative(uri); if (!name) return;
    const revision = this.revisions.get(name)||0;
    try {
      const text = await this.read(uri);
      if (text !== null && this.session && revision === (this.revisions.get(name)||0)) this.session.update(name,text);
    } catch (error) {
      if (error.code === 'FileNotFound' || error.code === 'ENOENT') this.session?.remove(name);
      else throw error;
    }
  }
  async start(uri) {
    if (this.busy || this.session) return;
    if (!vscode.workspace.isTrusted) throw Error('신뢰할 수 있는 작업 공간에서 시작하세요.');
    if (!uri) {
      const folders = vscode.workspace.workspaceFolders || [];
      const items = folders.map(f => ({label:f.name,description:f.uri.fsPath,uri:f.uri}));
      items.push({label:'다른 폴더 선택…'});
      const picked = await vscode.window.showQuickPick(items,{placeHolder:'녹화할 프로젝트 또는 폴더'});
      if (!picked) return;
      uri = picked.uri || (await vscode.window.showOpenDialog({canSelectFolders:true,canSelectFiles:false,canSelectMany:false,openLabel:'녹화 대상 선택'}))?.[0];
    }
    if (!uri) return;
    if (uri.scheme !== 'file') throw Error('이번 버전은 로컬 파일 프로젝트를 지원합니다.');
    if (this.busy || this.session) return;
    this.busy = true; this.root = uri; this.refresh();
    try {
      if (!((await vscode.workspace.fs.stat(uri)).type & vscode.FileType.Directory)) throw Error('폴더를 선택하세요.');
      const config = vscode.workspace.getConfiguration('codeRecorder',uri);
      this.options = {excludes:new Set(config.get('excludeNames',[]).map(s=>s.toLowerCase())),
        extensions:new Set(config.get('extensions',[]).map(s=>s.replace(/^\./,'').toLowerCase()))};
      if (!this.options.extensions.size) throw Error('녹화 설정에서 기록할 확장자를 선택하세요.');
      this.scanBytes = 0;
      this.revisions.clear();
      const initial = await vscode.window.withProgress({location:vscode.ProgressLocation.Notification,title:'Code Recorder: 시작 코드 읽기'},()=>this.scan(uri));
      // Latest open buffers take precedence over disk, including unsaved changes made during the scan.
      for (const doc of vscode.workspace.textDocuments) {
        const name = this.relative(doc.uri);
        if (name) {
          const text = doc.getText();
          if (!text.includes('\0') && Buffer.byteLength(text,'utf8') <= MAX_FILE) initial.set(name,text);
        }
      }
      const storage = this.context.globalStorageUri.fsPath;
      fs.mkdirSync(storage,{recursive:true});
      this.exportName = filename(path.basename(uri.fsPath));
      this.journal = path.join(storage,this.exportName.replace('.coderec.json','') + '-' + require('node:crypto').randomUUID() + '.journal.jsonl');
      this.session = new Recording(path.basename(uri.fsPath),initial,this.journal);
      this.listeners.push(vscode.workspace.onDidChangeTextDocument(e=>{if(e.contentChanges.length) this.capture(e.document);}),
        vscode.window.onDidChangeActiveTextEditor(e=>{if(e) this.capture(e.document,true);}),
        vscode.workspace.onDidCreateFiles(e=>this.enqueue(async()=>{for(const file of e.files) await this.reconcileUri(file);})),
        vscode.workspace.onDidDeleteFiles(e=>this.enqueue(()=>{
          for(const file of e.files) this.removeUri(file);
        })),
        vscode.workspace.onDidRenameFiles(e=>this.enqueue(async()=>{
          for (const item of e.files) {
            const from = path.relative(this.root.fsPath,item.oldUri.fsPath).split(path.sep).join('/');
            const to = path.relative(this.root.fsPath,item.newUri.fsPath).split(path.sep).join('/');
            for (const name of [...this.session.files.keys()]) if(name===from || name.startsWith(from+'/')) {
              const next = to + name.slice(from.length);
              if (eligible(next,this.options) && !next.startsWith('../') && !path.isAbsolute(next)) this.session.move(name,next); else this.session.remove(name);
            }
            await this.reconcileUri(item.newUri);
          }
        })));
      const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(uri,'**/*'));
      this.listeners.push(watcher,watcher.onDidCreate(u=>this.enqueue(()=>this.reconcileUri(u))),
        watcher.onDidChange(u=>this.enqueue(()=>this.reconcileUri(u))),
        watcher.onDidDelete(u=>this.enqueue(()=>this.removeUri(u))));
      if (vscode.window.activeTextEditor) this.capture(vscode.window.activeTextEditor.document,true);
      this.busy = false; this.refresh();
    } catch (error) { this.detach(); this.session = null; this.busy = false; this.refresh(); throw error; }
  }
  async stop(destination) {
    if (!this.session || this.busy) return;
    this.busy = true;
    // Freeze listeners before draining queued snapshots. No edits after Stop enter the lesson.
    this.detach();
    for (const doc of vscode.workspace.textDocuments) if(doc.isDirty) this.capture(doc);
    await this.queue;
    if (!this.session) return;
    let data;
    try { data = this.session.finish(); }
    finally { this.session = null; this.busy = false; this.refresh(); }
    await this.export(data,this.exportName,destination);
    return data;
  }
  removeUri(uri) {
    const prefix = path.relative(this.root.fsPath,uri.fsPath).split(path.sep).join('/');
    for(const name of [...this.session.files.keys()]) if(name===prefix || name.startsWith(prefix+'/')) this.session.remove(name);
  }
  async export(data,name,destination) {
    const uri = destination || await vscode.window.showSaveDialog({defaultUri:vscode.Uri.file(path.join(path.dirname(this.root?.fsPath || require('node:os').homedir()),name)),
      filters:{'Code Recorder':['coderec.json']},saveLabel:'녹화 파일 저장'});
    if (!uri) { void vscode.window.showInformationMessage('녹화는 보관되었습니다. “보관된 녹화 복구 / 다시 내보내기”에서 저장할 수 있습니다.'); return; }
    const json = JSON.stringify(data);
    parseRecording(json);
    await vscode.workspace.fs.writeFile(uri,Buffer.from(json,'utf8'));
    void vscode.window.showInformationMessage('녹화 저장 완료: ' + path.basename(uri.fsPath));
  }
  async recover() {
    const dir = this.context.globalStorageUri.fsPath;
    const names = fs.existsSync(dir) ? fs.readdirSync(dir).filter(n=>n.endsWith('.journal.jsonl')).sort().reverse() : [];
    if (!names.length) { void vscode.window.showInformationMessage('보관된 녹화가 없습니다.'); return; }
    const name = await vscode.window.showQuickPick(names,{placeHolder:'복구하거나 다시 저장할 녹화'}); if(!name) return;
    const data = parseRecording(fs.readFileSync(path.join(dir,name),'utf8'));
    await this.export(data,filename(data.root || 'recovered'));
  }
  async exportPlayer() {
    const folder = (await vscode.window.showOpenDialog({canSelectFolders:true,canSelectFiles:false,canSelectMany:false,openLabel:'뷰어 저장 위치'}))?.[0];
    if (!folder) return;
    const target = vscode.Uri.joinPath(folder,'code-recorder-vscode-player');
    try { await vscode.workspace.fs.stat(target); throw Error('같은 이름의 폴더가 이미 있습니다. 다른 위치를 선택하세요.'); }
    catch(error) { if(error.code !== 'FileNotFound' && error.code !== 'ENOENT') throw error; }
    await vscode.workspace.fs.copy(vscode.Uri.joinPath(this.context.extensionUri,'player'),target,{overwrite:false});
    void vscode.window.showInformationMessage('뷰어를 저장했습니다. index.html을 브라우저에서 여세요.');
  }
  dispose() { this.detach(); }
}
function activate(context) {
  controller = new Controller(context);
  const register = (name,fn) => context.subscriptions.push(vscode.commands.registerCommand('codeRecorder.'+name,async(...args)=>{
    try { return await fn(...args); } catch(error) { controller.log.appendLine(String(error.stack||error)); void vscode.window.showErrorMessage('Code Recorder: '+error.message); }
  }));
  register('start',uri=>controller.start(uri)); register('stop',()=>controller.stop());
  register('recover',()=>controller.recover()); register('exportPlayer',()=>controller.exportPlayer());
  register('settings',()=>vscode.commands.executeCommand('workbench.action.openSettings','@ext:'+context.extension.id));
  context.subscriptions.push({dispose:()=>controller.dispose()});
  return {controller};
}
async function deactivate() { controller?.dispose(); if(controller) await controller.queue; }
module.exports = {activate,deactivate};
