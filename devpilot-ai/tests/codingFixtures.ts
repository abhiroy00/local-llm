/** Disposable acceptance data only; production agent code has no fixture-specific logic. */
export function codingFixture(multi:boolean,strings:boolean) {
  if(strings) return {
    sources:['labels.cjs','slug.cjs'],test:'strings.test.cjs',
    files:{
      'labels.cjs':"exports.normalizeLabel = value => String(value).toUpperCase();\n",
      'slug.cjs':"exports.slugify = value => value.trim().toLowerCase().replace(/\\s+/g, '_');\n",
      'strings.test.cjs':"const {test}=require('node:test');const assert=require('node:assert/strict');const {normalizeLabel}=require('./labels.cjs');const {slugify}=require('./slug.cjs');test('trim label',()=>assert.equal(normalizeLabel('  Ada  '),'Ada'));test('preserve label case',()=>assert.equal(normalizeLabel('eBay'),'eBay'));test('slug separator',()=>assert.equal(slugify('Hello World'),'hello-world'));test('slug whitespace',()=>assert.equal(slugify('  Deep   Space  '),'deep-space'));\n",
      'package.json':JSON.stringify({private:true,scripts:{test:'node --test strings.test.cjs'}}),
    },
    task:'Read labels.cjs, slug.cjs and strings.test.cjs. Run npm tests. Fix normalizeLabel and slugify so all tests pass. Change only labels.cjs and slug.cjs. Then run npm tests again and report the actual results.',
  };
  return {
    sources:multi?['calculator.cjs','multiply.cjs']:['calculator.cjs'],test:'calculator.test.cjs',
    files:{
      'calculator.cjs':'exports.add = (a, b) => a - b;\n',
      ...(multi?{'multiply.cjs':'exports.multiply = (a,b) => a + b;\n'}:{}),
      'calculator.test.cjs':"const {test}=require('node:test');const assert=require('node:assert/strict');const {add}=require('./calculator.cjs');test('adds two numbers',()=>assert.equal(add(2,3),5));test('handles negative numbers',()=>assert.equal(add(-2,3),1));"+(multi?"const {multiply}=require('./multiply.cjs');test('multiplies numbers',()=>assert.equal(multiply(2,3),6));test('multiplies negatives',()=>assert.equal(multiply(-2,3),-6));":''),
      'package.json':JSON.stringify({private:true,scripts:{test:'node --test calculator.test.cjs'}}),
    },
    task:multi?'Read calculator.cjs, multiply.cjs and calculator.test.cjs. Run npm tests to inspect the failures. Fix add and multiply with replace_text. Change only calculator.cjs and multiply.cjs. Run npm tests again and report actual results.':'Read calculator.cjs and calculator.test.cjs using read_file. Fix the add function so both tests pass. Change only calculator.cjs using replace_text, preserving the rest of the file. Do not create files. Then run npm test using run_tests with runner npm. Report actual results.',
  };
}
