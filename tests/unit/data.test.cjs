const {test}=require('node:test'),assert=require('node:assert/strict'),D=require('../../apps_script/RutasCR_Data'),C=require('../../assets/js/core');
const source=()=>({
 TRANSPORTISTA:[['IDTRANSPORTE','TRANSPORTE','HORARIO','IMAGEN','OBSERVACIONES'],['A','EMPRESA A','L-V','private/photo.jpg','INTERNAL'],['B','EMPRESA B','L-S','','']],
 LUGARES:[['IDLUGARES','LUGAR'],['L1','MATINA'],['L2','LIBERIA']],
 VISITA:[['IDVISITA','IDTRANSPORTE','IDLUGARES'],['V1','A','L1'],['V2','B','L2']],
 DIRECCION:[['IDDDIREECION','IDTRANSPORTE','DIRECCION','GPS','ZONA'],['D1','A','LOCAL 1','10,-84','TIBÁS'],['D2','B','LOCAL 2','10,-84','TIBÁS']],
 TELEFONOS:[['IDTELEFONO','IDTRANSPORTE','TELEFONO','CONTACTO'],['T1','A','7152-9650','WHATSAPP'],['T2','B','507 67815279','PANAMÁ']]
});
module.exports={source};
test('join by exact ID preserves operator isolation at identical coordinates',()=>{const s=source(),before=JSON.stringify(s),out=D.build(s);C.validate(out);assert.equal(JSON.stringify(s),before);assert.deepEqual(out.transportistas.map(t=>t.destinos),[['MATINA'],['LIBERIA']]);assert.equal(C.operatorCount(C.markers(out.transportistas)),2);assert.ok(!JSON.stringify(out.transportistas).includes('INTERNAL'));assert.equal(out.transportistas[0].imagen,'');});
test('column reordering preserves exact schema',()=>{const s=source();s.TRANSPORTISTA=s.TRANSPORTISTA.map(r=>[r[1],r[0],...r.slice(2)]);assert.equal(D.build(s).transportistas[0].nombre,'EMPRESA A');});
test('missing schema, empty export, duplicate IDs and orphan refs stop export',()=>{
 for(const mutate of [s=>delete s.LUGARES,s=>s.TRANSPORTISTA[0][1]='NOMBRE',s=>s.TRANSPORTISTA.splice(1),s=>s.TRANSPORTISTA.push(s.TRANSPORTISTA[1]),s=>s.VISITA[1][1]='X',s=>s.VISITA[1][2]='BAD']){const s=source();mutate(s);assert.throws(()=>D.build(s));}
});
test('repeated names are flagged, never silently mix data',()=>{const s=source();s.TRANSPORTISTA[2][1]='empresa a';const out=D.build(s);assert.equal(out.transportistas.length,2);assert.ok(out.diagnostics.some(x=>x.code==='REPEATED_NAME'));});
test('phones keep country code and dedupe per carrier',()=>{const s=source();s.TELEFONOS.push(['T3','A','+506 71529650','VENTAS']);const out=D.build(s);assert.equal(out.transportistas[0].telefonos.length,1);assert.equal(out.transportistas[1].telefonos[0].numero,'50767815279');assert.equal(D.phone('ABC71529650'),'');});
test('GPS rejects mixed decimal separators, strings with suffix and out of country; missing GPS retains address',()=>{for(const x of ['', '0,0','10,2,-84,1','10,-84 garbage','91,-84','true,-84'])assert.equal(D.gps(x),null);const s=source();s.DIRECCION[1][3]='';const out=D.build(s);assert.equal(out.transportistas[0].bodegas[0].direccion,'LOCAL 1');assert.equal(C.markers(out.transportistas).length,1);});
test('same IDs and ordering produce deterministic payload; normalization never alters IDs',()=>{const s=source(),a=D.build(s);s.TRANSPORTISTA=[s.TRANSPORTISTA[0],...s.TRANSPORTISTA.slice(1).reverse()];assert.deepEqual(D.build(s).transportistas,a.transportistas);});
test('frontend rejects legacy array, errors, duplicate IDs and malformed children',()=>{for(const bad of [[],{error:true},{schemaVersion:2,transportistas:[]}])assert.throws(()=>C.validate(bad));const d=D.build(source());d.transportistas.push(d.transportistas[0]);assert.throws(()=>C.validate(d));});

test('warehouses without a reviewed zone stay diagnostic and are not published',()=>{const s=source();s.DIRECCION.push(['D3','A','FRAGMENTO DE DIRECCIÓN','10,-84','']);const out=D.build(s);assert.equal(out.transportistas[0].bodegas.length,1);assert.ok(out.diagnostics.some(x=>x.code==='MISSING_ZONE'&&x.id==='D3'));});
