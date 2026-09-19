const {test}=require('node:test'),assert=require('node:assert/strict');
const data=require('../../data/transportistas.json');

const CENTENO_IDS=['TRP-A8FFEDEA','TRP-0052'];
const FORBIDDEN=new Set([
  'AGUA BUENA','BIJAGUA','BUENOS AIRES','CABECERAS DE TILARAN','CABUYA','CANALETE',
  'COBANO','GUACIMAL','MAL PAÍS','MANZANILLO','MONTEVERDE','MONTEZUMA','PAQUERA',
  'POTRERO GRANDE','RIO NARANJO','SABALITO','SAN RAFAEL DE ABANGARES','SAN VITO',
  'SANTA ELENA','SANTA TERESA','SARDINAL DE PUNTARENAS','TAMBOR','UPALA CENTRO',
  'LUGARES ALEDAÑOS','LUGARES CERCANOS'
]);

test('Centeno public routes remain limited to the reviewed Cartago/Turrialba corridor',()=>{
  for(const id of CENTENO_IDS){
    const t=data.transportistas.find(x=>x.id===id);
    assert.ok(t,'Falta '+id);
    const bad=t.destinos.filter(d=>FORBIDDEN.has(d));
    assert.deepEqual(bad,[]);
    assert.ok(t.destinos.includes('TURRIALBA'));
    assert.ok(t.destinos.includes('SANTA CRUZ DE TURRIALBA'));
    assert.equal(t.destinos.includes('SANTA CRUZ'),false);
  }
});

test('Centeno is not contaminated with contact data from unrelated carriers',()=>{
  const t=data.transportistas.find(x=>x.id==='TRP-A8FFEDEA');
  assert.ok(t);
  assert.deepEqual(t.telefonos.map(p=>p.numero).sort(),['50622210338','50683403547','50689309711']);
  const contacts=t.telefonos.map(p=>p.contacto||'').join(' ');
  assert.doesNotMatch(contacts,/GOLFO EXPRESS|RODRIGUEZ SERRANO|TRANS SACO|UPALA EXPRESS/i);
});


test('Centeno y Centeno Junior permanecen como empresas separadas aunque compartan propietario, teléfonos o bodega',()=>{
  const centeno=data.transportistas.find(x=>x.id==='TRP-A8FFEDEA');
  const junior=data.transportistas.find(x=>x.id==='TRP-0052');
  assert.ok(centeno);
  assert.ok(junior);
  assert.notEqual(centeno.id,junior.id);
  assert.notEqual(centeno.nombre,junior.nombre);
  const shared=centeno.telefonos.map(p=>p.numero).filter(n=>junior.telefonos.some(p=>p.numero===n));
  assert.ok(shared.length>=1,'Pueden compartir teléfonos sin implicar fusión de identidad');
});
