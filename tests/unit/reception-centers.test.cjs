const {test}=require('node:test'),assert=require('node:assert/strict');
const C=require('../../assets/js/core'),data=require('../../data/transportistas.json'),centers=require('../../data/centros-recepcion.json');
test('Anay can be found along with existing warehouse assignments without changing route data',()=>{
 const before=JSON.stringify(data),found=C.search(data.transportistas,'transportista',' Anáy '),ids=found.map(t=>t.id);
 for(const id of ['transp2','2665d6d7','TRP-0039','TRP-0059','c6e2dbc8'])assert.ok(ids.includes(id),id);
 assert.equal(new Set(ids).size,ids.length);assert.equal(JSON.stringify(data),before);
 assert.deepEqual(C.search(data.transportistas,'transportista','BODEGA ANAY').map(t=>t.id),ids);
 assert.equal(C.isReceptionCenter(found.find(t=>t.id==='transp2')),true);
});
test('shared GPS, phones or destinations cannot assign an unrelated operator to Anay',()=>{
 const hub=data.transportistas.find(t=>t.id==='transp2');
 const unrelated={id:'UNRELATED',nombre:'Otra empresa',destinos:[...hub.destinos],telefonos:hub.telefonos,bodegas:[{...hub.bodegas[0],direccion:'OTRO LOCAL',zona:'OTRA ZONA'}]};
 assert.deepEqual(C.search([hub,unrelated],'transportista','ANAY').map(t=>t.id),['transp2']);
 assert.deepEqual(C.search([hub,unrelated],'destino',hub.destinos[0]).map(t=>t.id),['transp2','UNRELATED']);
 assert.deepEqual(C.search([hub,unrelated],'transportista','Otra empresa').map(t=>t.id),['UNRELATED']);
});
test('flyer operators retain their announced status rather than inheriting center destinations',()=>{
 const anay=centers.centros.find(c=>c.id==='transp2');assert.equal(anay.operadoresAnunciados.length,18);
 assert.equal(anay.estado,'ANUNCIADOS_PENDIENTES_DE_VIGENCIA');assert.match(anay.fuente,/sin fecha visible/);
 assert.equal('destinos' in anay,false);assert.equal('telefonos' in anay,false);
});
