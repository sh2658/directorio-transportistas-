const fs=require('node:fs'),crypto=require('node:crypto'),C=require('../assets/js/core');
const file=process.argv[2]||'data/transportistas.json';
const data=C.validate(JSON.parse(fs.readFileSync(file,'utf8')));
if(!/^\d{4}-\d\d-\d\dT/.test(data.generatedAt)||!Number.isFinite(Date.parse(data.generatedAt)))throw Error('Fecha de exportación inválida');
const expected=crypto.createHash('sha256').update(JSON.stringify({schemaVersion:1,transportistas:data.transportistas})).digest('hex');
if(data.contentHash!==expected)throw Error('Huella de datos no coincide');
console.log(`Contrato válido: ${data.transportistas.length} transportistas; ${C.markers(data.transportistas).length} bodegas con GPS`);
