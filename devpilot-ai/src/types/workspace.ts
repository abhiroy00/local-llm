export interface CheckpointSummary {id:string;title:string;createdAt:number;files:string[];records:number;canRevert:boolean}
export interface JobSummary {id:string;script:string;status:'running'|'stopping'|'exited'|'stopped'|'failed';exitCode:number|null;startedAt:number;output:string;truncated:boolean}
