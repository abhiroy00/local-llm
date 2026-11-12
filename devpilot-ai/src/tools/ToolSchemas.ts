import { z } from 'zod';
const file = z.string().min(1).max(300);
const hash = z.string().regex(/^[a-f0-9]{64}$/);
export const schemas = {
  list_files:z.object({}).strict(), read_file:z.object({path:file}).strict(),
  search_code:z.object({query:z.string().min(1).max(200)}).strict(), search_files:z.object({query:z.string().min(1).max(200)}).strict(),
  create_file:z.object({path:file,content:z.string().max(128*1024)}).strict(),
  edit_file:z.object({path:file,content:z.string().max(128*1024),hash}).strict(),
  apply_patch:z.object({path:file,patch:z.string().max(128*1024),hash}).strict(),
  delete_file:z.object({path:file,hash}).strict(),
  run_terminal:z.object({executable:z.enum(['npm','node','python','git']),args:z.array(z.string().max(300)).max(20)}).strict(),
  run_tests:z.object({runner:z.enum(['npm','pytest'])}).strict(),
  git_status:z.object({}).strict(),git_diff:z.object({}).strict(), inspect_dependencies:z.object({}).strict(), get_workspace_info:z.object({}).strict(),
  search_symbols:z.object({query:z.string().min(1).max(100)}).strict(),
  search_semantic:z.object({query:z.string().min(1).max(300)}).strict(),
};
export type ToolName = keyof typeof schemas;
const changeResult=z.object({applied:z.boolean(),file:z.string().optional(),reason:z.string().optional(),hash:z.string().optional(),diff:z.string().optional()});
const commandResult=z.union([z.object({approved:z.literal(false)}),z.object({exitCode:z.number().nullable(),output:z.string().max(20000),truncated:z.boolean()})]);
const searchResult=z.object({matches:z.array(z.object({file:z.string(),line:z.number().optional(),text:z.string().optional()})).max(30),scanned:z.number(),truncated:z.boolean()});
export const outputSchemas = {
  list_files:z.object({files:z.array(z.string()).max(1500),truncated:z.boolean()}),
  read_file:z.object({path:z.string(),hash,content:z.string().max(12000),truncated:z.boolean()}),
  search_code:searchResult,search_files:searchResult,
  create_file:changeResult,edit_file:changeResult,apply_patch:changeResult,delete_file:changeResult,
  run_terminal:commandResult,run_tests:commandResult,git_status:commandResult,git_diff:commandResult,
  inspect_dependencies:z.object({manifests:z.record(z.string(),z.string())}),
  get_workspace_info:z.object({name:z.string().optional(),files:z.number(),truncated:z.boolean()}),
  search_symbols:z.object({symbols:z.array(z.object({name:z.string(),file:z.string(),line:z.number()})).max(30)}),
  search_semantic:z.object({matches:z.array(z.object({file:z.string(),score:z.number().finite()})).max(5),indexed:z.number(),note:z.string()}),
} satisfies Record<ToolName,z.ZodType>;
export const writeTools = new Set<ToolName>(['create_file','edit_file','apply_patch','delete_file','run_terminal','run_tests','git_status','git_diff']);
export const descriptions: Record<ToolName,string> = {
  list_files:'List at most 1500 allowed workspace paths.',read_file:'Read UTF-8 file and current hash (required before edits).',search_code:'Literal case-insensitive search with file/line matches.',search_files:'Search allowed paths by substring.',
  create_file:'Propose new file; requires user diff approval.',edit_file:'Propose complete replacement using current read hash; requires approval.',apply_patch:'Propose one-file unified diff using current hash; requires approval.',delete_file:'Propose deletion using current hash; requires approval.',run_terminal:'Run a restricted command after explicit approval.',run_tests:'Run npm test or python -m pytest after approval.',git_status:'Inspect Git status with approval.',git_diff:'Inspect Git diff with approval.',inspect_dependencies:'Read package.json, pyproject.toml or requirements.txt.',get_workspace_info:'Workspace name and bounded file counts.',search_symbols:'Search symbols using installed VS Code language providers.',search_semantic:'Semantic file retrieval if an installed embedding model is configured; otherwise use search_code.',
};
export function toolCatalog(mode:'plan'|'agent'):unknown {
  return Object.entries(schemas).filter(([name]) => mode === 'agent' || !writeTools.has(name as ToolName)).map(([name,schema]) => ({name,description:descriptions[name as ToolName],input:z.toJSONSchema(schema),output:{type:'object'},permission:writeTools.has(name as ToolName) ? 'explicit approval' : 'trusted workspace read'}));
}
