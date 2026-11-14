import {expect,it} from 'vitest';
import {assertWriteScope,explicitWriteScope,isTestInvocation} from '../src/security/TaskPolicy';
it('limits mutations to explicit file lists while permitting reads of other evidence',()=>{
  const scope=explicitWriteScope('Read src/add.ts and src/add.test.ts. Change only src/add.ts, then run tests.');
  expect([...scope!]).toEqual(['src/add.ts']);expect(()=>assertWriteScope('edit_file',{path:'src/add.test.ts'},scope)).toThrow('No change or approval');
  for(const tool of ['create_file','replace_text','apply_patch','delete_file']) expect(()=>assertWriteScope(tool,{path:'elsewhere.ts'},scope)).toThrow('explicit scope');
  expect(()=>assertWriteScope('read_file',{path:'src/add.test.ts'},scope)).not.toThrow();expect(()=>assertWriteScope('edit_file',{path:'src/add.ts'},scope)).not.toThrow();
});
it('handles quoted paths, relative prefixes and the latest explicit clause',()=>{
  expect([...explicitWriteScope('Modify only `src/my file.ts` and "src/other.ts". Then run npm test.')!]).toEqual(['src/my file.ts','src/other.ts']);
  expect([...explicitWriteScope('Change only a.ts and b.ts. Actually, edit only ./b.ts.')!]).toEqual(['b.ts']);
  expect([...explicitWriteScope('Change only a.ts, not a.test.ts.')!]).toEqual(['a.ts']);
  expect([...explicitWriteScope('Edit only a.ts and read b.test.ts.')!]).toEqual(['a.ts']);
  expect([...explicitWriteScope('Edit only `src/and then.ts` and `src/not.ts`.')!]).toEqual(['src/and then.ts','src/not.ts']);
  expect([...explicitWriteScope("Change only a.ts but don't edit b.ts.")!]).toEqual(['a.ts']);
  expect(()=>assertWriteScope('edit_file',{path:'elsewhere.ts'},explicitWriteScope('Change only src/**.'))).toThrow('literal file list');
  expect(explicitWriteScope('Fix the bug in relevant source files.')).toBeUndefined();expect(explicitWriteScope('Change only relevant code.')).toBeUndefined();
});
it('counts actual test command shapes and excludes build, lint and discovery-only invocations',()=>{
  for(const [exe,args] of [['npm',['test']],['npm',['run','test']],['python3',['-m','pytest','-q']],['cargo',['test']],['go',['test','./...']],['swift',['test']],['dotnet',['test','--no-build']]] as [string,string[]][]) expect(isTestInvocation(exe,args)).toBe(true);
  for(const [exe,args] of [['npm',['run','check']],['npm',['run','build','--','test']],['npm',['run','lint','--','test']],['npm',['test','--','--listTests']],['python',['-m','pytest','--collect-only']],['cargo',['test','--no-run']],['go',['test','-list','.']],['swift',['test','list']],['dotnet',['test','--list-tests']],['node',['--version']]] as [string,string[]][]) expect(isTestInvocation(exe,args)).toBe(false);
});
