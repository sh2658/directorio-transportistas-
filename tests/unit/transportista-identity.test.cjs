const {test}=require('node:test'),assert=require('node:assert/strict');
const {decidirIdentidadTransportista_,agregarNombreId_}=require('../../apps_script/AsignarCapturas_Mejorado.js');

function names(entries){
  const m=new Map();
  for(const [name,id] of entries) agregarNombreId_(m,name,id);
  return m;
}

test('explicit ID is the persistent identity even when no phone GPS or address evidence exists',()=>{
  const m=names([['EMPRESA A','A'],['EMPRESA B','B']]);
  assert.deepEqual(decidirIdentidadTransportista_('EMPRESA A','A',m,new Set(['A','B'])),{accion:'EXISTENTE',id:'A',origen:'ID_EXPLICITO'});
  assert.deepEqual(decidirIdentidadTransportista_('NOMBRE OCR NUEVO','A',m,new Set(['A','B'])),{accion:'EXISTENTE',id:'A',origen:'ID_EXPLICITO'});
});

test('an explicit ID is stopped only when the capture name exactly identifies another entity',()=>{
  const m=names([['EMPRESA A','A'],['EMPRESA B','B']]);
  const r=decidirIdentidadTransportista_('EMPRESA B','A',m,new Set(['A','B']));
  assert.equal(r.accion,'REVISAR');
  assert.match(r.mensaje,/OTRO ID/i);
});

test('without explicit ID an exact name is reused only when it belongs to one entity',()=>{
  const m=names([['EMPRESA A','A']]);
  assert.deepEqual(decidirIdentidadTransportista_('empresa a','',m,new Set(['A'])),{accion:'EXISTENTE',id:'A',origen:'NOMBRE_UNICO'});
});

test('same normalized name across independent IDs requires explicit selection instead of merging',()=>{
  const m=names([['EMPRESA COMPARTIDA','A'],['empresa compartida','B']]);
  const r=decidirIdentidadTransportista_('EMPRESA COMPARTIDA','',m,new Set(['A','B']));
  assert.equal(r.accion,'REVISAR');
  assert.match(r.mensaje,/SELECCIONE IDTRANSPORTE/i);
});

test('a new name creates a new entity; shared phone GPS or address are never identity inputs',()=>{
  const m=names([['EMPRESA A','A']]);
  assert.deepEqual(decidirIdentidadTransportista_('EMPRESA NUEVA','',m,new Set(['A'])),{accion:'CREAR'});
});
