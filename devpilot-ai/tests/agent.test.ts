import { expect, it, vi } from 'vitest';
import { AgentService, decisionSchema } from '../src/services/AgentService';
import { OllamaService } from '../src/services/OllamaService';
import { toolCatalog, schemas } from '../src/tools/ToolSchemas';
import { validateCommand } from '../src/security/Commands';
const signal = () => new AbortController().signal;
it('runs read tool results into the next decision and produces a final summary',async () => {
  const ollama = new OllamaService('http://localhost:11434');
  const structured=vi.spyOn(ollama,'structured').mockResolvedValueOnce({action:'tool',name:'read_file',input:{path:'src/a.ts'}}).mockResolvedValueOnce({action:'final',summary:'Found src/a.ts.'});
  const execute=vi.fn().mockResolvedValue({content:'hello'});
  const result=await new AgentService(ollama,{catalog:()=>[],execute}).run('test','Explain src/a.ts','plan',4096,signal(),()=>{});
  expect(result).toContain('Found src/a.ts.'); expect(result).toContain('No passing test command'); expect(execute).toHaveBeenCalledWith('read_file',{path:'src/a.ts'},'plan',expect.any(AbortSignal));
  expect(JSON.stringify(structured.mock.calls[1])).toContain('hello');
});
it('stops repeated calls and never executes beyond the loop threshold',async () => {
  const ollama=new OllamaService('http://localhost:11434');vi.spyOn(ollama,'structured').mockResolvedValue({action:'tool',name:'list_files',input:{}});
  const execute=vi.fn().mockResolvedValue({files:[]});
  const result=await new AgentService(ollama,{catalog:()=>[],execute}).run('test','inspect','agent',4096,signal(),()=>{});
  expect(result).toContain('repeated tool loop for list_files');expect(result).toContain('task is incomplete');expect(result).toContain('Execution record');
  expect(execute).toHaveBeenCalledTimes(2);
});
it('stops immediately after user rejection, without model retries',async () => {
  const ollama=new OllamaService('http://localhost:11434');const call=vi.spyOn(ollama,'structured').mockResolvedValue({action:'tool',name:'edit_file',input:{}});
  const execute=vi.fn().mockResolvedValue({applied:false});
  expect(await new AgentService(ollama,{catalog:()=>[],execute}).run('test','edit','agent',4096,signal(),()=>{})).toContain('rejected');
  expect(call).toHaveBeenCalledTimes(1);
});
it('rejects malformed decisions and honors pre-cancellation',async () => {
  expect(()=>decisionSchema.parse({action:'shell',command:'format C:'})).toThrow();
  const ollama=new OllamaService('http://localhost:11434');const call=vi.spyOn(ollama,'structured');const controller=new AbortController();controller.abort();
  await expect(new AgentService(ollama,{catalog:()=>[],execute:vi.fn()}).run('test','inspect','plan',4096,controller.signal,()=>{})).rejects.toThrow();expect(call).not.toHaveBeenCalled();
});
it('enforces command allowlists and blocks destructive or injected commands',() => {
  for(const [exe,args] of [['powershell',['-Command','anything']],['npm',['run','deploy']],['git',['reset','--hard']],['node',['-e','process.exit()']],['npm',['test','&','format']],['python',['-c','print(1)']]] as [string,string[]][]) expect(()=>validateCommand(exe,args)).toThrow();
  for(const [exe,args] of [['npm',['test']],['npm',['run','build']],['git',['status']],['python',['-m','pytest']],['node',['--version']]] as [string,string[]][]) expect(()=>validateCommand(exe,args)).not.toThrow();
});
it('preserves follow-up context and workspace instructions without replacing the current task',async()=>{
  const ollama=new OllamaService('http://localhost:11434');
  const structured=vi.spyOn(ollama,'structured').mockResolvedValue({action:'final',summary:'Done'});
  await new AgentService(ollama,{catalog:()=>[],execute:vi.fn()}).run('test','Now fix it','agent',4096,signal(),()=>{},{history:[{role:'user',content:'The broken file is src/widget.ts'}],context:'AGENTS.md: use existing tests'});
  const prompt=JSON.stringify(structured.mock.calls[0][1]);
  expect(prompt).toContain('src/widget.ts');expect(prompt).toContain('use existing tests');expect(prompt).toContain('Current task: Now fix it');
});
it('honors a configured step budget and reports incomplete work honestly',async()=>{
  const ollama=new OllamaService('http://localhost:11434');let index=0;
  vi.spyOn(ollama,'structured').mockImplementation(async()=>({action:'tool',name:'read_file',input:{path:`${index++}.ts`}}));
  const execute=vi.fn().mockResolvedValue({content:'source'});
  const result=await new AgentService(ollama,{catalog:()=>[],execute}).run('test','inspect','agent',4096,signal(),()=>{},{maxSteps:4});
  expect(execute).toHaveBeenCalledTimes(4);expect(result).toContain('Stopped after 4 steps');expect(result).toContain('not been verified complete');
});
it('supports approved Mac and multi-language test commands without allowing shell execution',()=>{
  for(const [exe,args] of [['python3',['-m','pytest','tests','-q']],['cargo',['test']],['go',['test','./...']],['swift',['test']],['dotnet',['build']],['npm',['test','--','--run']]] as [string,string[]][]) expect(()=>validateCommand(exe,args)).not.toThrow();
  for(const [exe,args] of [['python3',['-c','anything']],['cargo',['publish']],['go',['run','malicious.go']],['sh',['-c','anything']],['npm',['test','--','x;echo']]] as [string,string[]][]) expect(()=>validateCommand(exe,args)).toThrow();
});

it('fits the full production tool catalog and context in the default model request',async()=>{
  const transport=vi.fn(async()=>new Response(JSON.stringify({message:{content:JSON.stringify({action:'final',summary:'Inspected'})},done:true})+'\n'));
  const ollama=new OllamaService('http://localhost:11434',transport);
  const result=await new AgentService(ollama,{catalog:toolCatalog,execute:vi.fn()}).run('test','Explain this message','agent',4096,signal(),()=>{},{context:'Guidance '.repeat(500),history:[{role:'user',content:'Prior '.repeat(400)}]});
  expect(result).toContain('Inspected');expect(transport).toHaveBeenCalledTimes(1);
});
it('repairs one malformed model decision and bounds repeated protocol failures',async()=>{
  const ollama=new OllamaService('http://localhost:11434');
  const call=vi.spyOn(ollama,'structured').mockResolvedValueOnce({action:'invalid'}).mockResolvedValueOnce({action:'final',summary:'Recovered'});
  expect(await new AgentService(ollama,{catalog:()=>[],execute:vi.fn()}).run('test','inspect','agent',4096,signal(),()=>{})).toContain('Recovered');
  expect(call).toHaveBeenCalledTimes(2);
  call.mockReset().mockResolvedValue({action:'invalid'});
  await expect(new AgentService(ollama,{catalog:()=>[],execute:vi.fn()}).run('test','inspect','agent',4096,signal(),()=>{})).rejects.toThrow();
  expect(call).toHaveBeenCalledTimes(2);
});
it('invalidates passing test evidence when another edit is applied afterwards',async()=>{
  const ollama=new OllamaService('http://localhost:11434');
  vi.spyOn(ollama,'structured').mockResolvedValueOnce({action:'tool',name:'run_tests',input:{runner:'npm'}}).mockResolvedValueOnce({action:'tool',name:'edit_file',input:{}}).mockResolvedValue({action:'final',summary:'Changed'});
  const execute=vi.fn().mockResolvedValueOnce({exitCode:0}).mockResolvedValueOnce({applied:true,file:'a.ts'});
  expect(await new AgentService(ollama,{catalog:()=>[],execute}).run('test','fix','agent',4096,signal(),()=>{})).toContain('No passing test command recorded since the latest file change');
});

it('rejects a listing-only architecture answer and requires cited file reads',async()=>{
  const ollama=new OllamaService('http://localhost:11434');
  const structured=vi.spyOn(ollama,'structured')
    .mockResolvedValueOnce({action:'tool',name:'list_files',input:{}})
    .mockResolvedValueOnce({action:'final',summary:'This is a Python SQLAlchemy backend.'})
    .mockResolvedValueOnce({action:'tool',name:'read_file',input:{path:'README.md'}})
    .mockResolvedValueOnce({action:'tool',name:'read_file',input:{path:'src/main.ts'}})
    .mockResolvedValueOnce({action:'final',summary:'Verified in `README.md` and `src/main.ts`: this is a TypeScript library.'});
  const execute=vi.fn().mockResolvedValueOnce({files:['README.md','src/main.ts']}).mockResolvedValueOnce({content:'TypeScript library'}).mockResolvedValueOnce({content:'export const hello = 42;'});
  const catalog=vi.fn(()=>[]);const progress=vi.fn();
  const result=await new AgentService(ollama,{catalog,execute}).run('test','Inspect this project and explain its architecture. Do not modify files or run commands.','agent',4096,signal(),progress);
  expect(catalog).toHaveBeenCalledWith('plan');expect(result).not.toContain('SQLAlchemy');expect(result).toContain('TypeScript library');expect(result).toContain('Files read: README.md, src/main.ts');
  expect(progress).toHaveBeenCalledWith(expect.stringContaining('withheld'));
  expect(execute.mock.calls.every(call=>call[2]==='plan')).toBe(true);
  expect(JSON.stringify(structured.mock.calls[2][1])).toContain('Final answer rejected by host');
});
it('withholds repeated speculative architecture answers rather than displaying them',async()=>{
  const ollama=new OllamaService('http://localhost:11434');
  const call=vi.spyOn(ollama,'structured').mockResolvedValue({action:'final',summary:'Unsupported database architecture.'});
  const result=await new AgentService(ollama,{catalog:()=>[],execute:vi.fn()}).run('test','Explain this project architecture','plan',4096,signal(),()=>{});
  expect(call).toHaveBeenCalledTimes(2);expect(result).toContain('Unable to produce a verified');expect(result).toContain('Files read: none');expect(result).not.toContain('Unsupported database');
});
it('does not count failed file reads as architecture evidence',async()=>{
  const ollama=new OllamaService('http://localhost:11434');
  vi.spyOn(ollama,'structured').mockResolvedValueOnce({action:'tool',name:'read_file',input:{path:'missing.ts'}}).mockResolvedValue({action:'final',summary:'Unsupported claim'});
  const result=await new AgentService(ollama,{catalog:()=>[],execute:vi.fn().mockRejectedValue(new Error('Missing'))}).run('test','Explain project architecture','plan',4096,signal(),()=>{});
  expect(result).toContain('Files read: none');expect(result).not.toContain('Unsupported claim');
});
it('requires source evidence when source paths exist in the listing',async()=>{
  const ollama=new OllamaService('http://localhost:11434');
  vi.spyOn(ollama,'structured').mockResolvedValueOnce({action:'tool',name:'list_files',input:{}}).mockResolvedValueOnce({action:'tool',name:'read_file',input:{path:'README.md'}}).mockResolvedValueOnce({action:'tool',name:'read_file',input:{path:'package.json'}}).mockResolvedValue({action:'final',summary:'README.md and package.json describe architecture.'});
  const execute=vi.fn().mockResolvedValueOnce({files:['README.md','package.json','src/main.ts']}).mockResolvedValueOnce({content:'docs'}).mockResolvedValueOnce({content:'{}'});
  const result=await new AgentService(ollama,{catalog:()=>[],execute}).run('test','Explain project architecture','plan',4096,signal(),()=>{});
  expect(result).toContain('Unable to produce a verified');expect(result).not.toContain('describe architecture');
});
it('constrains inspection decisions to listed unread files and then a final summary',async()=>{
  const ollama=new OllamaService('http://localhost:11434');
  const call=vi.spyOn(ollama,'structured').mockResolvedValueOnce({action:'tool',name:'list_files',input:{}}).mockResolvedValueOnce({action:'tool',name:'read_file',input:{path:'README.md'}}).mockResolvedValueOnce({action:'tool',name:'read_file',input:{path:'main.ts'}}).mockResolvedValueOnce({action:'final',summary:'README.md and main.ts describe the library.'});
  const execute=vi.fn().mockResolvedValueOnce({files:['README.md','main.ts']}).mockResolvedValueOnce({content:'Library docs'}).mockResolvedValueOnce({content:'export const hello = 42;'});
  await new AgentService(ollama,{catalog:toolCatalog,execute}).run('test','Inspect this project. Do not modify files.','agent',4096,signal(),()=>{});
  expect(JSON.stringify(call.mock.calls[0][4])).toContain('"const":"list_files"');
  const next=JSON.stringify(call.mock.calls[2][4]);
  expect(next).toContain('"enum":["main.ts"]');expect(next).not.toContain('README.md');
  const final=JSON.stringify(call.mock.calls[3][4]);expect(final).toContain('"const":"final"');expect(final).not.toContain('read_file');
});
it('rejects uncited summaries even after enough files were read',async()=>{
  const ollama=new OllamaService('http://localhost:11434');
  vi.spyOn(ollama,'structured').mockResolvedValueOnce({action:'tool',name:'read_file',input:{path:'README.md'}}).mockResolvedValueOnce({action:'tool',name:'read_file',input:{path:'main.ts'}}).mockResolvedValue({action:'final',summary:'An unsupported architecture description without file references.'});
  const result=await new AgentService(ollama,{catalog:()=>[],execute:vi.fn().mockResolvedValue({content:'source'})}).run('test','Explain project architecture','plan',4096,signal(),()=>{});
  expect(result).toContain('Unable to produce a verified');expect(result).not.toContain('unsupported architecture description');
});
it('keeps decoding grammars compact while retaining runtime argument limits',async()=>{
  const ollama=new OllamaService('http://localhost:11434');const call=vi.spyOn(ollama,'structured').mockResolvedValue({action:'final',summary:'Ready'});
  await new AgentService(ollama,{catalog:toolCatalog,execute:vi.fn()}).run('test','hello','agent',4096,signal(),()=>{});
  const format=JSON.stringify(call.mock.calls[0][4]);
  expect(format).not.toContain('maxLength');expect(format).not.toContain('131072');expect(format).toContain('additionalProperties');expect(format).toContain('replace_text');expect(schemas.edit_file.safeParse({path:'a.ts',hash:'a'.repeat(64),content:'a'.repeat(128*1024+1)}).success).toBe(false);
});
it('prioritizes a current README, matching manifest and entry point over archived READMEs',async()=>{
  const {inspectionTargets}=await import('../src/services/AgentService');
  const files=['docs/archive/README.md','docs/archive/ci/README.md','docs/archive/deployment/README.md','backend/README.md','backend/pyproject.toml','backend/requirements.txt','backend/app/main.py'];
  expect(inspectionTargets(files,'Inspect project architecture').files).toEqual(['backend/README.md','backend/pyproject.toml','backend/app/main.py']);
  expect(inspectionTargets(['src/main.ts','README.md','package.json',...files],'Inspect project architecture').files).toEqual(['README.md','package.json','src/main.ts']);
});
it('accepts a cited README/manifest explanation without requiring unrelated source reads',async()=>{
  const ollama=new OllamaService('http://localhost:11434');
  const call=vi.spyOn(ollama,'structured').mockResolvedValueOnce({action:'tool',name:'list_files',input:{}}).mockResolvedValueOnce({action:'tool',name:'read_file',input:{path:'backend/README.md'}}).mockResolvedValueOnce({action:'tool',name:'read_file',input:{path:'backend/pyproject.toml'}}).mockResolvedValueOnce({action:'final',summary:'`backend/README.md` documents a learning API; `backend/pyproject.toml` declares its dependencies. Implementation was not inspected.'});
  const execute=vi.fn().mockResolvedValueOnce({files:['backend/README.md','backend/pyproject.toml','backend/app/main.py','docs/archive/README.md']}).mockResolvedValueOnce({content:'Learning API'}).mockResolvedValueOnce({content:'[project]'});
  const result=await new AgentService(ollama,{catalog:toolCatalog,execute}).run('test','Read README.md and the main dependency manifest. Explain what this project does, citing those files. Do not modify files or run commands.','agent',4096,signal(),()=>{});
  expect(result).toContain('documents a learning API');expect(result).not.toContain('Unable to produce');expect(execute).toHaveBeenCalledTimes(3);
  expect(JSON.stringify(call.mock.calls[1][4])).toContain('"enum":["backend/README.md"]');
  expect(JSON.stringify(call.mock.calls[2][4])).toContain('"enum":["backend/pyproject.toml"]');
  expect(JSON.stringify(call.mock.calls[3][4])).not.toContain('read_file');
});
it('respects an explicitly requested archive path instead of hiding it',async()=>{
  const {inspectionTargets}=await import('../src/services/AgentService');
  expect(inspectionTargets(['docs/archive/README.md','README.md','package.json'],'Read docs/archive/README.md and the main dependency manifest').files).toContain('docs/archive/README.md');
});
it('retains both document excerpts when long later results evict earlier tool events',async()=>{
  const ollama=new OllamaService('http://localhost:11434');
  const call=vi.spyOn(ollama,'structured').mockResolvedValueOnce({action:'tool',name:'list_files',input:{}}).mockResolvedValueOnce({action:'tool',name:'read_file',input:{path:'README.md'}}).mockResolvedValueOnce({action:'tool',name:'read_file',input:{path:'package.json'}}).mockResolvedValueOnce({action:'final',summary:'README.md and package.json document the app.'});
  const execute=vi.fn().mockResolvedValueOnce({files:['README.md','package.json','src/main.ts']}).mockResolvedValueOnce({content:'UNIQUE_PROJECT_PURPOSE '+ 'x'.repeat(12000)}).mockResolvedValueOnce({content:'UNIQUE_MANIFEST_DETAILS '+ 'y'.repeat(12000)});
  await new AgentService(ollama,{catalog:toolCatalog,execute}).run('test','Read README.md and the dependency manifest. Explain this project. Do not modify files.','plan',4096,signal(),()=>{});
  const prompt=JSON.stringify(call.mock.calls[3][1]);expect(prompt).toContain('UNIQUE_PROJECT_PURPOSE');expect(prompt).toContain('UNIQUE_MANIFEST_DETAILS');
  expect(JSON.stringify(call.mock.calls[1][4])).not.toContain('startLine');
});

it('routes the reported entry-point prompt through guided source inspection',async()=>{
  const task='Find the application entry point. Read it and explain what runs at startup, citing the exact file path. Separate verified behavior from assumptions. Do not modify files or run commands.';
  const ollama=new OllamaService('http://localhost:11434');
  const call=vi.spyOn(ollama,'structured').mockResolvedValueOnce({action:'tool',name:'list_files',input:{}}).mockResolvedValueOnce({action:'tool',name:'read_file',input:{path:'pyproject.toml'}}).mockResolvedValueOnce({action:'tool',name:'read_file',input:{path:'backend/app/main.py'}}).mockResolvedValueOnce({action:'final',summary:'`pyproject.toml` declares the backend. `backend/app/main.py` constructs the app. Its deployment command was not verified.'});
  const execute=vi.fn().mockResolvedValueOnce({files:['README.md','pyproject.toml','backend/app/main.py','docs/archive/main.py']}).mockResolvedValueOnce({content:'[project]'}).mockResolvedValueOnce({content:'app = FastAPI()'});
  const result=await new AgentService(ollama,{catalog:toolCatalog,execute}).run('test',task,'agent',4096,signal(),()=>{});
  expect(result).toContain('constructs the app');expect(execute.mock.calls.every(call=>call[2]==='plan')).toBe(true);
  expect(JSON.stringify(call.mock.calls[0][4])).toContain('"const":"list_files"');
  expect(JSON.stringify(call.mock.calls[2][4])).toContain('"enum":["backend/app/main.py"]');
});
it('includes source evidence and the last tool failure when stopping a loop',async()=>{
  const ollama=new OllamaService('http://localhost:11434');
  vi.spyOn(ollama,'structured').mockResolvedValueOnce({action:'tool',name:'read_file',input:{path:'main.py'}}).mockResolvedValue({action:'tool',name:'search_symbols',input:{query:'startup'}});
  const execute=vi.fn().mockResolvedValueOnce({content:'app = create_app()'}).mockRejectedValue(new Error('Language provider unavailable'));
  const result=await new AgentService(ollama,{catalog:()=>[],execute}).run('test','Find a symbol','plan',4096,signal(),()=>{});
  expect(result).toContain('repeated tool loop for search_symbols');expect(result).toContain('Language provider unavailable');expect(result).toContain('Files read: main.py');expect(execute).toHaveBeenCalledTimes(3);
});
it('keeps candidate entry points current and includes startup config for multi-app repositories',async()=>{
  const {inspectionTargets}=await import('../src/services/AgentService');
  const selected=inspectionTargets(['pyproject.toml','docker-compose.yml','backend/app/main.py','frontend/src/main.tsx','tests/main.py','docs/archive/main.py'],'Find the application entry point and explain startup');
  expect(selected.entryPointOnly).toBe(true);expect(selected.files).toEqual(['pyproject.toml','docker-compose.yml','backend/app/main.py','frontend/src/main.tsx']);
});
it('withholds a zero-read explanation even outside the guided inspection classifier',async()=>{
  const ollama=new OllamaService('http://localhost:11434');
  vi.spyOn(ollama,'structured').mockResolvedValueOnce({action:'tool',name:'list_files',input:{}}).mockResolvedValue({action:'final',summary:'It initializes Flask and a database.'});
  const result=await new AgentService(ollama,{catalog:()=>[],execute:vi.fn().mockResolvedValue({files:['backend/app/main.py']})}).run('test','Describe how this component boots','plan',4096,signal(),()=>{});
  expect(result).not.toContain('initializes Flask');expect(result).toContain('Files read: none');expect(result).toContain('Unable to produce');
});
it('adds the host runtime version and build to execution records',async()=>{
  const ollama=new OllamaService('http://localhost:11434');vi.spyOn(ollama,'structured').mockResolvedValue({action:'final',summary:'Hello'});
  const result=await new AgentService(ollama,{catalog:()=>[],execute:vi.fn()}).run('test','hello','plan',4096,signal(),()=>{},{runtime:{version:'0.5.3',build:'abc123',mode:'development'}});
  expect(result).toContain('Runtime: DevPilot 0.5.3 · build abc123 · development');
});
it('never accepts the exact reported entry-point claim after only listing files',async()=>{
  const ollama=new OllamaService('http://localhost:11434');
  vi.spyOn(ollama,'structured').mockResolvedValueOnce({action:'tool',name:'list_files',input:{}}).mockResolvedValue({action:'final',summary:'The application entry point is backend/app/main.py. It initializes Flask and the database.'});
  const result=await new AgentService(ollama,{catalog:toolCatalog,execute:vi.fn().mockResolvedValue({files:['README.md','pyproject.toml','backend/app/main.py']})}).run('test','Find the application entry point. Read it and explain what runs at startup, citing the exact file path. Separate verified behavior from assumptions. Do not modify files or run commands.','plan',4096,signal(),()=>{});
  expect(result).not.toContain('initializes Flask');expect(result).toContain('Files read: none');expect(result).toContain('Unable to produce');
});
it('rejects an immediate file explanation with no listing or reads',async()=>{
  const ollama=new OllamaService('http://localhost:11434');vi.spyOn(ollama,'structured').mockResolvedValue({action:'final',summary:'backend/app/main.py starts Flask.'});
  const result=await new AgentService(ollama,{catalog:()=>[],execute:vi.fn()}).run('test','Read backend/app/main.py and explain it.','plan',4096,signal(),()=>{});
  expect(result).not.toContain('starts Flask');expect(result).toContain('Files read: none');
});
it('accepts one inspected source citation for a startup question after all target reads',async()=>{
  const ollama=new OllamaService('http://localhost:11434');
  vi.spyOn(ollama,'structured').mockResolvedValueOnce({action:'tool',name:'list_files',input:{}}).mockResolvedValueOnce({action:'tool',name:'read_file',input:{path:'pyproject.toml'}}).mockResolvedValueOnce({action:'tool',name:'read_file',input:{path:'docker-compose.prod.yml'}}).mockResolvedValueOnce({action:'tool',name:'read_file',input:{path:'backend/server.py'}}).mockResolvedValueOnce({action:'tool',name:'read_file',input:{path:'backend/app/main.py'}}).mockResolvedValueOnce({action:'final',summary:'Verified from `backend/app/main.py`: app = create_app() constructs the application. Database connection behavior was not verified.'});
  const execute=vi.fn().mockResolvedValueOnce({files:['pyproject.toml','docker-compose.prod.yml','backend/server.py','backend/app/main.py']}).mockResolvedValue({content:'app = create_app()'});
  const result=await new AgentService(ollama,{catalog:toolCatalog,execute}).run('test','Find the application entry point. Read it and explain startup. Do not modify files or run commands.','plan',4096,signal(),()=>{});
  expect(result).toContain('constructs the application');expect(result).not.toContain('Unable to produce');expect(result).toContain('Files read: pyproject.toml, docker-compose.prod.yml, backend/server.py, backend/app/main.py');
});
it('reports a missing source citation accurately and attempts only one correction',async()=>{
  const ollama=new OllamaService('http://localhost:11434');
  const call=vi.spyOn(ollama,'structured').mockResolvedValueOnce({action:'tool',name:'list_files',input:{}}).mockResolvedValueOnce({action:'tool',name:'read_file',input:{path:'pyproject.toml'}}).mockResolvedValueOnce({action:'tool',name:'read_file',input:{path:'main.py'}}).mockResolvedValue({action:'final',summary:'pyproject.toml declares a project; startup details unknown.'});
  const execute=vi.fn().mockResolvedValueOnce({files:['pyproject.toml','main.py']}).mockResolvedValue({content:'app = create_app()'});const progress=vi.fn();
  const result=await new AgentService(ollama,{catalog:toolCatalog,execute}).run('test','Find the entry point and explain startup. Do not modify files.','plan',4096,signal(),progress);
  expect(result).toContain('Files were read, but the answer must cite at least one inspected source file');expect(result).toContain('One correction was attempted');expect(result).not.toContain('without sufficient file reads');
  expect(call).toHaveBeenCalledTimes(5);expect(execute).toHaveBeenCalledTimes(3);
  expect(JSON.stringify(call.mock.calls[4][1])).toContain('Do not read files again');
});

it('requires execution when a fix request receives only a proposed plan',async()=>{
  const ollama=new OllamaService('http://localhost:11434');
  const call=vi.spyOn(ollama,'structured').mockResolvedValueOnce({action:'final',summary:'You should fix add.'}).mockResolvedValueOnce({action:'tool',name:'replace_text',input:{}}).mockResolvedValueOnce({action:'tool',name:'run_tests',input:{runner:'npm'}}).mockResolvedValueOnce({action:'final',summary:'Fixed and tested.'});
  const execute=vi.fn().mockResolvedValueOnce({applied:true,file:'calculator.cjs'}).mockResolvedValueOnce({exitCode:0});
  const result=await new AgentService(ollama,{catalog:toolCatalog,execute}).run('test','Fix the add function and run tests.','agent',4096,signal(),()=>{});
  expect(result).toContain('Fixed and tested');expect(result).toContain('Applied changes: calculator.cjs');expect(result).toContain('Approved test command exited 0');
  expect(JSON.stringify(call.mock.calls[1][4])).not.toContain('"const":"final"');
});
it('returns incomplete instead of accepting repeated implementation promises',async()=>{
  const ollama=new OllamaService('http://localhost:11434');const call=vi.spyOn(ollama,'structured').mockResolvedValue({action:'final',summary:'I will fix it.'});
  const result=await new AgentService(ollama,{catalog:toolCatalog,execute:vi.fn()}).run('test','Fix the bug.','agent',4096,signal(),()=>{});
  expect(result).toContain('Stopped: task incomplete');expect(result).toContain('No file changes applied');expect(result).not.toContain('I will fix it');expect(call).toHaveBeenCalledTimes(2);
});
it('permits a verified no-op without forcing an unnecessary edit',async()=>{
  const ollama=new OllamaService('http://localhost:11434');vi.spyOn(ollama,'structured').mockResolvedValueOnce({action:'tool',name:'run_tests',input:{runner:'npm'}}).mockResolvedValueOnce({action:'final',summary:'Requested behavior already passes.'});
  const execute=vi.fn().mockResolvedValue({exitCode:0});
  const result=await new AgentService(ollama,{catalog:toolCatalog,execute}).run('test','Fix the bug if it still exists.','agent',4096,signal(),()=>{});
  expect(result).toContain('already passes');expect(execute).toHaveBeenCalledTimes(1);
});
it('does not force a test or execute commands when the user prohibited them',async()=>{
  const ollama=new OllamaService('http://localhost:11434');vi.spyOn(ollama,'structured').mockResolvedValueOnce({action:'tool',name:'run_tests',input:{runner:'npm'}}).mockResolvedValueOnce({action:'tool',name:'replace_text',input:{}}).mockResolvedValueOnce({action:'final',summary:'Changed; tests were not run.'});
  const execute=vi.fn().mockResolvedValue({applied:true,file:'a.py'});
  const result=await new AgentService(ollama,{catalog:toolCatalog,execute}).run('test','Fix a.py. Do not run commands.','agent',4096,signal(),()=>{});
  expect(execute).toHaveBeenCalledTimes(1);expect(execute).toHaveBeenCalledWith('replace_text',{},'agent',expect.any(AbortSignal));expect(result).toContain('tests were not run');
});

it('prepares named source and test files before focused implementation and retains hashes across decisions',async()=>{
  const ollama=new OllamaService('http://localhost:11434');
  const call=vi.spyOn(ollama,'structured').mockResolvedValueOnce({action:'tool',name:'read_file',input:{path:'src/a.cjs'}}).mockResolvedValueOnce({action:'tool',name:'read_file',input:{path:'src/a.test.cjs'}}).mockResolvedValueOnce({action:'tool',name:'replace_text',input:{path:'src/a.cjs'}}).mockResolvedValueOnce({action:'tool',name:'run_tests',input:{runner:'npm'}}).mockResolvedValueOnce({action:'final',summary:'Fixed src/a.cjs with tests.'});
  const execute=vi.fn().mockResolvedValueOnce({content:'exports.a = 1;',hash:'a'.repeat(64)}).mockResolvedValueOnce({content:'test source',hash:'b'.repeat(64)}).mockResolvedValueOnce({applied:true,file:'src/a.cjs',hash:'c'.repeat(64)}).mockResolvedValueOnce({exitCode:0});
  const result=await new AgentService(ollama,{catalog:toolCatalog,execute}).run('test','Read src/a.cjs and src/a.test.cjs. Fix the bug, then run tests.','agent',4096,signal(),()=>{});
  expect(JSON.stringify(call.mock.calls[0][4])).toContain('"const":"src/a.cjs"');expect(JSON.stringify(call.mock.calls[1][4])).toContain('"const":"src/a.test.cjs"');
  expect(JSON.stringify(call.mock.calls[2][1])).toContain('a'.repeat(64));expect(JSON.stringify(call.mock.calls[3][1])).toContain('c'.repeat(64));
  const afterEdit=call.mock.calls[3][1][0].content.split('Retained inspected excerpts (bounded):')[1].split('Observed file hashes')[0];expect(afterEdit).not.toContain('exports.a = 1;');expect(result).toContain('Approved test command exited 0');
});
it('fits process tools within the low-memory request budget',async()=>{
  const transport=vi.fn(async()=>new Response(JSON.stringify({message:{content:JSON.stringify({action:'final',summary:'No process launched.'})},done:true})+'\n'));
  const result=await new AgentService(new OllamaService('http://localhost:11434',transport),{catalog:toolCatalog,execute:vi.fn()}).run('test','Check the dev server status','agent',4096,signal(),()=>{});
  expect(result).toContain('No process launched');expect(transport).toHaveBeenCalledOnce();
});

it('attempts one bounded alternative after repeated discovery on a prepared coding task',async()=>{
  const ollama=new OllamaService('http://localhost:11434');const call=vi.spyOn(ollama,'structured').mockResolvedValueOnce({action:'tool',name:'read_file',input:{path:'a.cjs'}}).mockResolvedValueOnce({action:'tool',name:'read_file',input:{path:'a.cjs'}}).mockResolvedValueOnce({action:'tool',name:'read_file',input:{path:'a.cjs'}}).mockResolvedValueOnce({action:'tool',name:'replace_text',input:{path:'a.cjs'}}).mockResolvedValueOnce({action:'tool',name:'run_tests',input:{runner:'npm'}}).mockResolvedValueOnce({action:'final',summary:'Fixed a.cjs with passing tests.'});
  const execute=vi.fn().mockResolvedValueOnce({content:'source',hash:'a'.repeat(64)}).mockResolvedValueOnce({content:'source',hash:'a'.repeat(64)}).mockResolvedValueOnce({applied:true,file:'a.cjs'}).mockResolvedValueOnce({exitCode:0});
  const progress=vi.fn();const result=await new AgentService(ollama,{catalog:toolCatalog,execute}).run('test','Read a.cjs and fix the bug.','agent',4096,signal(),progress);
  expect(execute).toHaveBeenCalledTimes(4);expect(result).toContain('Approved test command exited 0');
  expect(progress).toHaveBeenCalledWith('Recovering repeated tool: named files are already inspected');expect(JSON.stringify(call.mock.calls[3][4])).not.toContain('"const":"read_file"');
});

it('stages two inspected source proposals using host-held paths/hashes and verifies after both edits',async()=>{
  const ollama=new OllamaService('http://localhost:11434');const hash='a'.repeat(64);
  const decisions=[
    {action:'tool',name:'read_file',input:{path:'alpha.py'}},{action:'tool',name:'read_file',input:{path:'beta.py'}},{action:'tool',name:'read_file',input:{path:'tests/test_pair.py'}},
    {action:'tool',name:'run_tests',input:{runner:'pytest'}},{action:'edit',behavior:'correct alpha behavior',content:'correct alpha'},{action:'edit',behavior:'correct beta behavior',content:'correct beta'},
    {action:'tool',name:'run_tests',input:{runner:'pytest'}},{action:'final',summary:'Fixed alpha.py and beta.py; tests passed.'},
  ];
  const call=vi.spyOn(ollama,'structured');for(const decision of decisions) call.mockResolvedValueOnce(decision);
  const execute=vi.fn().mockResolvedValueOnce({content:'alpha source',hash}).mockResolvedValueOnce({content:'beta source',hash}).mockResolvedValueOnce({content:'test pair',hash})
    .mockResolvedValueOnce({exitCode:1,output:'both failing'}).mockResolvedValueOnce({applied:true,file:'alpha.py',hash:'b'.repeat(64)})
    .mockResolvedValueOnce({applied:true,file:'beta.py',hash:'c'.repeat(64)}).mockResolvedValueOnce({exitCode:0,output:'all passing'});
  const result=await new AgentService(ollama,{catalog:toolCatalog,execute}).run('fixture','Read alpha.py, beta.py and tests/test_pair.py. Fix both modules, then run pytest.','agent',4096,signal(),()=>{});
  expect(result).toContain('Approved test command exited 0');expect(execute).toHaveBeenCalledTimes(7);
  expect(execute).toHaveBeenNthCalledWith(5,'edit_file',{path:'alpha.py',content:'correct alpha',hash},'agent',expect.any(AbortSignal));expect(execute).toHaveBeenNthCalledWith(6,'edit_file',{path:'beta.py',content:'correct beta',hash},'agent',expect.any(AbortSignal));
  expect(JSON.stringify(call.mock.calls[4][1])).toContain('Current target: alpha.py');expect(JSON.stringify(call.mock.calls[5][1])).toContain('Current target: beta.py');
});
it('rejects a focused model decision targeting a different file before execution',async()=>{
  const ollama=new OllamaService('http://localhost:11434');const hash='a'.repeat(64);
  vi.spyOn(ollama,'structured').mockResolvedValueOnce({action:'tool',name:'read_file',input:{path:'alpha.py'}}).mockResolvedValueOnce({action:'tool',name:'read_file',input:{path:'beta.py'}}).mockResolvedValue({action:'edit',content:'bad',path:'unrelated.py'});
  const execute=vi.fn().mockResolvedValue({content:'source',hash});
  await expect(new AgentService(ollama,{catalog:toolCatalog,execute}).run('fixture','Read alpha.py and beta.py. Fix both. Do not run commands.','agent',4096,signal(),()=>{})).rejects.toThrow();expect(execute).toHaveBeenCalledTimes(2);
});

it('keeps multiple assertion failures while dropping stack noise from the focused prompt',async()=>{
  const {compactTestOutput}=await import('../src/services/AgentService');const stacks='    at fixture (/tmp/fixture.js:1:1)\n'.repeat(100);
  const compact=compactTestOutput('first failure: expected A\n'+stacks+'second failure: expected B\n'+stacks+'third failure: expected C');
  expect(compact).toContain('first failure');expect(compact).toContain('second failure');expect(compact).toContain('third failure');expect(compact).not.toContain('/tmp/fixture.js');expect(compact.length).toBeLessThan(3601);
});

it('refreshes current sources for one bounded repair pass after staged tests still fail',async()=>{
  const ollama=new OllamaService('http://localhost:11434');const hash='a'.repeat(64);const call=vi.spyOn(ollama,'structured');
  for(const result of [{action:'tool',name:'read_file',input:{path:'alpha.py'}},{action:'tool',name:'read_file',input:{path:'beta.py'}},{action:'tool',name:'run_tests',input:{runner:'pytest'}},
    {action:'edit',behavior:'first alpha fix',content:'alpha first'},{action:'edit',behavior:'beta fix',content:'beta fixed'},{action:'tool',name:'run_tests',input:{runner:'pytest'}},
    {action:'edit',behavior:'repair remaining alpha failure',content:'alpha fixed'},{action:'unchanged',reason:'beta already correct'},
    {action:'tool',name:'run_tests',input:{runner:'pytest'}},{action:'final',summary:'Fixed alpha.py and beta.py; pytest passed.'}]) call.mockResolvedValueOnce(result);
  const execute=vi.fn().mockResolvedValueOnce({content:'alpha original',hash}).mockResolvedValueOnce({content:'beta original',hash}).mockResolvedValueOnce({exitCode:1,output:'fail both'})
    .mockResolvedValueOnce({applied:true,file:'alpha.py',hash}).mockResolvedValueOnce({applied:true,file:'beta.py',hash}).mockResolvedValueOnce({exitCode:1,output:'alpha still fails'})
    .mockResolvedValueOnce({content:'alpha first',hash}).mockResolvedValueOnce({content:'beta fixed',hash})
    .mockResolvedValueOnce({applied:true,file:'alpha.py',hash}).mockResolvedValueOnce({exitCode:0,output:'all passed'});
  const result=await new AgentService(ollama,{catalog:toolCatalog,execute}).run('fixture','Read alpha.py and beta.py. Fix both, then run pytest.','agent',4096,signal(),()=>{});
  expect(result).toContain('Approved test command exited 0');expect(execute).toHaveBeenNthCalledWith(7,'read_file',{path:'alpha.py'},'agent',expect.any(AbortSignal));
  expect(JSON.stringify(call.mock.calls[6][1])).toContain('alpha first');expect(JSON.stringify(call.mock.calls[6][1])).toContain('alpha still fails');expect(execute).toHaveBeenCalledTimes(10);
});
