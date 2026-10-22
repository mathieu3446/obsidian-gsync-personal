import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const mock=fileURLToPath(new URL('./obsidian.mjs',import.meta.url));
await build({entryPoints:['tests/suite.ts'],outfile:'tests/generated.cjs',bundle:true,platform:'node',format:'cjs',plugins:[{name:'mock-obsidian',setup(b){b.onResolve({filter:/^obsidian$/},()=>({path:mock}));}}]});
const r=spawnSync(process.execPath,['--test','tests/generated.cjs'],{stdio:'inherit'});
process.exit(r.status ?? 1);
