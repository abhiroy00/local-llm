import {validateCommand} from './Commands';

const fileTools=new Set(['create_file','edit_file','replace_text','apply_patch','delete_file']);
const scopeStopWords=new Set(['then','not',"don't",'don’t','dont','never','except','excluding','without','run','execute','report','verify','read','inspect','review','test']);
const normalize=(file:string)=>file.replace(/^\.\//,'');
/** Recognize literal file lists, not arbitrary natural-language directory/glob policies. */
export function explicitWriteScope(task:string):Set<string>|undefined {
  const clauses=[...task.matchAll(/\b(?:(?:change|edit|modify|update|touch|create|delete)\s+only|only\s+(?:change|edit|modify|update|touch|create|delete))\s+(.+?)(?=\.\s|[!?\n]|$)/gi)];
  const clause=clauses.at(-1)?.[1];
  if(!clause) return;
  const paths=new Set<string>();
  for(const match of clause.matchAll(/`([^`\n]+)`|"([^"\n]+)"|'([^'\n]+)'|([^\s,;()[\]`"]+)/g)) {
    if(match[4] && scopeStopWords.has(match[4].replace(/[.:]+$/,'').toLowerCase())) break;
    const value=normalize((match[1] ?? match[2] ?? match[3] ?? match[4]).replace(/[.:,;]+$/,''));
    if(value.length<=300 && !value.includes('\\') && !value.startsWith('/') && !value.split('/').includes('..') && !/[\*?<>|:\n\r]/.test(value) && /\.[\w-]+$/.test(value)) paths.add(value);
  }
  return paths.size?paths: /[/*?\\]/.test(clause)?new Set():undefined;
}
export function assertWriteScope(name:string,input:Record<string,unknown>,scope:Set<string>|undefined):void {
  if(!scope || !fileTools.has(name)) return;
  if(!scope.size) throw new Error('File change blocked: the explicit path/pattern scope could not be resolved to a literal file list. Name exact workspace-relative files before applying edits.');
  if(typeof input.path!=='string' || !scope.has(normalize(input.path))) throw new Error(`File change blocked by the task's explicit scope: ${String(input.path).slice(0,300)}. Allowed files: ${[...scope].join(', ')}. No change or approval was requested.`);
}
/** Test evidence comes from a recognized test invocation, not a matching word in arbitrary argv. */
export function isTestInvocation(executable:unknown,args:unknown):boolean {
  if(typeof executable!=='string' || !Array.isArray(args) || !args.every(arg=>typeof arg==='string')) return false;
  try {validateCommand(executable,args);} catch {return false;}
  const discovery=new Set(['--help','-h','--version','--collect-only','--collectonly','--co','--list','--listtests','--list-tests','--test-list-tests','--showconfig','--show-config','--no-run','--dry-run','-list']);
  if(args.some(arg=>discovery.has(arg.split('=')[0].toLowerCase()))) return false;
  if(executable==='npm') return args[0]==='test' || (args[0]==='run' && args[1]==='test');
  if(executable==='python' || executable==='python3') return args[0]==='-m' && args[1]==='pytest';
  if(['cargo','go','swift','dotnet'].includes(executable)) return args[0]==='test' && !(executable==='swift' && args[1]==='list');
  return false;
}
