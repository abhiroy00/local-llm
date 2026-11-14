import path from 'node:path';
import {validateCommand} from '../security/Commands';
/** Keep cmd.exe limited to validated npm tokens; all other toolchains spawn without a shell. */
export function processSpec(executable:string,args:string[],platform:NodeJS.Platform=process.platform,environment:Record<string,string|undefined>=process.env):{executable:string;args:string[];detached:boolean} {
  validateCommand(executable,args);
  if(platform==='win32' && executable==='npm') return {executable:environment.ComSpec ?? path.win32.join(environment.SystemRoot ?? 'C:\\Windows','System32','cmd.exe'),args:['/d','/s','/c',`npm ${args.join(' ')}`],detached:false};
  const actualArgs=executable==='git' ? ['-c','core.fsmonitor=false','-c','status.relativePaths=true','--no-pager',...(args[0]==='diff'?['diff','--relative','--no-ext-diff','--no-textconv']:['status','--short','--untracked-files=all','--','.'])] : [...args];
  return {executable,args:actualArgs,detached:platform!=='win32'};
}
