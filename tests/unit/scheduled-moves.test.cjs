const {test}=require('node:test'),assert=require('node:assert/strict');
const M=require('../../assets/js/scheduled-moves'),C=require('../../assets/js/core');
const raw=require('../../data/transportistas.json'),plan=require('../../data/traslados-programados.json');
const before='2027-01-11T05:59:59.999Z',at='2027-01-11T06:00:00.000Z';
test('all four branches change exactly at midnight Costa Rica, preserving original IDs',()=>{
 const original=JSON.stringify(raw),early=M.apply(raw.transportistas,plan,before),active=M.apply(raw.transportistas,plan,at);
 for(const target of plan.changes[0].targets){
  const e=early.find(t=>t.id===target.carrierId),a=active.find(t=>t.id===target.carrierId),eb=e.bodegas.find(b=>b.id===target.warehouseId),ab=a.bodegas.find(b=>b.id===target.warehouseId);
  assert.equal(e.traslado.active,false);assert.equal(a.traslado.active,true);
  assert.notEqual(eb.lat,9.938538);assert.equal(ab.lat,9.938538);assert.equal(ab.lng,-84.088788);assert.equal(ab.zona,'BARRIO MÉXICO');assert.equal(a.bodegas[0].id,target.warehouseId);
 }
 assert.equal(JSON.stringify(raw),original);C.validate({schemaVersion:1,transportistas:early});C.validate({schemaVersion:1,transportistas:active});
});
test('other warehouses, companies, phones and destinations remain independent',()=>{
 const projected=M.apply(raw.transportistas,plan,at),targets=new Map(plan.changes[0].targets.map(t=>[t.carrierId,t.warehouseId]));
 for(const old of raw.transportistas){const t=projected.find(t=>t.id===old.id);if(!targets.has(old.id)){assert.deepEqual(t,old);continue;}
  assert.deepEqual(t.telefonos,old.telefonos);assert.deepEqual(t.destinos,old.destinos);
  assert.deepEqual(t.bodegas.filter(b=>b.id!==targets.get(old.id)),old.bodegas.filter(b=>b.id!==targets.get(old.id)));
 }
});
test('Fallas y Vega receives one stable profile without invented phones or destinations',()=>{
 const projected=M.apply(raw.transportistas,plan,before),t=projected.find(t=>t.id==='TRP-FALLAS-VEGA');assert.ok(t);assert.deepEqual(t.telefonos,[]);assert.deepEqual(t.destinos,[]);
 const again=M.apply(projected,plan,at);assert.equal(again.filter(t=>t.id==='TRP-FALLAS-VEGA').length,1);assert.equal(again.find(t=>t.id==='TRP-FALLAS-VEGA').bodegas.length,1);
});
test('clock offsets give the same effective instant and invalid plans fail closed',()=>{
 assert.equal(M.apply(raw.transportistas,plan,'2027-01-11T00:00:00-06:00').find(t=>t.id==='51b25c54').traslado.active,true);
 for(const edit of [p=>p.changes[0].effectiveAt='2027-01-11',p=>p.changes[0].destination.lat=0,p=>p.changes[0].targets[0].warehouseId='UNKNOWN',p=>p.changes[0].targets.push(p.changes[0].targets[0])]){const p=structuredClone(plan);edit(p);assert.throws(()=>M.apply(raw.transportistas,p,at));}
});
test('markers and navigation get the new coordinate only from the effective date',()=>{
 const early=M.apply(raw.transportistas,plan,before),active=M.apply(raw.transportistas,plan,at);
 for(const target of plan.changes[0].targets){const newPin=C.markers(active).find(p=>p.carrierId===target.carrierId&&p.bodega.id===target.warehouseId);assert.equal(newPin.bodega.lat,9.938538);assert.equal(newPin.bodega.lng,-84.088788);assert.equal(C.markers(early).some(p=>p.carrierId===target.carrierId&&p.bodega.lat===9.938538),false);}
});
