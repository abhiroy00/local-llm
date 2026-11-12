export function validateCommand(executable: string, args: string[]): void {
  if (!['npm','node','python','git'].includes(executable) || args.length > 20 || args.some(a => a.length > 300 || /[\r\n\0;&|<>`$%!^]/.test(a))) throw new Error('Unsupported command or unsafe shell characters.');
  const joined = args.join(' ');
  if (executable === 'git' && !((args[0] === 'status' && args.length === 1) || (args[0] === 'diff' && args.length === 1))) throw new Error('Only git status/diff are allowed.');
  if (executable === 'npm' && !(/^(test|run (test|build|lint|typecheck|check))$/.test(joined))) throw new Error('Only npm test/build/lint/typecheck/check scripts are allowed.');
  if (executable === 'node' && joined !== '--version') throw new Error('Only node --version is allowed. Use approved npm scripts for tests.');
  if (executable === 'python' && !['--version','-m pytest'].includes(joined)) throw new Error('Only python --version or -m pytest is allowed.');
}
