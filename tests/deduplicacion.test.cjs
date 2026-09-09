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
  nombre: 'Transportes Prueba', bodegas: [bodega(metros)], ...extra
});

test('fusiona nombres, teléfonos y destinos sin modificar la entrada', () => {
  const data = [
    fila(0, { id: 'A', imagen: 'foto-a', destinos: ['Matina'], telefonos: [{ numero: '8888-8888' }] }),
    fila(50, { nombre: ' transportes  PRUEBA ', id: 'B', imagen: 'foto-b', destinos: ['MATINA', 'Limón'], telefonos: [{ numero: '+506 88888888' }, { numero: '22222222' }] })
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

test('100 metros inclusive; comparación contra todas las bodegas', () => {
  assert.equal(clean([fila(0), fila(100)])[0].bodegas.length, 1);
  assert.equal(clean([fila(0), fila(100.01)])[0].bodegas.length, 2);
  const [t] = clean([fila(0), fila(200), fila(240)]);
  assert.equal(t.bodegas.length, 2);
  assert.equal(t.bodegas[1]._variantes.lat.length, 2);
  // No extiende el radio por una cadena de puntos cercanos.
  assert.equal(clean([fila(0), fila(90), fila(180)])[0].bodegas.length, 2);
});

test('elige la más cercana y no fusiona empresas diferentes', () => {
  const [t] = clean([fila(0), fila(150), fila(90)]);
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
  assert.equal(t.telefonos[0].numero, '77777777');
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
      for (const d of row.destinos || []) assert.ok(t.destinos.includes(context.claveFusion(d)));
      const phones = context.fusionarTelefonos(row.telefonos, (row.bodegas || []).flatMap(b => b.telefonos || []));
      assert.equal(context.fusionarTelefonos(t.telefonos, phones).length, t.telefonos.length);
      for (const b of row.bodegas || []) {
        if (context.coordenadasValidas(b)) assert.ok(t.bodegas.some(x => context.coordenadasValidas(x) && context.distanciaBodegasMetros(x, b) <= 100 + 1e-7));
      }
    }
    assert.deepEqual(clean(out), out);
    console.log(JSON.stringify({ entrada: data.length, empresas: out.length, bodegas: out.reduce((n, t) => n + t.bodegas.length, 0) }));
  });
}
