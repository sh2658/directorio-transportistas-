/**
 * ====================================================================
 * SISTEMA DE ASIGNACIÓN Y DISTRIBUCIÓN DE CAPTURAS APROBADAS (V10)
 * ====================================================================
 * - Si el transportista ya existe, reutiliza su ID y completa únicamente
 *   los datos que falten. Nunca crea otra empresa por una segunda bodega.
 * - Una ubicación dentro de 100 m se considera el mismo predio. Una
 *   ubicación a más de 100 m se guarda como otra DIRECCION del mismo ID.
 * - AGREGA NUEVOS TELÉFONOS y DESTINOS sin duplicar los existentes.
 * - Anti-duplicados inteligente (ignora tildes, espacios y mayúsculas).
 * - Normaliza teléfonos a formato tico (XXXX-XXXX, 8 dígitos).
 * - Guarda todo estandarizado en MAYÚSCULAS.
 * ====================================================================
 */

function asignarCapturasAprobadas() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return;
  try {
    return asignarCapturasAprobadasInterno_();
  } finally {
    lock.releaseLock();
  }
}

function asignarCapturasAprobadasInterno_() {
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);

  const sheetCapturas      = ss.getSheetByName("CAPTURAS");
  const sheetTransportista = ss.getSheetByName("TRANSPORTISTA");
  const sheetTelefonos     = ss.getSheetByName("TELEFONOS");
  const sheetLugares       = ss.getSheetByName("LUGARES");
  const sheetVisita        = ss.getSheetByName("VISITA");
  const sheetDireccion     = ss.getSheetByName("DIRECCION");

  if (!sheetCapturas || !sheetTransportista || !sheetTelefonos || !sheetLugares || !sheetVisita || !sheetDireccion) {
    Logger.log("❌ Error: Una o más pestañas no se encontraron en la base de datos.");
    return 0;
  }

  const capturasData = sheetCapturas.getDataRange().getValues();
  if (capturasData.length <= 1) return 0;

  const rawHeaders = capturasData[0];
  const headers = rawHeaders.map(h => h.toString().trim());

  const idxEstado         = findHeaderIndex(headers, ["ESTADO", "Estado"]);
  const idxIdTransporte   = findHeaderIndex(headers, ["IDTRANSPORTE", "ID TRANSPORTE"]);
  const idxTransportista  = findHeaderIndex(headers, ["NOMBRE DEL TRANSPORTISTA", "TRANSPORTISTA"]);
  const idxTelefonos      = findHeaderIndex(headers, ["TELEFONOS", "Teléfonos"]);
  const idxDestinos       = findHeaderIndex(headers, ["LUGARES O DESTINOS", "DESTINOS"]);
  const idxBodegas        = findHeaderIndex(headers, ["DIRECCIONES O BODEGAS", "BODEGAS"]);
  const idxHorario        = findHeaderIndex(headers, ["HORARIO", "Horario"]);
  const idxObservaciones  = findHeaderIndex(headers, ["OBSERVACIONES", "Observaciones"]);
  const idxGps            = findHeaderIndex(headers, ["GPS"]);
  const idxFoto           = findHeaderIndex(headers, ["FOTO", "Foto"]);

  if (idxEstado === -1) return 0;

  const mapTransportistas = getMapPorColumnas(sheetTransportista, 1, 0);
  const mapLugares        = getMapPorColumnas(sheetLugares, 1, 0);
  const setTelefonos      = getCombinedKeys(sheetTelefonos, 1, 2);
  const setVisitas        = getCombinedKeys(sheetVisita, 1, 2);
  const mapTelefonoAIds   = crearMapaTelefonoAIds_(sheetTelefonos);
  const direccionesCache  = leerDirecciones_(sheetDireccion);

  let procesados = 0;

  for (let i = 1; i < capturasData.length; i++) {
    const row = capturasData[i];
    const estado = normalizarTexto(row[idxEstado]);

    // Acepta "aprobado", "actualizar", "aprobado - actualizar"
    if (!estado.includes("aprobad") && !estado.includes("actualiz")) continue;

    const nombreTransportista = (row[idxTransportista] || "").toString().trim().toUpperCase();
    const horario             = (row[idxHorario]       || "").toString().trim().toUpperCase();
    const observaciones       = (row[idxObservaciones] || "").toString().trim().toUpperCase();
    const gpsCaptura          = (idxGps !== -1) ? String(row[idxGps] || "").trim() : "";
    const fotoCaptura         = (idxFoto !== -1) ? String(row[idxFoto] || "").trim() : "";

    const listaTelefonos = splitList(row[idxTelefonos]);
    const listaDestinos  = splitList(row[idxDestinos]);
    const listaBodegas   = splitAddressList(row[idxBodegas]);
    const nombreKey = normalizarTexto(nombreTransportista);

    let idTransporte = "";
    let esActualizacion = false;

    // 1. IDENTIDAD: nombre exacto normalizado y, como respaldo, teléfono.
    if (mapTransportistas.has(nombreKey)) {
      idTransporte = mapTransportistas.get(nombreKey);
      esActualizacion = true;
      actualizarDatosTransportistaExistente_(sheetTransportista, idTransporte, horario, fotoCaptura, observaciones);
    } else if (nombreTransportista) {
      const idsPorTelefono = obtenerIdsPorTelefonos_(listaTelefonos, mapTelefonoAIds);
      if (idsPorTelefono.size > 1) {
        registrarConflictoCaptura_(sheetCapturas, i + 1, idxEstado, idxObservaciones,
          "CONFLICTO: LOS TELÉFONOS PERTENECEN A TRANSPORTISTAS DISTINTOS");
        continue;
      }
      if (idsPorTelefono.size === 1) {
        idTransporte = Array.from(idsPorTelefono)[0];
        esActualizacion = true;
        mapTransportistas.set(nombreKey, idTransporte);
        actualizarDatosTransportistaExistente_(sheetTransportista, idTransporte, horario, fotoCaptura, observaciones);
      } else {
        idTransporte = generarId(sheetTransportista, "TRP-");
        sheetTransportista.appendRow([idTransporte, nombreTransportista, horario, observaciones, fotoCaptura, "", "", ""]);
        mapTransportistas.set(nombreKey, idTransporte);
      }
    } else {
      continue;
    }

    // Vincular IDTRANSPORTE en la hoja CAPTURAS
    if (idxIdTransporte !== -1 && idTransporte) {
      sheetCapturas.getRange(i + 1, idxIdTransporte + 1).setValue(idTransporte);
    }

    // 2. TELÉFONOS (agrega nuevos teléfonos si la foto trae números adicionales)
    listaTelefonos.forEach(tel => {
      const telNorm = normalizarTelefono(tel);
      if (!telNorm) return;
      const clave = `${idTransporte}_${normalizarTexto(telNorm)}`;
      if (!setTelefonos.has(clave)) {
        const idTelefono = generarId(sheetTelefonos, "TEL-");
        sheetTelefonos.appendRow([idTelefono, idTransporte, telNorm, ""]);
        setTelefonos.add(clave);
        if (!mapTelefonoAIds.has(normalizarTelefonoClave_(telNorm))) mapTelefonoAIds.set(normalizarTelefonoClave_(telNorm), new Set());
        mapTelefonoAIds.get(normalizarTelefonoClave_(telNorm)).add(idTransporte);
      }
    });

    // 3. LUGARES / DESTINOS (agrega nuevas rutas si la foto trae nuevos pueblos)
    listaDestinos.forEach(destino => {
      if (!destino) return;
      const destinoKey = normalizarTexto(destino);
      let idLugares = mapLugares.get(destinoKey);

      if (!idLugares) {
        idLugares = generarId(sheetLugares, "LUG-");
        sheetLugares.appendRow([idLugares, destino]);
        mapLugares.set(destinoKey, idLugares);
      }

      const claveVisita = `${idTransporte}_${idLugares}`;
      if (!setVisitas.has(claveVisita)) {
        const idVisita = generarId(sheetVisita, "VIS-");
        sheetVisita.appendRow([idVisita, idTransporte, idLugares]);
        setVisitas.add(claveVisita);
      }
    });

    // 4. BODEGAS: <=100 m mismo predio; >100 m otra dirección del mismo transportista.
    let conflictoUbicacion = false;
    listaBodegas.forEach((bodega, index) => {
      if (!bodega) return;
      const gps = (index === 0) ? gpsCaptura : "";
      const zonaInfo = resolverZona_(bodega, gps);
      if (zonaInfo.conflicto) {
        conflictoUbicacion = true;
        registrarConflictoCaptura_(sheetCapturas, i + 1, idxEstado, idxObservaciones,
          `CONFLICTO DE ZONA: DIRECCIÓN ${zonaInfo.zonaTexto} / GPS ${zonaInfo.zonaGps}`);
        return;
      }
      asignarBodegaPorDistancia_(sheetDireccion, direccionesCache, idTransporte, bodega, gps, zonaInfo.zona);
    });
    if (conflictoUbicacion) continue;

    // Estado final en la hoja CAPTURAS
    // Ambos valores existen en la validación/Enum actual de CAPTURAS y AppSheet.
    const estadoFinal = esActualizacion ? "Procesado" : "Asignado";
    sheetCapturas.getRange(i + 1, idxEstado + 1).setValue(estadoFinal);
    procesados++;
  }

  return procesados;
}

// ======================================================================
// FUNCIONES DE ACTUALIZACIÓN A LA ÚLTIMA TOMA
// ======================================================================

/**
 * Completa horario e imagen solo cuando están vacíos; acumula notas nuevas.
 */
function actualizarDatosTransportistaExistente_(sheetTransportista, idTransporte, nuevoHorario, nuevaFoto, nuevasObs) {
  const data = sheetTransportista.getDataRange().getValues();
  const headers = data[0].map(h => h.toString().trim().toUpperCase());
  const idxId = headers.indexOf("IDTRANSPORTE");
  const idxHorario = headers.indexOf("HORARIO");
  const idxObs = headers.indexOf("OBSERVACIONES");
  const idxImg = headers.indexOf("IMAGEN");

  if (idxId < 0) return;

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][idxId] || "").trim() === idTransporte) {
      const fila = i + 1;
      if (nuevoHorario && idxHorario >= 0 && !String(data[i][idxHorario] || "").trim()) {
        sheetTransportista.getRange(fila, idxHorario + 1).setValue(nuevoHorario);
      }
      if (nuevaFoto && idxImg >= 0 && !String(data[i][idxImg] || "").trim()) {
        sheetTransportista.getRange(fila, idxImg + 1).setValue(nuevaFoto);
      }
      // Actualizar observaciones si hay notas
      if (nuevasObs && idxObs >= 0) {
        const obsPrevias = String(data[i][idxObs] || "").trim();
        const partes = obsPrevias ? obsPrevias.split(/\s*\|\s*/).filter(Boolean) : [];
        if (!partes.some(obs => normalizarTexto(obs) === normalizarTexto(nuevasObs))) {
          partes.push(nuevasObs);
          sheetTransportista.getRange(fila, idxObs + 1).setValue(partes.join(" | "));
        }
      }
      return;
    }
  }
}

// ======================================================================
// FUNCIONES AUXILIARES
// ======================================================================

const DISTANCIA_MISMO_PREDIO_METROS_ = 100;
// Absorbe únicamente el error de redondeo de punto flotante en el límite exacto.
const TOLERANCIA_DISTANCIA_METROS_ = 0.01;

function normalizarTelefonoClave_(tel) {
  let digits = String(tel || "").replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("506")) digits = digits.slice(3);
  return digits.length === 8 ? digits : "";
}

function crearMapaTelefonoAIds_(sheetTelefonos) {
  const mapa = new Map();
  const data = sheetTelefonos.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    const id = String(data[i][1] || "").trim();
    const tel = normalizarTelefonoClave_(data[i][2]);
    if (!id || !tel) continue;
    if (!mapa.has(tel)) mapa.set(tel, new Set());
    mapa.get(tel).add(id);
  }
  return mapa;
}

function obtenerIdsPorTelefonos_(telefonos, mapa) {
  const ids = new Set();
  telefonos.forEach(tel => {
    const key = normalizarTelefonoClave_(tel);
    if (!key || !mapa.has(key)) return;
    mapa.get(key).forEach(id => ids.add(id));
  });
  return ids;
}

function parsearGps_(raw) {
  const m = String(raw || "").trim().match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
  if (!m) return null;
  const lat = Number(m[1]);
  const lng = Number(m[2]);
  if (lat < 5 || lat > 11.5 || lng < -88 || lng > -82) return null;
  return { lat: lat, lng: lng };
}

function distanciaMetros_(a, b) {
  const radio = 6371000;
  const rad = grados => grados * Math.PI / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const x = Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * radio * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

function leerDirecciones_(sheetDireccion) {
  const data = sheetDireccion.getDataRange().getValues();
  const lista = [];
  for (let i = 1; i < data.length; i++) {
    const idTransporte = String(data[i][1] || "").trim();
    if (!idTransporte) continue;
    lista.push({
      fila: i + 1,
      id: String(data[i][0] || "").trim(),
      idTransporte: idTransporte,
      direccion: String(data[i][2] || "").trim(),
      gps: String(data[i][3] || "").trim(),
      zona: String(data[i][4] || "").trim()
    });
  }
  return lista;
}

function esDireccionGenerica_(direccion) {
  const k = normalizarTexto(direccion);
  return !k || /^(no indica|no indicada|no especificada|sin direccion)/.test(k);
}

function decidirCoincidenciaBodega_(existentes, direccion, gps) {
  const punto = parsearGps_(gps);
  const mismas = existentes.filter(d => d.idTransporte);
  if (punto) {
    let mejor = null;
    mismas.forEach(d => {
      const previo = parsearGps_(d.gps);
      if (!previo) return;
      const metros = distanciaMetros_(previo, punto);
      if (!mejor || metros < mejor.metros) mejor = { registro: d, metros: metros };
    });
    if (mejor && mejor.metros <= DISTANCIA_MISMO_PREDIO_METROS_ + TOLERANCIA_DISTANCIA_METROS_) {
      return { accion: "MISMO_PREDIO", registro: mejor.registro, metros: mejor.metros };
    }
    const sinGpsMismaDireccion = mismas.find(d => !parsearGps_(d.gps) &&
      normalizarTexto(d.direccion) === normalizarTexto(direccion));
    if (sinGpsMismaDireccion) return { accion: "COMPLETAR_GPS", registro: sinGpsMismaDireccion };
    return { accion: "NUEVA_DIRECCION" };
  }
  const mismaDireccion = mismas.find(d => normalizarTexto(d.direccion) === normalizarTexto(direccion));
  return mismaDireccion ? { accion: "MISMA_DIRECCION", registro: mismaDireccion } : { accion: "NUEVA_DIRECCION" };
}

function asignarBodegaPorDistancia_(sheet, cache, idTransporte, direccion, gps, zona) {
  const punto = parsearGps_(gps);
  if (esDireccionGenerica_(direccion)) {
    if (!punto) return { accion: "OMITIDA_DIRECCION_GENERICA" };
    direccion = "UBICACIÓN CAPTURADA POR GPS";
  }
  const existentes = cache.filter(d => d.idTransporte === idTransporte);
  const decision = decidirCoincidenciaBodega_(existentes, direccion, gps);
  if (decision.registro) {
    const d = decision.registro;
    if (!d.direccion && direccion) { sheet.getRange(d.fila, 3).setValue(direccion); d.direccion = direccion; }
    if (!parsearGps_(d.gps) && parsearGps_(gps)) { sheet.getRange(d.fila, 4).setValue(gps); d.gps = gps; }
    if (!d.zona && zona) { sheet.getRange(d.fila, 5).setValue(zona); d.zona = zona; }
    return decision;
  }
  const idDireccion = generarId(sheet, "DIR-");
  sheet.appendRow([idDireccion, idTransporte, direccion, parsearGps_(gps) ? gps : "", zona || ""]);
  cache.push({fila:sheet.getLastRow(),id:idDireccion,idTransporte:idTransporte,direccion:direccion,gps:gps,zona:zona || ""});
  return decision;
}

function zonaPorTexto_(direccion) {
  const k = normalizarTexto(direccion);
  const reglas = [
    ["BARRIO MÉXICO", /barrio mexico|torre mercedes|transportes cordero|transpuris/],
    ["CALLE BLANCOS", /calle blancos/],
    ["PAVAS", /pavas|bodega vargas|complejos marvin/],
    ["URUCA", /uruca|bodega anay/],
    ["TIBÁS", /tibas|colima|transcama|miravalles|metalco/],
    ["PASEO COLÓN", /paseo colon/],
    ["SAN CARLOS", /san carlos|ciudad quesada/]
  ];
  const encontrada = reglas.find(r => r[1].test(k));
  return encontrada ? encontrada[0] : "";
}

function zonaPorGps_(gps) {
  const punto = parsearGps_(gps);
  if (!punto) return "";
  const centros = [
    {zona:"TIBÁS",lat:9.951587,lng:-84.089046,radio:650},
    {zona:"BARRIO MÉXICO",lat:9.940303,lng:-84.082919,radio:800},
    {zona:"PAVAS",lat:9.940810,lng:-84.135538,radio:900},
    {zona:"URUCA",lat:9.955206,lng:-84.105925,radio:900},
    {zona:"CALLE BLANCOS",lat:9.946034,lng:-84.066076,radio:800}
  ].map(c => ({zona:c.zona,radio:c.radio,metros:distanciaMetros_(punto,c)}))
   .filter(c => c.metros <= c.radio)
   .sort((a,b) => a.metros - b.metros);
  return centros.length ? centros[0].zona : "";
}

function resolverZona_(direccion, gps) {
  const zonaTexto = zonaPorTexto_(direccion);
  const zonaGps = zonaPorGps_(gps);
  return {
    zonaTexto: zonaTexto,
    zonaGps: zonaGps,
    conflicto: Boolean(zonaTexto && zonaGps && zonaTexto !== zonaGps),
    zona: zonaTexto || zonaGps || ""
  };
}

function registrarConflictoCaptura_(sheet, fila, idxEstado, idxObservaciones, mensaje) {
  sheet.getRange(fila, idxEstado + 1).setValue("Revisado");
  if (idxObservaciones < 0) return;
  const celda = sheet.getRange(fila, idxObservaciones + 1);
  const anterior = String(celda.getValue() || "").trim();
  if (!normalizarTexto(anterior).includes(normalizarTexto(mensaje))) {
    celda.setValue([anterior, mensaje].filter(Boolean).join(" | "));
  }
}

function normalizarTexto(texto) {
  if (!texto) return "";
  return texto.toString()
              .normalize("NFD")
              .replace(/[\u0300-\u036f]/g, "")
              .toLowerCase()
              .trim();
}

function normalizarTelefono(tel) {
  let t = String(tel || "").trim().toUpperCase();
  t = t.replace(/^\+?506[\s-]*/i, "");
  const digits = t.replace(/\D/g, "");
  if (digits.length === 8) {
    return digits.slice(0, 4) + "-" + digits.slice(4);
  }
  return t;
}

function findHeaderIndex(headers, variants) {
  const normHeaders = headers.map(normalizarTexto);
  const normVariants = variants.map(normalizarTexto);
  for (let i = 0; i < normHeaders.length; i++) {
    if (normVariants.includes(normHeaders[i])) return i;
  }
  for (let i = 0; i < normHeaders.length; i++) {
    for (let variant of normVariants) {
      if (normHeaders[i].includes(variant)) return i;
    }
  }
  return -1;
}

function getMapPorColumnas(sheet, colKey, colValue) {
  const map  = new Map();
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    const key = normalizarTexto(data[i][colKey]);
    const val = data[i][colValue] ? data[i][colValue].toString().trim() : "";
    if (key && val) map.set(key, val);
  }
  return map;
}

function getCombinedKeys(sheet, col1, col2) {
  const keys = new Set();
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    const v1 = data[i][col1] ? data[i][col1].toString().trim() : "";
    const v2 = normalizarTexto(data[i][col2]);
    if (v1 && v2) keys.add(`${v1}_${v2}`);
  }
  return keys;
}

function generarId(sheet, prefijo) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return prefijo + "0001";

  const ids = sheet.getRange(2, 1, lastRow - 1, 1).getDisplayValues().flat();
  let maximo = 0;
  ids.forEach(id => {
    const texto = String(id || "").trim();
    if (!texto.toUpperCase().startsWith(prefijo.toUpperCase())) return;
    const sufijo = texto.slice(prefijo.length);
    if (/^\d+$/.test(sufijo)) maximo = Math.max(maximo, Number(sufijo));
  });
  return prefijo + String(maximo + 1).padStart(4, "0");
}
function splitList(val) {
  if (!val) return [];
  return val.toString().split(/[\n,;]+/).map(s => s.trim().toUpperCase()).filter(Boolean);
}

// Una captura representa un solo predio porque contiene un único GPS.
// Comas, saltos de línea y punto y coma pueden formar parte de la dirección;
// no deben producir registros DIRECCION fragmentados.
function splitAddressList(val) {
  if (!val) return [];
  const direccion = val.toString().replace(/\s+/g, " ").trim().toUpperCase();
  return direccion ? [direccion] : [];
}
