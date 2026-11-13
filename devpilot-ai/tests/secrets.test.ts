import { expect, it } from 'vitest';
import { containsSecrets, redactSecrets } from '../src/security/SecretRedactor';

it('redacts credential assignments and common token formats',()=>{
  const credentials='password="correct horse battery staple"; token=ghp_'+'a'.repeat(36);
  const result=redactSecrets(credentials);
  expect(result.count).toBe(2);
  expect(result.text).not.toContain('correct horse battery staple');
  expect(result.text).not.toContain('ghp_');
  expect(result.text).toContain('[REDACTED:password]');
  expect(containsSecrets('Authorization: Bearer '+'b'.repeat(24))).toBe(true);
});

it('redacts private key blocks without altering environment references',()=>{
  const key='-----BEGIN PRIVATE KEY-----\nfixture-key-material\n-----END PRIVATE KEY-----';
  const result=redactSecrets(`key=${key}\npassword="process.env.DATABASE_PASSWORD"`);
  expect(result.text).not.toContain('fixture-key-material');
  expect(result.text).toContain('process.env.DATABASE_PASSWORD');
  expect(result.count).toBe(1);
});

it('leaves ordinary source text unchanged',()=>{
  const text='const token = process.env.API_TOKEN;\nconst password = "replace-me";';
  expect(redactSecrets(text)).toEqual({text,count:0});
});
