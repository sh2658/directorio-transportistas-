const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function cargar() {
  const context = vm.createContext({ console });
  vm.runInContext(
    fs.readFileSync('apps_script/AsignarCapturas_Mejorado.js', 'utf8'),
    context
  );
  return context;
}

function direccion(gps, texto = 'BODEGA PRINCIPAL', zona = 'TIBÁS') {
  return {
    fila: 2,
    id: 'DIR-0001',
    idTransporte: 'TRP-0001',
    direccion: texto,
    gps,
    zona
  };
}

test('la regla geográfica considera el mismo predio hasta 100 metros', () => {
  const c = cargar();
  const cerca = c.decidirCoincidenciaBodega_(
    [direccion('9.951587,-84.089046')],
    'OTRA DESCRIPCIÓN DEL MISMO LOCAL',
    '9.952037,-84.089046'
  );
  assert.equal(cerca.accion, 'MISMO_PREDIO');
  assert.ok(cerca.metros < 100);

  const lejos = c.decidirCoincidenciaBodega_(
    [direccion('9.951587,-84.089046')],
    'SEGUNDA BODEGA',
    '9.953087,-84.089046'
  );
  assert.equal(lejos.accion, 'NUEVA_DIRECCION');
});

test('el límite matemático de 100 metros sigue siendo el mismo predio', () => {
  const c = cargar();
  const origen = { lat: 9.951587, lng: -84.089046 };
  const deltaLat = (100 / 6371000) * (180 / Math.PI);
  const destino = (origen.lat + deltaLat) + ',' + origen.lng;

  const limite = c.decidirCoincidenciaBodega_(
    [direccion(origen.lat + ',' + origen.lng)],
    'MISMO PREDIO EN EL LÍMITE',
    destino
  );
  assert.equal(limite.accion, 'MISMO_PREDIO');
  assert.ok(limite.metros <= 100.01);

  const fuera = c.decidirCoincidenciaBodega_(
    [direccion(origen.lat + ',' + origen.lng)],
    'OTRA BODEGA',
    (origen.lat + ((100.1 / 6371000) * (180 / Math.PI))) + ',' + origen.lng
  );
  assert.equal(fuera.accion, 'NUEVA_DIRECCION');
});

test('una dirección idéntica a más de 100 metros sigue siendo otra bodega', () => {
  const c = cargar();
  const resultado = c.decidirCoincidenciaBodega_(
    [direccion('9.951587,-84.089046', 'LOCAL CENTRAL')],
    'LOCAL CENTRAL',
    '9.953087,-84.089046'
  );
  assert.equal(resultado.accion, 'NUEVA_DIRECCION');
});

test('sin GPS la coincidencia usa el texto normalizado de la dirección', () => {
  const c = cargar();
  const resultado = c.decidirCoincidenciaBodega_(
    [direccion('', 'BODEGA TIBÁS')],
    'bodega tibas',
    ''
  );
  assert.equal(resultado.accion, 'MISMA_DIRECCION');
});

test('la dirección de una sola captura no se fragmenta por comas o saltos', () => {
  const c = cargar();
  const resultado = c.splitAddressList('Barrio México,\ncontiguo al parque; portón azul');
  assert.deepEqual(
    Array.from(resultado),
    ['BARRIO MÉXICO, CONTIGUO AL PARQUE; PORTÓN AZUL']
  );
});

test('los teléfonos identifican al transportista aun con formatos distintos', () => {
  const c = cargar();
  assert.equal(c.normalizarTelefonoClave_('+506 7152-9650'), '71529650');
  assert.equal(c.normalizarTelefonoClave_('71529650'), '71529650');
  assert.equal(c.normalizarTelefonoClave_('123'), '');
});

test('asigna las zonas principales por texto y detecta desacuerdo con GPS', () => {
  const c = cargar();
  assert.equal(c.zonaPorTexto_('Centro de bodegas Transcama, Colima'), 'TIBÁS');
  assert.equal(c.zonaPorTexto_('Bodega en La Uruca'), 'URUCA');
  assert.equal(c.zonaPorTexto_('Complejos Marvin, Pavas'), 'PAVAS');
  assert.equal(c.zonaPorTexto_('Torre Mercedes, Barrio México'), 'BARRIO MÉXICO');

  const conflicto = c.resolverZona_('Bodega en Pavas', '9.951587,-84.089046');
  assert.equal(conflicto.zonaTexto, 'PAVAS');
  assert.equal(conflicto.zonaGps, 'TIBÁS');
  assert.equal(conflicto.conflicto, true);
});

test('un conflicto zona/GPS se detecta antes de preparar cualquier escritura', () => {
  const c = cargar();
  const preparacion = c.prepararBodegas_(
    ['BODEGA EN PAVAS'],
    '9.951587,-84.089046'
  );
  assert.equal(preparacion.items.length, 1);
  assert.equal(preparacion.conflicto.zonaInfo.zonaTexto, 'PAVAS');
  assert.equal(preparacion.conflicto.zonaInfo.zonaGps, 'TIBÁS');
});

test('GPS inválido o fuera de Costa Rica se rechaza', () => {
  const c = cargar();
  assert.equal(c.parsearGps_(''), null);
  assert.equal(c.parsearGps_('0,0'), null);
  assert.equal(c.parsearGps_('9.95,-84.09 texto'), null);
  assert.deepEqual(
    JSON.parse(JSON.stringify(c.parsearGps_('9.951587,-84.089046'))),
    { lat: 9.951587, lng: -84.089046 }
  );
});

test('solo escribe estados admitidos actualmente por CAPTURAS y AppSheet', () => {
  const source = fs.readFileSync('apps_script/AsignarCapturas_Mejorado.js', 'utf8');
  assert.match(source, /esActualizacion \? "Procesado" : "Asignado"/);
  assert.doesNotMatch(source, /Actualizado a última toma/);
});
