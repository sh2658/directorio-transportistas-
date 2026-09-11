/* Regression contract for the restored normalized database. Former global-function tests
 * referenced removed code and failed 10/10 at baseline ca2fe2a. Test public behavior instead. */
const {test}=require('node:test'),assert=require('node:assert/strict'),C=require('../assets/js/core');
test('exact destination precedes partial matches and never matches company name',()=>{
 const rows=[{id:'A',nombre:'MATINA EXPRESS',destinos:['LIBERIA']},{id:'B',nombre:'TOROS',destinos:['MATINA']},{id:'C',nombre:'OTRA',destinos:['MATINA CENTRO']}];
 assert.deepEqual(C.search(rows,'destino',' matína ').map(t=>t.id),['B']);assert.deepEqual(C.search(rows,'transportista','toros').map(t=>t.id),['B']);assert.deepEqual(C.search(rows,'destino',''),[]);
});
test('marker count is unique companies, not warehouse count',()=>{assert.equal(C.operatorCount([{carrierId:'A'},{carrierId:'A'},{carrierId:'B'}]),2);});
test('Haversine meters and invalid coordinate navigation',()=>{assert.ok(Math.abs(C.distance({lat:10,lng:-84},{lat:10.001,lng:-84})-0.111195)<0.00001);for(const lat of [null,'10',NaN,Infinity,0])assert.equal(C.validGPS({lat,lng:-84}),false);});
