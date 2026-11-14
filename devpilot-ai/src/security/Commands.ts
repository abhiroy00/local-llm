/** Commands are argument arrays, never model-authored shell strings. Approval is still mandatory. */
export const executables = ['npm','node','python','python3','git','cargo','go','swift','dotnet'] as const;
export function validateCommand(executable: string, args: string[]): void {
  if (!(executables as readonly string[]).includes(executable) || args.length > 40 || args.some(a => a.length > 300 || /[\r\n\0;&|<>`$%!^]/.test(a))) throw new Error('Unsupported command or unsafe shell characters.');
  const joined = args.join(' ');
  if (executable === 'git' && !((args[0] === 'status' && args.length === 1) || (args[0] === 'diff' && args.length === 1))) throw new Error('Only git status/diff are allowed.');
  if (executable === 'npm' && !(/^(test|run (test|build|lint|typecheck|check|dev|start))( --(?: [a-zA-Z0-9_./:=@+,-]+)*)?$/.test(joined))) throw new Error('Only npm test/build/lint/typecheck/check/dev/start scripts and test arguments are allowed.');
  if (executable === 'node' && joined !== '--version') throw new Error('Only node --version is allowed. Use approved npm scripts for tests.');
  if (['python','python3'].includes(executable) && !(joined === '--version' || (args[0] === '-m' && args[1] === 'pytest'))) throw new Error('Only Python --version or -m pytest is allowed.');
  const actions:Record<string,string[]> = {cargo:['build','test','check','clippy','fmt'],go:['build','test','vet'],swift:['build','test'],dotnet:['build','test','format']};
  if(actions[executable] && !actions[executable].includes(args[0])) throw new Error('Only build, test and quality commands are allowed for this toolchain.');
}
