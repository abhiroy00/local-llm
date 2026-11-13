export interface RedactionResult { text:string; count:number }

const credentialAssignment=/\b(api[_-]?key|client[_-]?secret|access[_-]?token|refresh[_-]?token|password|passwd|secret|token|private[_-]?key|authorization)\b(\s*[:=]\s*)(["'])([^"'\r\n]{8,})\3/gi;
const placeholders=/^(?:\$\{[^}]+\}|process\.env\.[A-Z0-9_]+|env\(['"][^'"]+['"]\)|<[^>]+>|(?:your|replace|change|example)[-_])/i;

export function redactSecrets(input:string):RedactionResult {
  let text=input,count=0;
  text=text.replace(credentialAssignment,(match,key:string,separator:string,quote:string,value:string) => {
    if(placeholders.test(value.trim())) return match;
    count++;
    return `${key}${separator}${quote}[REDACTED:${key.toLowerCase().replace(/[^a-z0-9]+/g,'_')}]${quote}`;
  });
  const patterns:[RegExp,string][]=[
    [/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g,'private_key'],
    [/\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g,'aws_key'],
    [/\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/g,'github_token'],
    [/\bsk-(?:proj-|svcacct-|ant-)?[A-Za-z0-9_-]{20,}\b/g,'api_key'],
    [/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{8,}\b/g,'jwt'],
    [/\bBearer\s+[A-Za-z0-9._~+/-]{16,}={0,2}/gi,'bearer_token'],
    [/\b[a-z][a-z0-9+.-]*:\/\/[^:/@\s]+:[^@/\s]{8,}@[^/\s]+/gi,'url_credential'],
  ];
  for(const [pattern,label] of patterns) text=text.replace(pattern,() => { count++; return `[REDACTED:${label}]`; });
  return {text,count};
}

export function containsSecrets(input:string):boolean {
  return redactSecrets(input).count>0;
}
