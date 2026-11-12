import { promises as fs } from 'node:fs';
import path from 'node:path';
import ignore from 'ignore';

const forbidden = /(^|\/)(\.git|node_modules|dist|build|coverage|\.next|\.venv|venv|\.ssh|\.aws|\.azure|\.kube)(\/|$)|(^|\/)(\.env[^/]*|[^/]*(?:secret|credential|password)[^/]*|id_rsa[^/]*|id_ed25519[^/]*)(\/|$)|\.(pem|key|p12|pfx|sqlite|db|png|jpg|jpeg|gif|webp|pdf|zip|exe|dll|woff2?|mp4|lock)$/i;
export class WorkspaceService {
  constructor(readonly root: string, private readonly excludes: string[] = []) {}
  async resolve(relative: string, allowMissing = false): Promise<string> {
    if (!relative || relative.includes('\\') || relative.includes(':') || [...relative].some(character => character.charCodeAt(0) < 32) || path.isAbsolute(relative) || relative.split('/').some(p => p === '..' || p === '.' || !p || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(p) || p.endsWith('.') || p.endsWith(' ')) || forbidden.test(relative)) throw new Error('Blocked workspace path. Use a relative, non-sensitive file path with forward slashes.');
    const root = await fs.realpath(this.root);
    const parts = relative.split('/');
    let current = root;
    // User/editor exclusions are evaluated separately so a repository .gitignore
    // negation can never re-include a path the user explicitly excluded.
    const excluded = ignore().add(this.excludes);
    let repository = ignore();
    for (let i = 0; i < parts.length; i++) {
      const prefix = parts.slice(0,i).join('/');
      try { repository = repository.add((await fs.readFile(path.join(current,'.gitignore'),'utf8')).split(/\r?\n/).filter(s => s && !s.startsWith('#')).map(s => {
        const negative = s.startsWith('!'); const pattern = negative ? s.slice(1) : s;
        if (!pattern) return '';
        const anchored = pattern.startsWith('/');
        const body = anchored ? pattern.slice(1) : pattern.includes('/') ? pattern : '**/' + pattern;
        const scoped = prefix ? prefix + '/' + body : anchored ? '/' + body : body;
        return (negative ? '!' : '') + scoped;
      }).filter(s => s && s !== '!' && s !== '/')); } catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; }
      const blocked = (candidate: string) => excluded.ignores(candidate) || repository.ignores(candidate);
      const child = parts.slice(0,i+1).join('/');
      current = path.join(current,parts[i]);
      try {
        const stat = await fs.lstat(current);
        if (stat.isSymbolicLink()) throw new Error('Symlinks and junctions are not accessible.');
        if (blocked(child + (stat.isDirectory() ? '/' : ''))) throw new Error('Path excluded by ignore rules.');
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== 'ENOENT' || !allowMissing) throw e;
        if (blocked(child)) throw new Error('Path excluded by ignore rules.');
      }
    }
    return current;
  }
  async read(file: string): Promise<string> {
    const target = await this.resolve(file);
    const handle = await fs.open(target,'r');
    try {
      const stat = await handle.stat();
      if (!stat.isFile() || stat.nlink > 1 || stat.size > 128 * 1024) throw new Error('Only non-linked text files up to 128 KiB are supported.');
      const buffer = Buffer.alloc(128 * 1024 + 1);
      const { bytesRead } = await handle.read(buffer,0,buffer.length,0);
      if (bytesRead > 128 * 1024 || buffer.subarray(0,bytesRead).includes(0)) throw new Error('Binary or oversized file excluded.');
      return new TextDecoder('utf-8',{fatal:true}).decode(buffer.subarray(0,bytesRead));
    } finally { await handle.close(); }
  }
  async files(signal?: AbortSignal): Promise<{files: string[]; truncated: boolean}> {
    const files: string[] = []; let visited = 0; let truncated = false;
    const walk = async (directory: string, depth: number): Promise<void> => {
      signal?.throwIfAborted();
      if (depth > 20 || visited > 10000 || files.length >= 1500) { truncated = true; return; }
      const entries = await fs.readdir(path.join(this.root,directory),{withFileTypes:true});
      for (const entry of entries) {
        signal?.throwIfAborted();
        if (++visited > 10000 || files.length >= 1500) { truncated = true; return; }
        const relative = directory ? directory + '/' + entry.name : entry.name;
        try { await this.resolve(relative); } catch { continue; }
        if (entry.isDirectory()) await walk(relative,depth+1);
        else if (entry.isFile()) files.push(relative);
      }
    };
    await walk('',0); return {files:files.sort(),truncated};
  }
  async search(query: string, namesOnly: boolean, signal: AbortSignal): Promise<unknown> {
    const result = await this.files(signal); const matches: {file:string;line?:number;text?:string}[] = [];
    const needle = query.toLowerCase(); let scanned = 0;
    for (const file of result.files) {
      signal.throwIfAborted(); if (matches.length >= 30 || scanned >= 200) break;
      if (namesOnly) { if (file.toLowerCase().includes(needle)) matches.push({file}); continue; }
      scanned++;
      try { const lines = (await this.read(file)).split(/\r?\n/); for (let i=0;i<lines.length && matches.length<30;i++) if (lines[i].toLowerCase().includes(needle)) matches.push({file,line:i+1,text:lines[i].slice(0,300)}); } catch { /* exclusions and non-text files are skipped */ }
    }
    return {matches,scanned,truncated:result.truncated || matches.length >= 30 || (!namesOnly && scanned >= 200)};
  }
}
