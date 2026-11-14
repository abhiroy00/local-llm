import { z } from 'zod';
const file = z.string().min(1).max(300);
const hash = z.string().regex(/^[a-f0-9]{64}$/);
export const schemas = {
  start_process:z.object({script:z.enum(['dev','start'])}).strict(),
  read_process:z.object({id:z.string().uuid()}).strict(),
  stop_process:z.object({id:z.string().uuid()}).strict(),
  list_files:z.object({}).strict(), read_file:z.object({path:file,startLine:z.number().int().min(1).optional(),endLine:z.number().int().min(1).optional()}).strict(),
  search_code:z.object({query:z.string().min(1).max(200)}).strict(), search_files:z.object({query:z.string().min(1).max(200)}).strict(),
  document_symbols:z.object({path:file}).strict(),
  find_references:z.object({path:file,line:z.number().int().min(1),column:z.number().int().min(1)}).strict(),
  go_to_definition:z.object({path:file,line:z.number().int().min(1),column:z.number().int().min(1)}).strict(),
  get_diagnostics:z.object({path:file.optional()}).strict(),
  replace_text:z.object({path:file,oldText:z.string().min(1).max(12000),newText:z.string().max(12000),hash}).strict(),
  update_plan:z.object({steps:z.array(z.object({title:z.string().min(1).max(200),status:z.enum(['pending','in_progress','completed'])}).strict()).min(1).max(20)}).strict(),
  create_file:z.object({path:file,content:z.string().max(128*1024)}).strict(),
  edit_file:z.object({path:file,content:z.string().max(128*1024),hash}).strict(),
  apply_patch:z.object({path:file,patch:z.string().max(128*1024),hash}).strict(),
  delete_file:z.object({path:file,hash}).strict(),
  run_terminal:z.object({executable:z.enum(['npm','node','python','python3','git','cargo','go','swift','dotnet']),args:z.array(z.string().max(300)).max(40)}).strict(),
  run_tests:z.object({runner:z.enum(['npm','pytest','python3','cargo','go','swift','dotnet'])}).strict(),
  git_status:z.object({}).strict(),git_diff:z.object({}).strict(), inspect_dependencies:z.object({}).strict(), get_workspace_info:z.object({}).strict(),
  search_symbols:z.object({query:z.string().min(1).max(100)}).strict(),
  search_semantic:z.object({query:z.string().min(1).max(300)}).strict(),
};
export type ToolName = keyof typeof schemas;
const changeResult=z.object({applied:z.boolean(),file:z.string().optional(),reason:z.string().optional(),hash:z.string().optional(),diff:z.string().optional()});
const commandResult=z.union([z.object({approved:z.literal(false)}),z.object({exitCode:z.number().nullable(),output:z.string().max(20000),truncated:z.boolean()})]);
const navigationResult=z.object({locations:z.array(z.object({file:z.string(),line:z.number(),column:z.number()})).max(30),truncated:z.boolean(),note:z.string()});
const searchResult=z.object({matches:z.array(z.object({file:z.string(),line:z.number().optional(),text:z.string().optional()})).max(30),scanned:z.number(),truncated:z.boolean()});
const jobResult=z.object({id:z.string(),script:z.string(),status:z.enum(['running','stopping','exited','stopped','failed']),exitCode:z.number().nullable(),startedAt:z.number(),output:z.string().max(20000),truncated:z.boolean()});
export const outputSchemas = {
  start_process:z.union([z.object({approved:z.literal(false)}),jobResult]),read_process:jobResult,stop_process:jobResult,
  list_files:z.object({files:z.array(z.string()).max(1500),truncated:z.boolean()}),
  read_file:z.object({path:z.string(),hash,content:z.string().max(12000),truncated:z.boolean(),startLine:z.number(),endLine:z.number(),totalLines:z.number()}),
  document_symbols:z.object({symbols:z.array(z.object({name:z.string(),kind:z.number(),line:z.number(),endLine:z.number()})).max(100),truncated:z.boolean(),note:z.string()}),
  find_references:navigationResult,go_to_definition:navigationResult,
  get_diagnostics:z.object({diagnostics:z.array(z.object({file:z.string(),line:z.number(),column:z.number(),severity:z.string(),message:z.string(),source:z.string().optional()})).max(100),truncated:z.boolean()}),
  replace_text:changeResult,
  update_plan:z.object({steps:schemas.update_plan.shape.steps}),
  search_code:searchResult,search_files:searchResult,
  create_file:changeResult,edit_file:changeResult,apply_patch:changeResult,delete_file:changeResult,
  run_terminal:commandResult,run_tests:commandResult,git_status:commandResult,git_diff:commandResult,
  inspect_dependencies:z.object({manifests:z.record(z.string(),z.string())}),
  get_workspace_info:z.object({name:z.string().optional(),files:z.number(),truncated:z.boolean()}),
  search_symbols:z.object({symbols:z.array(z.object({name:z.string(),file:z.string(),line:z.number()})).max(30)}),
  search_semantic:z.object({matches:z.array(z.object({file:z.string(),score:z.number().finite()})).max(5),indexed:z.number(),note:z.string()}),
} satisfies Record<ToolName,z.ZodType>;
export const writeTools = new Set<ToolName>(['start_process','stop_process','replace_text','create_file','edit_file','apply_patch','delete_file','run_terminal','run_tests','git_status','git_diff']);
export const descriptions: Record<ToolName,string> = {
  start_process:'Start npm run dev/start after script preview and approval. One process per workspace; bounded output, 10-minute lifetime.',read_process:'Read bounded output/status of an existing workspace process. Running does not imply the application is ready.',stop_process:'Stop a workspace process and its children.',
  list_files:'List at most 1500 allowed workspace paths.',read_file:'Read UTF-8 file and full-file hash. Optional 1-based startLine/endLine paginate long files; inspect truncated ranges before replacing a whole file.',search_code:'Literal case-insensitive search with file/line matches.',search_files:'Search allowed paths by substring.',
  document_symbols:'Inspect file functions, classes and symbol ranges using language providers.',
  find_references:'Find allowed workspace references at a 1-based line and column.',
  go_to_definition:'Find allowed workspace definitions at a 1-based line and column.',
  get_diagnostics:'Read current compiler/linter diagnostics from VS Code language extensions; may be empty if providers are not running.',
  replace_text:'Replace exactly one occurrence of oldText in a file using its current hash and diff approval. Prefer this for targeted edits.',
  update_plan:'Publish and update a short task checklist. Mark progress honestly; completed means verified.',
  create_file:'Propose new file; requires user diff approval.',edit_file:'Propose complete replacement using current read hash; requires approval.',apply_patch:'Propose one-file unified diff using current hash; requires approval.',delete_file:'Propose deletion using current hash; requires approval.',run_terminal:'Run a restricted command after explicit approval.',run_tests:'Run npm test or python -m pytest after approval.',git_status:'Inspect Git status with approval.',git_diff:'Inspect Git diff with approval.',inspect_dependencies:'Read package.json, pyproject.toml or requirements.txt.',get_workspace_info:'Workspace name and bounded file counts.',search_symbols:'Search symbols using installed VS Code language providers.',search_semantic:'Semantic file retrieval if an installed embedding model is configured; otherwise use search_code.',
};
// Runtime Zod validation keeps all constraints; omit repetitive metadata from model prompts.
function compactSchema(value:unknown):unknown {
  if(Array.isArray(value)) return value.map(compactSchema);
  if(value && typeof value==='object') return Object.fromEntries(Object.entries(value).filter(([key])=>!['$schema','additionalProperties','maximum','minimum','maxLength','minLength','maxItems','minItems','pattern'].includes(key)).map(([key,item])=>[key,compactSchema(item)]));
  return value;
}
export function toolCatalog(mode:'plan'|'agent'):unknown {
  return Object.entries(schemas).filter(([name]) => mode === 'agent' || !writeTools.has(name as ToolName)).map(([name,schema]) => ({name,description:descriptions[name as ToolName],input:compactSchema(z.toJSONSchema(schema))}));
}
