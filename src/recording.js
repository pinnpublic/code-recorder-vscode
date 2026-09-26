'use strict';
const fs = require('node:fs');
const path = require('node:path');
function eligible(relative, options) {
  const parts = relative.split('/');
  return !!relative && !parts.some(p => !p || p === '..' || p.startsWith('.') || options.excludes.has(p.toLowerCase()))
    && options.extensions.has(path.posix.extname(relative).slice(1).toLowerCase())
    && !relative.endsWith('.coderec.json') && !relative.endsWith('.journal.jsonl');
}
function filename(project, date = new Date()) {
  const two = n => String(n).padStart(2, '0');
  const stamp = date.getFullYear() + two(date.getMonth() + 1) + two(date.getDate()) + '-'
    + two(date.getHours()) + two(date.getMinutes()) + two(date.getSeconds());
  return `vscode-${project.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/[. ]+$/, '') || 'project'}-${stamp}.coderec.json`;
}
class Recording {
  constructor(root, initial, journal) {
    this.files = new Map(); this.counter = 0; this.active = null; this.ended = false;
    this.data = {format:'code-recorder', version:2, tool:'vscode', root, initial:[], events:[]};
    for (const [name, text] of initial) {
      const file = {fileId:'f' + ++this.counter, path:name, text};
      this.files.set(name, {...file}); this.data.initial.push({...file});
    }
    this.journal = journal;
    const header = JSON.stringify({...this.data, events:undefined}) + '\n';
    this.bytes = Buffer.byteLength(header,'utf8');
    if (this.bytes > 100 * 1024 * 1024) throw Error('초기 녹화 데이터가 너무 큽니다.');
    fs.writeFileSync(journal, header, {flag:'wx', encoding:'utf8'});
  }
  emit(event) {
    if (this.ended) throw Error('Recording already ended');
    const entry = {seq:this.data.events.length + 1, ...event};
    const line = JSON.stringify(entry) + '\n', size = Buffer.byteLength(line,'utf8');
    if (this.bytes + size > 120 * 1024 * 1024) throw Error('녹화 크기가 120MB에 도달했습니다. 보관된 기록을 내보내고 새 녹화를 시작하세요.');
    fs.appendFileSync(this.journal, line, 'utf8'); this.bytes += size;
    this.data.events.push(entry);
  }
  update(name, text) {
    let file = this.files.get(name);
    if (!file) {
      file = {fileId:'f' + ++this.counter, path:name, text};
      this.emit({type:'create', ...file}); this.files.set(name, file); return;
    }
    if (file.text === text) return;
    const old = file.text;
    let start = 0, tail = 0;
    while (start < old.length && start < text.length && old[start] === text[start]) start++;
    while (tail < old.length-start && tail < text.length-start && old[old.length-1-tail] === text[text.length-1-tail]) tail++;
    this.emit({type:'edit', fileId:file.fileId, path:name, offset:start,
      removedText:old.slice(start, old.length-tail), insertedText:text.slice(start, text.length-tail), source:'document'});
    file.text = text;
  }
  activate(name) {
    const file = this.files.get(name);
    if (!file || this.active === file.fileId) return;
    this.emit({type:'activate',fileId:file.fileId,path:name}); this.active = file.fileId;
  }
  remove(name) {
    const file = this.files.get(name);
    if (!file) return;
    this.emit({type:'delete',fileId:file.fileId,path:name}); this.files.delete(name);
    if (this.active === file.fileId) this.active = null;
  }
  move(from, to) {
    const file = this.files.get(from);
    if (!file || from === to) return;
    if (this.files.has(to)) this.remove(to);
    this.emit({type:'move',fileId:file.fileId,path:from,newPath:to});
    this.files.delete(from); file.path = to; this.files.set(to,file);
  }
  finish() { if (!this.ended) { this.emit({type:'end'}); this.ended = true; } return this.data; }
}
module.exports = {Recording, eligible, filename};
