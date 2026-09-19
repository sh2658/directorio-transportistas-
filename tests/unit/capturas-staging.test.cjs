const {test}=require('node:test'),assert=require('node:assert/strict');
const C=require('../../apps_script/AsignarCapturas_Mejorado.js');

function ctx(){
  return {
    transportistasPorId:new Map([['A',{id:'A',nombre:'EMPRESA A',horario:'L-V 8-5',observaciones:'ACTIVO',imagen:'foto.jpg'}]]),
    telefonosPorId:new Map([['A',new Set(['7152-9650'])]]),
    destinosPorId:new Map([['A',new Set(['cartago','turrialba'])]]),
    direccionesCache:[{fila:2,id:'D1',idTransporte:'A',direccion:'BODEGA CENTRAL',gps:'9.95,-84.09',zona:'TIBÁS'}]
  };
}

test('captura idéntica se clasifica sin cambios y puede quedar DUPLICADO',()=>{
  const captura={nombre:'EMPRESA A',horario:'L-V 8-5',observaciones:'ACTIVO',foto:'foto.jpg',telefonos:['7152-9650'],destinos:['CARTAGO','TURRIALBA'],alcance:'PARCIAL'};
  const r=C.compararCapturaConMaestro_('A',captura,{items:[]},ctx());
  assert.deepEqual(r.cambios,[]);assert.equal(r.requiereRevision,false);
});

test('captura parcial detecta solamente altas y cambios nuevos',()=>{
  const captura={nombre:'EMPRESA A',horario:'L-V 8-5',observaciones:'ACTIVO',foto:'foto.jpg',telefonos:['7152-9650','8888-9999'],destinos:['CARTAGO','TURRIALBA','CERVANTES'],alcance:'PARCIAL'};
  const r=C.compararCapturaConMaestro_('A',captura,{items:[]},ctx());
  assert.ok(r.cambios.some(x=>x.tipo==='TELEFONO'&&x.accion==='AGREGAR'));
  assert.ok(r.cambios.some(x=>x.tipo==='DESTINO'&&x.accion==='AGREGAR'));
  assert.equal(r.requiereRevision,false);
});

test('captura completa que omite datos existentes exige revisión y nunca autoriza bajas automáticas',()=>{
  const captura={nombre:'EMPRESA A',horario:'L-V 8-5',observaciones:'ACTIVO',foto:'foto.jpg',telefonos:[],destinos:['CARTAGO'],alcance:'COMPLETA'};
  const r=C.compararCapturaConMaestro_('A',captura,{items:[]},ctx());
  assert.equal(r.requiereRevision,true);
  assert.ok(r.cambios.some(x=>x.tipo==='BAJAS'&&x.accion==='REVISAR'));
});

test('último GPS/dirección del mismo ID se detecta como actualización sin mezclar otras entidades',()=>{
  const captura={nombre:'EMPRESA A',horario:'',observaciones:'',foto:'',telefonos:[],destinos:[],alcance:'ESPECIFICA'};
  const prep={items:[{bodega:'BODEGA CENTRAL NUEVA',gps:'9.9501,-84.09',zonaInfo:{zona:'TIBÁS'}}]};
  const r=C.compararCapturaConMaestro_('A',captura,prep,ctx());
  assert.ok(r.cambios.some(x=>x.tipo==='BODEGA_DIRECCION'));
  assert.ok(r.cambios.some(x=>x.tipo==='BODEGA_GPS'));
});

test('hash de captura es determinista y sensible a cambios',()=>{
  const a={nombre:'A',telefonos:['2222-2222'],destinos:['X'],bodegas:['Y'],gps:'9,-84',horario:'',foto:'',observaciones:'',idExplicito:'A',alcance:'PARCIAL'};
  const b={...a};assert.equal(C.hashCaptura_(a),C.hashCaptura_(b));b.destinos=['Z'];assert.notEqual(C.hashCaptura_(a),C.hashCaptura_(b));
});
