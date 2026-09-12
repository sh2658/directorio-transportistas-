const fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process');
execFileSync(process.execPath,['scripts/validate-data.cjs'],{stdio:'inherit'});
const target='.local/site';fs.rmSync(target,{recursive:true,force:true});fs.mkdirSync(target,{recursive:true});
// Strict publication allowlist: never publish source tables, Apps Script, tests or documentation.
for(const f of ['index.html','manifest.json','sw.js','assets','data'])fs.cpSync(f,path.join(target,f),{recursive:true});
fs.writeFileSync(path.join(target,'.nojekyll'),'');
console.log('Sitio construido: '+target);
