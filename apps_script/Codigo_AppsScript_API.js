/**
 * Rutas CR - API Backend para Google Apps Script
 * Proyecto: https://script.google.com/u/0/home/projects/1rdeJAaznbGAu36FZAs6MqYnM3yAHvvZ9K0kWgExM070Vv_6i4ddJt9Jf
 * Hoja de Cálculo: https://docs.google.com/spreadsheets/d/1gXtF2KcCuy_cdYRNTbGrulNbB5SYw_mrN-H_AVSXOeA/edit
 * 
 * Despliegue: Como aplicación web (Web App)
 * Ejecutar como: Yo (tu cuenta)
 * Quién tiene acceso: Cualquier usuario (incluso anónimo)
 */

const ID_HOJA_CALCULO = "1gXtF2KcCuy_cdYRNTbGrulNbB5SYw_mrN-H_AVSXOeA";
const NOMBRE_HOJA = "Transportistas"; // Ajusta según el nombre de tu pestaña principal

function doGet(e) {
  try {
    const data = obtenerDatosTransportistas();
    
    const output = JSON.stringify(data);
    return ContentService
      .createTextOutput(output)
      .setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    const errOutput = JSON.stringify({ error: true, mensaje: error.toString() });
    return ContentService
      .createTextOutput(errOutput)
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Lee la hoja de cálculo y arma el arreglo JSON de transportistas
 */
function obtenerDatosTransportistas() {
  const ss = SpreadsheetApp.openById(ID_HOJA_CALCULO);
  const hoja = ss.getSheetByName(NOMBRE_HOJA) || ss.getSheets()[0];
  const filas = hoja.getDataRange().getValues();
  
  if (filas.length <= 1) return [];
  
  const cabeceras = filas[0].map(c => c.toString().trim().toLowerCase());
  const transportistas = [];
  
  // Mapeo flexible de columnas por nombre
  const idxId = encontrarIndice(cabeceras, ["id", "código", "codigo"]);
  const idxNombre = encontrarIndice(cabeceras, ["nombre", "transportista", "empresa"]);
  const idxHorario = encontrarIndice(cabeceras, ["horario", "horas", "atención"]);
  const idxObs = encontrarIndice(cabeceras, ["observaciones", "notas", "detalle"]);
  const idxImagen = encontrarIndice(cabeceras, ["imagen", "foto", "logo", "url_imagen"]);
  const idxBodegaDir = encontrarIndice(cabeceras, ["bodega", "dirección", "direccion", "ubicación"]);
  const idxLat = encontrarIndice(cabeceras, ["lat", "latitud"]);
  const idxLng = encontrarIndice(cabeceras, ["lng", "longitud", "lon"]);
  const idxZona = encontrarIndice(cabeceras, ["zona", "cantón", "canton", "provincia"]);
  const idxTelefonos = encontrarIndice(cabeceras, ["teléfono", "telefono", "telefonos", "contacto"]);
  const idxDestinos = encontrarIndice(cabeceras, ["destinos", "rutas", "lugares", "cobertura"]);
  const idxEstado = encontrarIndice(cabeceras, ["estado", "aprobado", "activo"]);

  for (let i = 1; i < filas.length; i++) {
    const f = filas[i];
    
    // Si tiene columna de estado, filtrar solo los aprobados/activos
    if (idxEstado !== -1) {
      const estado = f[idxEstado].toString().trim().toLowerCase();
      if (estado && estado !== "aprobado" && estado !== "activo" && estado !== "si") {
        continue;
      }
    }
    
    const nombre = idxNombre !== -1 ? f[idxNombre].toString().trim() : "";
    if (!nombre) continue; // Saltar filas vacías
    
    const id = idxId !== -1 && f[idxId] ? f[idxId].toString().trim() : `transp${i}`;
    const horario = idxHorario !== -1 ? f[idxHorario].toString().trim() : "";
    const observaciones = idxObs !== -1 ? f[idxObs].toString().trim() : "";
    
    // Formateo de imagen de Drive
    let rawImg = idxImagen !== -1 ? f[idxImagen].toString().trim() : "";
    let imagenUrl = formatearUrlDrive(rawImg);
    
    // Bodega principal
    const bodegas = [];
    const dir = idxBodegaDir !== -1 ? f[idxBodegaDir].toString().trim() : "";
    const lat = idxLat !== -1 ? parseFloat(f[idxLat]) || null : null;
    const lng = idxLng !== -1 ? parseFloat(f[idxLng]) || null : null;
    const zona = idxZona !== -1 ? f[idxZona].toString().trim() : "";
    
    if (dir || (lat && lng)) {
      bodegas.push({
        direccion: dir,
        lat: lat,
        lng: lng,
        zona: zona
      });
    }
    
    // Teléfonos (separados por coma, guión o barra)
    const telefonos = [];
    if (idxTelefonos !== -1 && f[idxTelefonos]) {
      const telsRaw = f[idxTelefonos].toString().split(/[,;/]/);
      telsRaw.forEach(t => {
        const limpio = t.replace(/[^\d+]/g, "").trim();
        if (limpio.length >= 7) {
          telefonos.push({ numero: limpio, contacto: "" });
        }
      });
    }
    
    // Destinos (separados por comas)
    const destinos = [];
    if (idxDestinos !== -1 && f[idxDestinos]) {
      const destRaw = f[idxDestinos].toString().split(/[,;\n]/);
      destRaw.forEach(d => {
        const destLimpio = d.trim().toUpperCase();
        if (destLimpio && !destinos.includes(destLimpio)) {
          destinos.push(destLimpio);
        }
      });
    }
    
    transportistas.push({
      id: id,
      nombre: nombre,
      horario: horario,
      observaciones: observaciones,
      imagen: imagenUrl,
      bodegas: bodegas,
      telefonos: telefonos,
      destinos: destinos
    });
  }
  
  return transportistas;
}

function encontrarIndice(cabeceras, variantes) {
  for (let i = 0; i < cabeceras.length; i++) {
    for (const v of variantes) {
      if (cabeceras[i].includes(v)) return i;
    }
  }
  return -1;
}

function formatearUrlDrive(url) {
  if (!url) return "";
  if (url.includes("drive.google.com/thumbnail")) return url;
  
  // Extraer ID de enlace estándar de Drive
  const match = url.match(/[-\w]{25,}/);
  if (match) {
    return `https://drive.google.com/thumbnail?id=${match[0]}&sz=w500`;
  }
  return url;
}
