/** Explicit quantized distributions of official DeepSeek checkpoints, verified 2026-11-13. */
export interface ModelProfile {
  id:string; name:string; model:string; downloadGB:number; minimumRAMGB:number;
  purpose:string; source:string; distribution:string; license:string;
}
export const deepseekProfiles:readonly ModelProfile[]=[
  {id:'deepseek-coder',name:'DeepSeek Coder 6.7B',model:'deepseek-coder:6.7b',downloadGB:3.8,minimumRAMGB:12,purpose:'Optional heavier coding model. The 16 GB Mac coding smoke was interrupted by a system hang; do not treat this model as validated on that machine.',source:'https://huggingface.co/deepseek-ai/deepseek-coder-6.7b-instruct',distribution:'https://ollama.com/library/deepseek-coder:6.7b',license:'DeepSeek model license'},
  {id:'deepseek-reasoning',name:'DeepSeek R1 8B',model:'deepseek-r1:8b',downloadGB:5.2,minimumRAMGB:16,purpose:'Optional heavier reasoning model, not performance-validated here. Avoid while diagnosing memory or responsiveness problems.',source:'https://huggingface.co/deepseek-ai/DeepSeek-R1-0528-Qwen3-8B',distribution:'https://ollama.com/library/deepseek-r1:8b',license:'MIT'},
  {id:'deepseek-small',name:'DeepSeek Coder 1.3B',model:'deepseek-coder:1.3b',downloadGB:0.8,minimumRAMGB:8,purpose:'Conservative starting point for 16 GB machines. Lower coding/planning capability; test on narrow tasks.',source:'https://huggingface.co/deepseek-ai/deepseek-coder-1.3b-instruct',distribution:'https://ollama.com/library/deepseek-coder:1.3b',license:'DeepSeek model license'},
];
export function modelProfile(id:string):ModelProfile {
  const profile=deepseekProfiles.find(item=>item.id===id);
  if(!profile) throw new Error('Choose a supported DeepSeek model from the setup panel.');
  return profile;
}
export function recommendedProfile(ramGB:number):ModelProfile {return modelProfile(ramGB>16?'deepseek-coder':'deepseek-small');}

export interface HardwareInfo {ramGB:number;platform:string;arch:string;homeFreeGB?:number}
