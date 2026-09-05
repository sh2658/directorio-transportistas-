/**
 * Rutas CR - Geocodificador Automático para Google Sheets
 * 
 * Uso:
 * 1. Abre tu hoja de Google Sheets > Extensiones > Apps Script
 * 2. Pega este archivo en el editor de Apps Script.
 * 3. Ejecuta la función `geocodificarFilasSinCoordenadas()` manualmente
 *    o configura un activador de tiempo (Trigger) para que se ejecute diariamente.
 */

// Si deseas usar OpenCage Geocoder (gratuito hasta 2500 peticiones/día):
const OPENCAGE_API_KEY = ""; // Opcional: coloca tu clave aquí si no usas MapsService nativo

/**
 * Recorre la hoja y busca filas que tengan dirección pero no coordenadas
 */
function geocodificarFilasSinCoordenadas() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const hoja = ss.getActiveSheet();
  const datos = hoja.getDataRange().getValues();
  
  if (datos.length <= 1) return;
  
  const cabeceras = datos[0].map(c => c.toString().trim().toLowerCase());
  const colDir = cabeceras.findIndex(c => c.includes("direccion") || c.includes("bodega"));
  const colLat = cabeceras.findIndex(c => c.includes("lat"));
  const colLng = cabeceras.findIndex(c => c.includes("lng") || c.includes("lon"));
  
  if (colDir === -1 || colLat === -1 || colLng === -1) {
    Logger.log("No se encontraron las columnas de dirección, latitud o longitud.");
    return;
  }
  
  let procesadas = 0;
  
  for (let i = 1; i < datos.length; i++) {
    const direccion = datos[i][colDir]?.toString().trim();
    const latActual = datos[i][colLat];
    const lngActual = datos[i][colLng];
    
    // Si tiene dirección pero no tiene latitud/longitud
    if (direccion && (!latActual || !lngActual)) {
      const coords = geocodificarDireccion(direccion);
      if (coords) {
        hoja.getRange(i + 1, colLat + 1).setValue(coords.lat);
        hoja.getRange(i + 1, colLng + 1).setValue(coords.lng);
        procesadas++;
        Utilities.sleep(250); // Pausa respetuosa para evitar bloqueos por cuota
      }
    }
  }
  
  Logger.log(`Geocodificación finalizada. Se actualizaron ${procesadas} filas.`);
}

/**
 * Intenta geocodificar usando Google Maps API nativo de Apps Script (sin costo adicional)
 */
function geocodificarDireccion(direccion) {
  try {
    const consulta = direccion.includes("Costa Rica") ? direccion : `${direccion}, Costa Rica`;
    const respuesta = Maps.newGeocoder().geocode(consulta);
    
    if (respuesta.status === 'OK' && respuesta.results.length > 0) {
      const loc = respuesta.results[0].geometry.location;
      return { lat: loc.lat, lng: loc.lng };
    }
  } catch (e) {
    Logger.log(`Error geocodificando con Maps: ${e.message}`);
  }
  
  // Fallback con OpenCage si está configurada la clave
  if (OPENCAGE_API_KEY) {
    try {
      const url = `https://api.opencagedata.com/geocode/v1/json?q=${encodeURIComponent(direccion + ', Costa Rica')}&key=${OPENCAGE_API_KEY}&countrycode=cr&limit=1`;
      const resp = UrlFetchApp.fetch(url);
      const json = JSON.parse(resp.getContentText());
      if (json.results && json.results.length > 0) {
        const geo = json.results[0].geometry;
        return { lat: geo.lat, lng: geo.lng };
      }
    } catch (e) {
      Logger.log(`Error geocodificando con OpenCage: ${e.message}`);
    }
  }
  
  return null;
}
