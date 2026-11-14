// Cross-platform wrapper: no POSIX-only environment assignment syntax.
process.env.DEVPILOT_AGENT_MODEL=process.argv[2] ?? 'deepseek-coder:1.3b';
if(process.argv.includes('--multi')) process.env.DEVPILOT_MULTIFILE='1';
if(process.argv.includes('--strings')) {process.env.DEVPILOT_CODING_CASE='strings';process.env.DEVPILOT_MULTIFILE='1';}
await import('./run-host-tests.mjs');
