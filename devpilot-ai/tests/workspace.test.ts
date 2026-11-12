import { afterEach, beforeEach, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { WorkspaceService } from '../src/services/WorkspaceService';
let root: string;
beforeEach(async () => { root = await fs.mkdtemp(path.join(os.tmpdir(),'devpilot-test-')); });
afterEach(async () => { await fs.rm(root,{recursive:true,force:true}); });
it('blocks traversal, secrets, git data, binary data and ignored paths', async () => {
  await fs.writeFile(path.join(root,'.gitignore'),'ignored/\n*.private\n');
  await fs.mkdir(path.join(root,'ignored')); await fs.writeFile(path.join(root,'ignored','a.ts'),'hidden');
  await fs.writeFile(path.join(root,'binary.ts'),Buffer.from([1,0,2]));
  const ws = new WorkspaceService(root);
  for (const file of ['../escape','C:/escape','.env','.git/config','node_modules/a','x.private','a\\b','file:stream','trailing.','CON','aux.txt','src/./x','a\nb']) await expect(ws.resolve(file,true)).rejects.toThrow();
  await expect(ws.read('ignored/a.ts')).rejects.toThrow();
  await expect(ws.read('binary.ts')).rejects.toThrow();
});
it('honors nested ignores and returns bounded text search results', async () => {
  await fs.mkdir(path.join(root,'src')); await fs.writeFile(path.join(root,'src','.gitignore'),'hidden.ts\n');
  await fs.writeFile(path.join(root,'src','hidden.ts'),'secret'); await fs.writeFile(path.join(root,'src','ok.ts'),'function hello() {}');
  const ws = new WorkspaceService(root);
  expect((await ws.files()).files).toContain('src/ok.ts'); expect((await ws.files()).files).not.toContain('src/hidden.ts');
  expect(await ws.search('hello',false,new AbortController().signal)).toMatchObject({matches:[{file:'src/ok.ts',line:1}]});
});
it('rejects a junction escaping the workspace', async () => {
  const outside = await fs.mkdtemp(path.join(os.tmpdir(),'devpilot-outside-'));
  try { await fs.symlink(outside,path.join(root,'link'),'junction'); await expect(new WorkspaceService(root).resolve('link/file',true)).rejects.toThrow('Symlinks'); }
  finally { await fs.rm(outside,{recursive:true,force:true}); }
});
