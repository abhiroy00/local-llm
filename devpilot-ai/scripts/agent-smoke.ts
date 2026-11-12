import { AgentService } from '../src/services/AgentService';
import { OllamaService } from '../src/services/OllamaService';
import { WorkspaceService } from '../src/services/WorkspaceService';
import { toolCatalog, schemas } from '../src/tools/ToolSchemas';
import { createHash } from 'node:crypto';
const workspace = new WorkspaceService(process.argv[2]);
const executed: string[] = [];
const agent = new AgentService(new OllamaService('http://localhost:11434'), {
  catalog:toolCatalog,
  execute:async (name,input,_mode,signal) => {
    const parsed=schemas[name].parse(input) as Record<string,string>;
    executed.push(name); console.log('TOOL',name);
    if(name==='list_files') return workspace.files(signal);
    if(name==='read_file') { const content=await workspace.read(parsed.path); return {path:parsed.path,content,hash:createHash('sha256').update(content).digest('hex')}; }
    if(name==='search_files'||name==='search_code') return workspace.search(parsed.query,name==='search_files',signal);
    if(name==='get_workspace_info') return {name:'fixture',fileCount:(await workspace.files(signal)).files.length};
    if(name==='inspect_dependencies') return {manifests:{}};
    return {error:'Unavailable in this smoke test'};
  }
});
(async()=>{
 const result=await agent.run('qwen2.5-coder:3b','Read fixture.ts using read_file, then explain what hello exports. Do not guess; inspect the file.','plan',4096,AbortSignal.timeout(180000),console.log);
 console.log('RESULT',result);
 if(!executed.includes('read_file')) throw new Error('Model did not inspect the file');
 if(!result.includes('42')) throw new Error('Model answer did not reflect fixture');
})().catch(error=>{console.error(error);process.exitCode=1;});
