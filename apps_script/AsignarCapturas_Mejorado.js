/**
 * ====================================================================
 * SISTEMA DE STAGING, COMPARACIÓN Y ASIGNACIÓN DE CAPTURAS (V11)
 * ====================================================================
 * - IDTRANSPORTE es la identidad de la empresa. Teléfono, GPS, dirección,
 *   bodega, propietario o cercanía NO identifican ni fusionan transportistas.
 * - Si no viene ID explícito, un nombre exacto solo se reutiliza cuando
 *   corresponde a un único ID; nombres repetidos requieren revisión manual.
 * - Una ubicación dentro de 100 m se considera el mismo predio únicamente
 *   dentro del MISMO IDTRANSPORTE. Nunca se compara para fusionar empresas.
 * - AGREGA NUEVOS TELÉFONOS y DESTINOS solo al ID seleccionado/resuelto.
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

  asegurarColumnasStagingCapturas_(sheetCapturas);

  const capturasData = sheetCapturas.getDataRange().getValues();
  if (capturasData.length <= 1) return 0;

  const headers = capturasData[0].map(h => h.toString().trim());
  const idx = {
    estado: findHeaderIndex(headers, ["ESTADO", "Estado"]),
    idTransporte: findHeaderIndex(headers, ["IDTRANSPORTE", "ID TRANSPORTE"]),
    transportista: findHeaderIndex(headers, ["NOMBRE DEL TRANSPORTISTA", "TRANSPORTISTA"]),
    telefonos: findHeaderIndex(headers, ["TELEFONOS", "Teléfonos"]),
    destinos: findHeaderIndex(headers, ["LUGARES O DESTINOS", "DESTINOS"]),
    bodegas: findHeaderIndex(headers, ["DIRECCIONES O BODEGAS", "BODEGAS"]),
    horario: findHeaderIndex(headers, ["HORARIO", "Horario"]),
    observaciones: findHeaderIndex(headers, ["OBSERVACIONES", "Observaciones"]),
    gps: findHeaderIndex(headers, ["GPS"]),
    foto: findHeaderIndex(headers, ["FOTO", "Foto"]),
    usuario: findHeaderIndex(headers, ["USUARIO"]),
    estadoIdentidad: findHeaderIndex(headers, ["ESTADO IDENTIDAD"]),
    estadoComparacion: findHeaderIndex(headers, ["ESTADO COMPARACION", "ESTADO COMPARACIÓN"]),
    alcance: findHeaderIndex(headers, ["ALCANCE CAPTURA"]),
    cambios: findHeaderIndex(headers, ["CAMBIOS DETECTADOS"]),
    fechaProceso: findHeaderIndex(headers, ["FECHA PROCESAMIENTO"]),
    procesadoPor: findHeaderIndex(headers, ["PROCESADO POR"]),
    hash: findHeaderIndex(headers, ["HASH CAPTURA"])
  };

  if (idx.estado === -1 || idx.transportista === -1) return 0;

  const mapTransportistas = crearMapaNombreAIds_(sheetTransportista);
  const idsTransportistas = crearSetIdsTransportistas_(sheetTransportista);
  const transportistasPorId = leerTransportistasPorId_(sheetTransportista);
  const mapLugares = getMapPorColumnas(sheetLugares, 1, 0);
  const lugaresPorId = leerLugaresPorId_(sheetLugares);
  const setTelefonos = getCombinedKeys(sheetTelefonos, 1, 2);
  const telefonosPorId = leerTelefonosPorId_(sheetTelefonos);
  const setVisitas = getCombinedKeys(sheetVisita, 1, 2);
  const destinosPorId = leerDestinosPorId_(sheetVisita, lugaresPorId);
  const direccionesCache = leerDirecciones_(sheetDireccion);

  let procesados = 0;

  for (let i = 1; i < capturasData.length; i++) {
    const row = capturasData[i];
    const fila = i + 1;
    const estado = normalizarTexto(row[idx.estado]);

    // AppSheet/IA pueden llenar CAPTURAS libremente. Solo una aprobación explícita
    // promueve la información a las tablas maestras.
    if (!estado.includes("aprobad") && !estado.includes("actualiz")) continue;

    const captura = {
      nombre: String(row[idx.transportista] || "").trim().toUpperCase(),
      horario: idx.horario >= 0 ? String(row[idx.horario] || "").trim().toUpperCase() : "",
      observaciones: idx.observaciones >= 0 ? String(row[idx.observaciones] || "").trim().toUpperCase() : "",
      gps: idx.gps >= 0 ? String(row[idx.gps] || "").trim() : "",
      foto: idx.foto >= 0 ? String(row[idx.foto] || "").trim() : "",
      telefonos: idx.telefonos >= 0 ? splitList(row[idx.telefonos]) : [],
      destinos: idx.destinos >= 0 ? splitList(row[idx.destinos]) : [],
      bodegas: idx.bodegas >= 0 ? splitAddressList(row[idx.bodegas]) : [],
      idExplicito: idx.idTransporte >= 0 ? String(row[idx.idTransporte] || "").trim() : "",
      alcance: idx.alcance >= 0 ? String(row[idx.alcance] || "").trim().toUpperCase() : "",
      usuario: idx.usuario >= 0 ? String(row[idx.usuario] || "").trim() : ""
    };
    if (!captura.alcance) captura.alcance = "PARCIAL";

    const hash = hashCaptura_(captura);
    if (idx.alcance >= 0 && !String(row[idx.alcance] || "").trim()) {
      sheetCapturas.getRange(fila, idx.alcance + 1).setValue(captura.alcance);
    }

    const preparacionBodegas = prepararBodegas_(captura.bodegas, captura.gps);
    if (preparacionBodegas.conflicto) {
      const conflicto = preparacionBodegas.conflicto;
      const mensaje = "CONFLICTO DE ZONA: DIRECCIÓN " + conflicto.zonaInfo.zonaTexto + " / GPS " + conflicto.zonaInfo.zonaGps;
      registrarResultadoStaging_(sheetCapturas, fila, idx, {
        idTransporte: captura.idExplicito,
        estadoIdentidad: "REVISAR",
        estadoComparacion: "REVISAR",
        alcance: captura.alcance,
        cambios: [{tipo:"BODEGA",accion:"REVISAR",detalle:mensaje}],
        hash: hash,
        estadoFinal: "Revisado"
      });
      continue;
    }

    const identidad = decidirIdentidadTransportista_(
      normalizarTexto(captura.nombre),
      captura.idExplicito,
      mapTransportistas,
      idsTransportistas
    );

    if (identidad.accion === "REVISAR") {
      registrarResultadoStaging_(sheetCapturas, fila, idx, {
        idTransporte: captura.idExplicito,
        estadoIdentidad: identidad.mensaje && /varios transportistas/i.test(identidad.mensaje) ? "AMBIGUO" : "REVISAR",
        estadoComparacion: "REVISAR",
        alcance: captura.alcance,
        cambios: [{tipo:"IDENTIDAD",accion:"REVISAR",detalle:identidad.mensaje}],
        hash: hash,
        estadoFinal: "Revisado"
      });
      continue;
    }

    if (identidad.accion === "CREAR") {
      const idTransporte = generarId(sheetTransportista, "TRP-");
      sheetTransportista.appendRow([idTransporte, captura.nombre, valorInformativo_(captura.horario), valorInformativo_(captura.observaciones), captura.foto, "", "", ""]);
      agregarNombreId_(mapTransportistas, captura.nombre, idTransporte);
      idsTransportistas.add(idTransporte);
      transportistasPorId.set(idTransporte,{id:idTransporte,nombre:captura.nombre,horario:valorInformativo_(captura.horario),observaciones:valorInformativo_(captura.observaciones),imagen:captura.foto});

      aplicarListasCaptura_(idTransporte, captura, preparacionBodegas, {
        sheetTelefonos, sheetLugares, sheetVisita, sheetDireccion,
        mapLugares, setTelefonos, setVisitas, direccionesCache,
        telefonosPorId, destinosPorId
      });

      registrarResultadoStaging_(sheetCapturas, fila, idx, {
        idTransporte,
        estadoIdentidad: "NUEVO",
        estadoComparacion: "NUEVO",
        alcance: captura.alcance,
        cambios: [{tipo:"TRANSPORTISTA",accion:"CREAR",detalle:captura.nombre}],
        hash,
        estadoFinal: "Asignado"
      });
      procesados++;
      continue;
    }

    const idTransporte = identidad.id;
    const comparacion = compararCapturaConMaestro_(idTransporte, captura, preparacionBodegas, {
      transportistasPorId, telefonosPorId, destinosPorId, direccionesCache
    });

    if (comparacion.requiereRevision) {
      registrarResultadoStaging_(sheetCapturas, fila, idx, {
        idTransporte,
        estadoIdentidad: "ENCONTRADO",
        estadoComparacion: "REVISAR",
        alcance: captura.alcance,
        cambios: comparacion.cambios,
        hash,
        estadoFinal: "Revisado"
      });
      continue;
    }

    if (!comparacion.cambios.length) {
      registrarResultadoStaging_(sheetCapturas, fila, idx, {
        idTransporte,
        estadoIdentidad: "ENCONTRADO",
        estadoComparacion: "DUPLICADO",
        alcance: captura.alcance,
        cambios: [],
        hash,
        estadoFinal: "Procesado"
      });
      procesados++;
      continue;
    }

    actualizarDatosTransportistaExistente_(
      sheetTransportista,
      idTransporte,
      captura.horario,
      captura.foto,
      captura.observaciones
    );
    aplicarListasCaptura_(idTransporte, captura, preparacionBodegas, {
      sheetTelefonos, sheetLugares, sheetVisita, sheetDireccion,
      mapLugares, setTelefonos, setVisitas, direccionesCache,
      telefonosPorId, destinosPorId
    });

    registrarResultadoStaging_(sheetCapturas, fila, idx, {
      idTransporte,
      estadoIdentidad: "ENCONTRADO",
      estadoComparacion: "ACTUALIZAR",
      alcance: captura.alcance,
      cambios: comparacion.cambios,
      hash,
      estadoFinal: "Procesado"
    });
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
    if (String(data[i][idxId] || "").trim() !== idTransporte) continue;
    const fila = i + 1;
    if (idxHorario >= 0 && esValorInformativo_(nuevoHorario) &&
        normalizarTexto(data[i][idxHorario]) !== normalizarTexto(nuevoHorario)) {
      sheetTransportista.getRange(fila, idxHorario + 1).setValue(nuevoHorario);
    }
    if (idxImg >= 0 && nuevaFoto &&
        String(data[i][idxImg] || "").trim() !== String(nuevaFoto).trim()) {
      sheetTransportista.getRange(fila, idxImg + 1).setValue(nuevaFoto);
    }
    if (idxObs >= 0 && esValorInformativo_(nuevasObs) &&
        normalizarTexto(data[i][idxObs]) !== normalizarTexto(nuevasObs)) {
      sheetTransportista.getRange(fila, idxObs + 1).setValue(nuevasObs);
    }
    return;
  }
}

// ======================================================================
// FUNCIONES AUXILIARES
// ======================================================================

const DISTANCIA_MISMO_PREDIO_METROS_ = 100;
// Absorbe únicamente el error de redondeo de punto flotante en el límite exacto.
const TOLERANCIA_DISTANCIA_METROS_ = 0.01;

function crearMapaNombreAIds_(sheetTransportista) {
  const mapa = new Map();
  const data = sheetTransportista.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    const id = String(data[i][0] || "").trim();
    const nombre = normalizarTexto(data[i][1]);
    if (!id || !nombre) continue;
    agregarNombreId_(mapa, nombre, id);
  }
  return mapa;
}

function crearSetIdsTransportistas_(sheetTransportista) {
  const ids = new Set();
  const data = sheetTransportista.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    const id = String(data[i][0] || "").trim();
    if (id) ids.add(id);
  }
  return ids;
}

function agregarNombreId_(mapa, nombreKey, id) {
  const nombre = normalizarTexto(nombreKey);
  const value = String(id || "").trim();
  if (!nombre || !value) return;
  if (!mapa.has(nombre)) mapa.set(nombre, new Set());
  mapa.get(nombre).add(value);
}

function decidirIdentidadTransportista_(nombreKey, idExplicito, mapaNombres, idsExistentes) {
  const nombre = normalizarTexto(nombreKey);
  const idSeleccionado = String(idExplicito || "").trim();
  const idsNombre = nombre && mapaNombres.has(nombre)
    ? new Set(Array.from(mapaNombres.get(nombre)))
    : new Set();
  const existentes = new Set(Array.from(idsExistentes || []));

  if (idSeleccionado) {
    if (!existentes.has(idSeleccionado)) {
      return { accion: "REVISAR", mensaje: "CONFLICTO: EL ID DE TRANSPORTISTA SELECCIONADO NO EXISTE" };
    }
    if (idsNombre.size && !idsNombre.has(idSeleccionado)) {
      return {
        accion: "REVISAR",
        mensaje: "CONFLICTO: EL NOMBRE DE LA CAPTURA CORRESPONDE A OTRO ID. CONFIRME EL TRANSPORTISTA SELECCIONADO"
      };
    }
    return { accion: "EXISTENTE", id: idSeleccionado, origen: "ID_EXPLICITO" };
  }

  if (idsNombre.size === 1) {
    return { accion: "EXISTENTE", id: Array.from(idsNombre)[0], origen: "NOMBRE_UNICO" };
  }

  if (idsNombre.size > 1) {
    return {
      accion: "REVISAR",
      mensaje: "REVISAR IDENTIDAD: HAY VARIOS TRANSPORTISTAS CON EL MISMO NOMBRE. SELECCIONE IDTRANSPORTE"
    };
  }

  return nombre ? { accion: "CREAR" } : { accion: "OMITIR" };
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
    if (esValorInformativo_(direccion) && normalizarTexto(d.direccion) !== normalizarTexto(direccion)) {
      sheet.getRange(d.fila, 3).setValue(direccion); d.direccion = direccion;
    }
    if (punto && String(d.gps || "").trim() !== String(gps || "").trim()) {
      sheet.getRange(d.fila, 4).setValue(gps); d.gps = gps;
    }
    if (zona && normalizarTexto(d.zona) !== normalizarTexto(zona)) {
      sheet.getRange(d.fila, 5).setValue(zona); d.zona = zona;
    }
    return decision;
  }
  const idDireccion = generarId(sheet, "DIR-");
  sheet.appendRow([idDireccion, idTransporte, direccion, punto ? gps : "", zona || ""]);
  cache.push({fila:sheet.getLastRow(),id:idDireccion,idTransporte:idTransporte,direccion:direccion,gps:punto?gps:"",zona:zona || ""});
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

function prepararBodegas_(listaBodegas, gpsCaptura) {
  const items = (listaBodegas || []).filter(Boolean).map((bodega, index) => {
    const gps = index === 0 ? gpsCaptura : "";
    return { bodega: bodega, gps: gps, zonaInfo: resolverZona_(bodega, gps) };
  });
  return {
    items: items,
    conflicto: items.find(item => item.zonaInfo.conflicto) || null
  };
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

function asegurarColumnasStagingCapturas_(sheet) {
  const requeridas = ["IDTRANSPORTE","ESTADO IDENTIDAD","ESTADO COMPARACION","ALCANCE CAPTURA","CAMBIOS DETECTADOS","FECHA PROCESAMIENTO","PROCESADO POR","HASH CAPTURA"];
  const lastColumn = Math.max(sheet.getLastColumn(),1);
  const headers = sheet.getRange(1,1,1,lastColumn).getDisplayValues()[0].map(v=>String(v||"").trim().toUpperCase());
  requeridas.forEach(nombre => {
    if (headers.indexOf(nombre) >= 0) return;
    sheet.insertColumnAfter(sheet.getLastColumn());
    sheet.getRange(1,sheet.getLastColumn()).setValue(nombre);
    headers.push(nombre);
  });
}

function leerTransportistasPorId_(sheet) {
  const data = sheet.getDataRange().getValues(), out = new Map();
  if (!data.length) return out;
  const h = data[0].map(v=>String(v||"").trim().toUpperCase());
  const ix = n=>h.indexOf(n);
  for (let i=1;i<data.length;i++) {
    const id=String(data[i][ix("IDTRANSPORTE")]||"").trim();
    if(!id) continue;
    out.set(id,{
      id,
      nombre:ix("TRANSPORTE")>=0?String(data[i][ix("TRANSPORTE")]||"").trim():"",
      horario:ix("HORARIO")>=0?String(data[i][ix("HORARIO")]||"").trim():"",
      observaciones:ix("OBSERVACIONES")>=0?String(data[i][ix("OBSERVACIONES")]||"").trim():"",
      imagen:ix("IMAGEN")>=0?String(data[i][ix("IMAGEN")]||"").trim():""
    });
  }
  return out;
}

function leerLugaresPorId_(sheet) {
  const data=sheet.getDataRange().getValues(), out=new Map();
  for(let i=1;i<data.length;i++){
    const id=String(data[i][0]||"").trim(), nombre=String(data[i][1]||"").trim();
    if(id) out.set(id,nombre);
  }
  return out;
}

function leerTelefonosPorId_(sheet) {
  const data=sheet.getDataRange().getValues(), out=new Map();
  for(let i=1;i<data.length;i++){
    const id=String(data[i][1]||"").trim(), tel=normalizarTelefono(data[i][2]);
    if(!id||!tel) continue;
    if(!out.has(id)) out.set(id,new Set());
    out.get(id).add(normalizarTexto(tel));
  }
  return out;
}

function leerDestinosPorId_(sheetVisita, lugaresPorId) {
  const data=sheetVisita.getDataRange().getValues(), out=new Map();
  for(let i=1;i<data.length;i++){
    const id=String(data[i][1]||"").trim(), lugarId=String(data[i][2]||"").trim();
    const nombre=lugaresPorId.get(lugarId)||"";
    if(!id||!nombre) continue;
    if(!out.has(id)) out.set(id,new Set());
    out.get(id).add(normalizarTexto(nombre));
  }
  return out;
}

function esValorInformativo_(valor) {
  const k=normalizarTexto(valor);
  return Boolean(k) && !/^(no indica|no indicado|no indicada|no especificado|no especificada|sin dato|sin datos|n\/a|na)$/.test(k);
}

function valorInformativo_(valor) { return esValorInformativo_(valor) ? valor : ""; }

function hashCaptura_(captura) {
  const payload=[
    normalizarTexto(captura.nombre),
    (captura.telefonos||[]).map(normalizarTelefono).map(normalizarTexto).sort().join("|"),
    (captura.destinos||[]).map(normalizarTexto).sort().join("|"),
    (captura.bodegas||[]).map(normalizarTexto).sort().join("|"),
    String(captura.gps||"").trim(),
    normalizarTexto(captura.horario),
    String(captura.foto||"").trim(),
    normalizarTexto(captura.observaciones),
    String(captura.idExplicito||"").trim(),
    String(captura.alcance||"").trim().toUpperCase()
  ].join("¦");
  let h=2166136261;
  for(let i=0;i<payload.length;i++){h^=payload.charCodeAt(i);h=Math.imul(h,16777619);}
  return ("00000000"+(h>>>0).toString(16)).slice(-8).toUpperCase();
}

function compararCapturaConMaestro_(idTransporte, captura, preparacionBodegas, ctx) {
  const cambios=[], maestro=ctx.transportistasPorId.get(idTransporte)||{};
  if(esValorInformativo_(captura.horario) && normalizarTexto(maestro.horario)!==normalizarTexto(captura.horario))
    cambios.push({tipo:"HORARIO",accion:"ACTUALIZAR",valor:captura.horario});
  if(captura.foto && String(maestro.imagen||"").trim()!==String(captura.foto).trim())
    cambios.push({tipo:"IMAGEN",accion:"ACTUALIZAR",valor:captura.foto});
  if(esValorInformativo_(captura.observaciones) && normalizarTexto(maestro.observaciones)!==normalizarTexto(captura.observaciones))
    cambios.push({tipo:"OBSERVACIONES",accion:"ACTUALIZAR",valor:captura.observaciones});

  const actualesTel=ctx.telefonosPorId.get(idTransporte)||new Set();
  const capturadosTel=new Set();
  (captura.telefonos||[]).forEach(t=>{
    const tel=normalizarTelefono(t), k=normalizarTexto(tel);
    if(!k) return; capturadosTel.add(k);
    if(!actualesTel.has(k)) cambios.push({tipo:"TELEFONO",accion:"AGREGAR",valor:tel});
  });

  const actualesDest=ctx.destinosPorId.get(idTransporte)||new Set();
  const capturadosDest=new Set();
  (captura.destinos||[]).forEach(d=>{
    const k=normalizarTexto(d); if(!k) return; capturadosDest.add(k);
    if(!actualesDest.has(k)) cambios.push({tipo:"DESTINO",accion:"AGREGAR",valor:d});
  });

  const existentes=ctx.direccionesCache.filter(d=>d.idTransporte===idTransporte);
  (preparacionBodegas.items||[]).forEach(item=>{
    let direccion=item.bodega;
    if(esDireccionGenerica_(direccion) && parsearGps_(item.gps)) direccion="UBICACIÓN CAPTURADA POR GPS";
    const decision=decidirCoincidenciaBodega_(existentes,direccion,item.gps);
    if(!decision.registro){cambios.push({tipo:"BODEGA",accion:"AGREGAR",valor:direccion,gps:item.gps||""});return;}
    const d=decision.registro;
    if(esValorInformativo_(direccion) && normalizarTexto(d.direccion)!==normalizarTexto(direccion))
      cambios.push({tipo:"BODEGA_DIRECCION",accion:"ACTUALIZAR",valor:direccion});
    if(parsearGps_(item.gps) && String(d.gps||"").trim()!==String(item.gps||"").trim())
      cambios.push({tipo:"BODEGA_GPS",accion:"ACTUALIZAR",valor:item.gps});
    if(item.zonaInfo.zona && normalizarTexto(d.zona)!==normalizarTexto(item.zonaInfo.zona))
      cambios.push({tipo:"BODEGA_ZONA",accion:"ACTUALIZAR",valor:item.zonaInfo.zona});
  });

  let requiereRevision=false;
  if(String(captura.alcance||"").toUpperCase()==="COMPLETA"){
    const faltanTel=[...actualesTel].filter(k=>!capturadosTel.has(k));
    const faltanDest=[...actualesDest].filter(k=>!capturadosDest.has(k));
    if(faltanTel.length||faltanDest.length){
      requiereRevision=true;
      cambios.push({tipo:"BAJAS",accion:"REVISAR",detalle:"La captura completa omite datos existentes. Las eliminaciones nunca son automáticas.",telefonos:faltanTel.length,destinos:faltanDest.length});
    }
  }
  return {cambios,requiereRevision};
}

function aplicarListasCaptura_(idTransporte, captura, preparacionBodegas, ctx) {
  if(!ctx.telefonosPorId.has(idTransporte)) ctx.telefonosPorId.set(idTransporte,new Set());
  if(!ctx.destinosPorId.has(idTransporte)) ctx.destinosPorId.set(idTransporte,new Set());

  (captura.telefonos||[]).forEach(tel=>{
    const telNorm=normalizarTelefono(tel), k=normalizarTexto(telNorm);
    if(!k) return;
    const clave=idTransporte+"_"+k;
    if(!ctx.setTelefonos.has(clave)){
      const idTelefono=generarId(ctx.sheetTelefonos,"TEL-");
      ctx.sheetTelefonos.appendRow([idTelefono,idTransporte,telNorm,""]);
      ctx.setTelefonos.add(clave);ctx.telefonosPorId.get(idTransporte).add(k);
    }
  });

  (captura.destinos||[]).forEach(destino=>{
    if(!destino) return;
    const destinoKey=normalizarTexto(destino);
    let idLugares=ctx.mapLugares.get(destinoKey);
    if(!idLugares){
      idLugares=generarId(ctx.sheetLugares,"LUG-");
      ctx.sheetLugares.appendRow([idLugares,destino]);
      ctx.mapLugares.set(destinoKey,idLugares);
    }
    const claveVisita=idTransporte+"_"+idLugares;
    if(!ctx.setVisitas.has(claveVisita)){
      const idVisita=generarId(ctx.sheetVisita,"VIS-");
      ctx.sheetVisita.appendRow([idVisita,idTransporte,idLugares]);
      ctx.setVisitas.add(claveVisita);ctx.destinosPorId.get(idTransporte).add(destinoKey);
    }
  });

  (preparacionBodegas.items||[]).forEach(item=>{
    asignarBodegaPorDistancia_(ctx.sheetDireccion,ctx.direccionesCache,idTransporte,item.bodega,item.gps,item.zonaInfo.zona);
  });
}

function registrarResultadoStaging_(sheet, fila, idx, result) {
  const write=(i,v)=>{if(i>=0) sheet.getRange(fila,i+1).setValue(v);};
  write(idx.idTransporte,result.idTransporte||"");
  write(idx.estadoIdentidad,result.estadoIdentidad||"");
  write(idx.estadoComparacion,result.estadoComparacion||"");
  write(idx.alcance,result.alcance||"PARCIAL");
  write(idx.cambios,JSON.stringify(result.cambios||[]));
  write(idx.fechaProceso,new Date());
  write(idx.procesadoPor,"APPS SCRIPT V11");
  write(idx.hash,result.hash||"");
  if(result.estadoFinal) write(idx.estado,result.estadoFinal);
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

if (typeof module !== "undefined") module.exports = { decidirIdentidadTransportista_, agregarNombreId_, compararCapturaConMaestro_, hashCaptura_, esValorInformativo_, decidirCoincidenciaBodega_, prepararBodegas_, normalizarTexto, normalizarTelefono };
