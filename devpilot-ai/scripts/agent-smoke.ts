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
    console.log('DECISION',name,JSON.stringify(input).slice(0,200));
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
 const inspection=process.argv.includes('--inspection');
 const task=inspection ? 'Inspect this project and explain its architecture. Do not modify files or run commands.' : 'Read fixture.ts using read_file, then explain what hello exports. Do not guess; inspect the file.';
 const result=await agent.run(process.env.DEVPILOT_AGENT_MODEL ?? 'qwen2.5-coder:3b',task,'plan',4096,AbortSignal.timeout(180000),console.log);
 console.log('RESULT',result);
 if(!executed.includes('read_file')) throw new Error('Model did not inspect the file');
 if(inspection && (!result.includes('fixture.ts') || !/README.md|package.json/.test(result) || /Unable to produce a verified|Stopped after/.test(result))) throw new Error('Model did not complete an evidence-backed project inspection');
 if(!inspection && !result.includes('42')) throw new Error('Model answer did not reflect fixture');
})().catch(error=>{console.error(error);process.exitCode=1;});
