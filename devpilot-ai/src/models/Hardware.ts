import {totalmem,homedir,platform,arch} from 'node:os';
import {statfs} from 'node:fs/promises';
import type {HardwareInfo} from './ModelCatalog';
export async function hardwareInfo():Promise<HardwareInfo> {
  const info:HardwareInfo={ramGB:Math.round(totalmem()/1024**3),platform:platform(),arch:arch()};
  try {const disk=await statfs(homedir());info.homeFreeGB=Math.floor(disk.bavail*disk.bsize/1024**3);} catch { /* not supported on every filesystem; do not block setup */ }
  return info;
}
