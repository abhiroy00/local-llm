import {OllamaService} from '../src/services/OllamaService';
import {modelProfile,recommendedProfile} from '../src/models/ModelCatalog';
import {hardwareInfo} from '../src/models/Hardware';
(async()=>{
  const hardware=await hardwareInfo();const profile=modelProfile(process.argv[2] ?? recommendedProfile(hardware.ramGB).id);
  console.log(`${profile.name}: ~${profile.downloadGB} GB download. Official source: ${profile.source}`);
  const service=new OllamaService(process.env.DEVPILOT_OLLAMA_ENDPOINT ?? 'http://localhost:11434');
  if((await service.models()).includes(profile.model)) {console.log('Already installed: '+profile.model);return;}
  let last=0;
  await service.pull(profile.id,AbortSignal.timeout(30*60*1000),event=>{if(Date.now()-last>5000 || event.status==='success') {last=Date.now();console.log(event.status+(event.total ? ` ${Math.floor((event.completed ?? 0)/event.total*100)}% of current layer` : ''));}});
  if(!(await service.models()).includes(profile.model)) throw new Error('Download finished but model not listed. Refresh Ollama.');
  console.log('Installed: '+profile.model);
})().catch(error=>{console.error(error instanceof Error?error.message:error);process.exitCode=1;});
