// Ejecutar: node --test tests/deduplicacion.test.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
const resultados = { innerHTML: '', addEventListener() {} };
const context = vm.createContext({
  console, URL, navigator: {}, dataLayer: [],
  fetch() { return new Promise(() => {}); },
  window: { addEventListener() {}, location: { href: 'https://example.test/' } },
  document: { addEventListener() {}, getElementById() { return resultados; } },
  setTimeout() {}, clearTimeout() {}
});
for (const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) {
  new vm.Script(match[1]).runInContext(context);
}
const plain = value => JSON.parse(JSON.stringify(value));
const clean = data => plain(context.sanitizarDatos(data));
const bodega = (metros, extra = {}) => ({
  lat: 10 + metros / 6371000 * 180 / Math.PI, lng: -84, ...extra
});
const fila = (metros, extra = {}) => ({
  nombre: 'Transportes Prueba', telefonos: [{numero:'88888888'}], bodegas: [bodega(metros)], ...extra
});

test('fusiona nombres, teléfonos y destinos sin modificar la entrada', () => {
  const data = [
    fila(0, { id: 'A', imagen: 'foto-a', destinos: ['Matina'], telefonos: [{ numero: '8888-8888' }] }),
    fila(30, { nombre: ' transportes  PRUEBA ', id: 'B', imagen: 'foto-b', destinos: ['MATINA', 'Limón'], telefonos: [{ numero: '+506 88888888' }, { numero: '22222222' }] })
  ];
  const snapshot = JSON.stringify(data);
  const [t] = clean(data);
  assert.equal(clean(data).length, 1);
  assert.equal(t.telefonos.length, 2);
  assert.deepEqual(t.destinos, ['MATINA', 'LIMÓN']);
  assert.equal(t.bodegas.length, 1);
  assert.equal(t.bodegas[0].lat, 10);
  assert.equal(t.id, 'A');
  assert.deepEqual(t._variantes.id, ['A', 'B']);
  assert.deepEqual(t._variantes.imagen, ['foto-a', 'foto-b']);
  assert.equal(JSON.stringify(data), snapshot);
  assert.deepEqual(clean(clean(data)), clean(data));
});

test('menos de 50 metros; comparación contra todas las bodegas', () => {
  assert.equal(clean([fila(0), fila(49.99)])[0].bodegas.length, 1);
  assert.equal(clean([fila(0), fila(50)])[0].bodegas.length, 2);
  const [t] = clean([fila(0), fila(200), fila(240)]);
  assert.equal(t.bodegas.length, 2);
  assert.equal(t.bodegas[1]._variantes.lat.length, 2);
  // No extiende el radio por una cadena de puntos cercanos.
  assert.equal(clean([fila(0), fila(40), fila(80)])[0].bodegas.length, 2);
});

test('elige la más cercana y no fusiona empresas diferentes', () => {
  const [t] = clean([fila(0), fila(70), fila(40)]);
  assert.equal(t.bodegas[0]._variantes, undefined);
  assert.equal(t.bodegas[1]._variantes.lat.length, 2);
  assert.equal(clean([fila(0), fila(0, { nombre: 'Otra empresa' })]).length, 2);
});

test('GPS inválido no navega ni elimina datos y conserva teléfonos de bodega', () => {
  for (const lat of [null, '', ' ', true, 'abc', '0x10', 91]) {
    assert.equal(context.coordenadasValidas({ lat, lng: -84 }), false);
  }
  assert.equal(context.coordenadasValidas({ lat: '10', lng: '-84' }), true);
  assert.equal(context.coordenadasValidas({ lat: 0, lng: 0 }), false);
  const data = [fila(0), fila(0, { bodegas: [
    { lat: null, lng: -84, direccion: 'Por verificar', telefonos: [{ numero: '77777777' }] }
  ] })];
  const [t] = clean(data);
  assert.equal(t.bodegas.length, 2);
  assert.ok(t.telefonos.some(t => t.numero === '77777777'));
  assert.deepEqual(clean([t]), [t]);
  assert.deepEqual(clean([null, {}, { nombre: ' ' }]), []);
});

test('ambas vistas renderizan una ficha con dos bodegas y navegación', () => {
  const [t] = clean([fila(0), fila(150)]);
  const destino = context.renderTarjetasTransportistasHtml([
    { transportista: t, bodega: t.bodegas[0], distancia: null }
  ]);
  context.renderResultadosTransportista([t]);
  for (const output of [destino, resultados.innerHTML]) {
    assert.equal((output.match(/class="boleto"/g) || []).length, 1);
    assert.equal((output.match(/class="bodega-item"/g) || []).length, 2);
    assert.ok(output.includes('destination=' + t.bodegas[1].lat));
  }
  const escaped = context.bodegasAnidadasHtml({ bodegas: [{ direccion: '<img onerror=alert(1)>' }] });
  assert.ok(escaped.includes('&lt;img'));
  assert.ok(escaped.includes('Ubicación GPS pendiente'));
});

test('Haversine calcula distancias cortas y cruza el antimeridiano', () => {
  assert.ok(Math.abs(context.distanciaBodegasMetros(bodega(0), bodega(100)) - 100) < 1e-6);
  assert.ok(context.distanciaBodegasMetros({ lat: 0, lng: 179.9999 }, { lat: 0, lng: -179.9999 }) < 30);
});

if (process.env.TRANSPORTISTAS_FIXTURE) {
  test('la respuesta real conserva teléfonos, destinos y GPS válidos', () => {
    const data = JSON.parse(fs.readFileSync(process.env.TRANSPORTISTAS_FIXTURE, 'utf8'));
    const out = clean(data);
    assert.equal(out.length, new Set(data.map(t => context.claveFusion(t.nombre)).filter(Boolean)).size);
    for (const row of data) {
      const t = out.find(t => t.nombre === context.claveFusion(row.nombre));
      for (const d of context.destinosDeFila(row)) assert.ok(t.destinos.includes(context.claveFusion(d)));
      const phones = context.fusionarTelefonos(row.telefonos, (row.bodegas || []).flatMap(b => b.telefonos || []));
      assert.equal(context.fusionarTelefonos(t.telefonos, phones).length, t.telefonos.length);
      for (const b of row.bodegas || []) {
        if (context.coordenadasValidas(b)) assert.ok(t.bodegas.some(x => context.coordenadasValidas(x) && context.distanciaBodegasMetros(x, b) < 50));
      }
    }
    assert.deepEqual(clean(out), out);
    console.log(JSON.stringify({ entrada: data.length, empresas: out.length, bodegas: out.reduce((n, t) => n + t.bodegas.length, 0) }));
  });
}


test('no fusiona bodegas adyacentes sin contacto o con descripciones diferentes', () => {
  assert.equal(clean([fila(0), fila(5, { telefonos: [{numero:'22222222'}] })])[0].bodegas.length, 2);
  assert.equal(clean([fila(0, {telefonos: []}), fila(5, {telefonos: []})])[0].bodegas.length, 2);
  assert.equal(clean([fila(0, {bodegas:[bodega(0,{direccion:'LOCAL 1'})]}), fila(5, {bodegas:[bodega(5,{direccion:'LOCAL 2'})]})])[0].bodegas.length, 2);
  // El teléfono global acumulado de otra fila NO puede justificar una fusión.
  const data = [fila(0), fila(200,{telefonos:[{numero:'22222222'}]}), fila(5,{telefonos:[{numero:'22222222'}]})];
  assert.equal(clean(data)[0].bodegas.length,3);
});

test('destinos aislados por empresa y fila; descarta valores vacíos o inválidos', () => {
  const data = [fila(0,{destinos:['MATINA','',null,{},'N/A']}), fila(0,{nombre:'Otra empresa',destinos:['LIBERIA']}), fila(0,{destinos:['matina','QUEPOS']})];
  const out=clean(data);
  assert.deepEqual(out[0].destinos,['MATINA','QUEPOS']);
  assert.deepEqual(out[1].destinos,['LIBERIA']);
  assert.equal(context.coincideDestino({nombre:'MATINA EXPRESS',destinos:[]},'MATINA',null),false);
});

test('planteles: estructura compartida, empresas distintas, sin cadenas ni destinos cruzados', () => {
  const rows = [0,30,60].map((m,i)=>fila(m,{nombre:'Empresa '+i,destinos:['DESTINO '+i],bodegas:[bodega(m,{direccion:'BODEGA VARGAS'})]}));
  const data=clean(rows), before=JSON.stringify(data);
  const groups=context.agruparPlanteles(data);
  assert.equal(groups.length,1);
  assert.equal(groups[0].transportistas.length,2);
  assert.equal(JSON.stringify(data),before);
  assert.deepEqual(data[0].destinos,['DESTINO 0']);
  assert.equal(context.agruparPlanteles(clean([rows[0],fila(5,{nombre:'Vecino',bodegas:[bodega(5,{direccion:'BODEGA OTRA'})]})])).length,0);
  assert.equal(context.agruparPlanteles(clean([rows[0],rows[0]])).length,0);
});

test('vista de planteles conserva las fichas y destinos de cada empresa', () => {
  vm.runInContext(`transportistas = sanitizarDatos([
    {nombre:'EMPRESA A',destinos:['SOLO A'],bodegas:[{lat:10,lng:-84,direccion:'BODEGA VARGAS'}]},
    {nombre:'EMPRESA B',destinos:['SOLO B'],bodegas:[{lat:10.0001,lng:-84,direccion:'BODEGA VARGAS'}]}
  ]); planteles=agruparPlanteles(transportistas);`,context);
  resultados.value='VARGAS';
  context.buscarPorPlantel();
  assert.ok(resultados.innerHTML.includes('2 transportistas'));
  assert.equal((resultados.innerHTML.match(/class="boleto"/g)||[]).length,2);
  resultados.value='NO EXISTE';context.buscarPorPlantel();
  assert.ok(resultados.innerHTML.includes('No se encontraron'));
});
