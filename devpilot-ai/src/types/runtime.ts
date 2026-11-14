export interface RuntimeInfo {version:string;build:string;mode:string}
declare const __DEVPILOT_BUILD__: {version:string;build:string};
export const runtimeBuild=typeof __DEVPILOT_BUILD__==='undefined'?{version:'unbundled',build:'test'}:__DEVPILOT_BUILD__;
