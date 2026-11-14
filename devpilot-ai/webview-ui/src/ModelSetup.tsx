import {X,Download,Check,ExternalLink} from 'lucide-react';
import {deepseekProfiles,recommendedProfile} from '../../src/models/ModelCatalog';
import type {HardwareInfo} from '../../src/models/ModelCatalog';
interface Props {
  inferenceProfile:'low-memory'|'balanced';models:string[];connected:boolean;busy:boolean;hardware?:HardwareInfo;
  download?:{profileId:string;status:string;percent?:number};
  post:(message:unknown)=>void;
}
export function ModelSetup({inferenceProfile,models,connected,busy,hardware,download,post}:Props) {
  const recommended=inferenceProfile==='low-memory'?'deepseek-small':recommendedProfile(hardware?.ramGB ?? 16).id;
  return <section className="model-setup" aria-label="DeepSeek model setup">
    <div className="setup-title"><strong>Free local DeepSeek models</strong><button aria-label="Close model setup" onClick={()=>post({type:'closeModelSetup'})}><X size={14}/></button></div>
    <p>Run DeepSeek weights locally through Ollama. No API key or per-token service fee. Downloads require internet; inference stays local.</p>
    {inferenceProfile==='low-memory' && <p>Low-memory mode is active: 4K maximum context, short outputs and bounded prompt batches. Larger DeepSeek profiles require an explicit Balanced setting; their inference is disabled here.</p>}
    {hardware && <p className="hardware">{hardware.platform==='darwin'?'Mac':hardware.platform==='win32'?'Windows':hardware.platform} · {hardware.arch} · {hardware.ramGB} GB RAM{hardware.homeFreeGB!==undefined?` · ${hardware.homeFreeGB} GB free on home drive`:''}</p>}
    {deepseekProfiles.map(profile=>{
      const installed=models.includes(profile.model);const lowMemory=hardware && hardware.ramGB<profile.minimumRAMGB;
      return <article className="model-card" key={profile.id}><div className="model-card-title"><strong>{profile.name}</strong>{recommended===profile.id && <span>Suggested</span>}</div><p>{profile.purpose}</p><small>~{profile.downloadGB} GB download · {profile.license}</small>{lowMemory && <p className="model-caution">Below the suggested {profile.minimumRAMGB} GB total RAM. Prefer the smaller option.</p>}<div className="model-card-actions"><button title="Official DeepSeek model card on Hugging Face" onClick={()=>post({type:'modelSource',profileId:profile.id})}><ExternalLink size={12}/> Hugging Face source</button><button className="primary" disabled={busy || !connected || (installed && inferenceProfile==='low-memory' && profile.minimumRAMGB>8)} onClick={()=>post(installed?{type:'selectModel',model:profile.model}:{type:'installModel',profileId:profile.id})}>{installed?<Check size={12}/>:<Download size={12}/>} {installed?'Use model':`Download ~${profile.downloadGB} GB`}</button></div>{download?.profileId===profile.id && <div className="download-status" role="status">{download.status}{download.percent!==undefined && <><progress aria-label="Current model layer download" value={download.percent} max={100}/><span>{download.percent}% of current layer</span></>}</div>}</article>;
    })}
    {!connected && <p className="model-caution">Start the Ollama app, then refresh the connection below.</p>}
    <p>Disk sizes are approximate. Runtime memory also includes context and the OS. Begin with 4K context and one loaded model; full-size DeepSeek checkpoints need substantially more memory. This downloads Ollama quantizations, not the full-precision Hugging Face checkpoints.</p>
    {busy && download && <button onClick={()=>post({type:'stop'})}>Stop download</button>}
  </section>;
}
