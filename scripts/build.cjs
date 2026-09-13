const fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process');
execFileSync(process.execPath,['scripts/validate-data.cjs'],{stdio:'inherit'});
const target='.local/site';fs.rmSync(target,{recursive:true,force:true});fs.mkdirSync(target,{recursive:true});
// Strict publication allowlist: never publish source tables, Apps Script, tests or documentation.
for(const f of ['index.html','manifest.json','sw.js','assets','data'])fs.cpSync(f,path.join(target,f),{recursive:true});
const territorial=JSON.parse(fs.readFileSync('docs/homonimos_oficiales_cr.json','utf8'));
if(!Array.isArray(territorial)||!territorial.length)throw Error('Referencia territorial de homónimos vacía');
const homonimos={};
for(const item of territorial){
  if(!item||typeof item.norm!=='string'||!Array.isArray(item.ubicaciones)||item.ubicaciones.length<2)throw Error('Referencia territorial de homónimos inválida');
  homonimos[item.norm]=item.ubicaciones.map(place=>[place.canton,place.provincia]);
}
fs.writeFileSync(path.join(target,'assets/homonimos_dta_cr.json'),JSON.stringify(homonimos));
fs.writeFileSync(path.join(target,'.nojekyll'),'');
console.log('Sitio construido: '+target+' · '+Object.keys(homonimos).length+' homónimos territoriales');
