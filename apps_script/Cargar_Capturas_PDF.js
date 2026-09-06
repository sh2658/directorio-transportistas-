/**
 * ==============================================================================
 * CARGADOR DE DATOS DESDE PDF A LA HOJA 'CAPTURAS' (MESA DE REVISIÓN)
 * ==============================================================================
 * Inserta los 22 transportistas extraídos del PDF en estado 'Existe - ¿Actualizar?'
 * o 'Nuevo - Por Revisar'.
 * 
 * 100% SEGURO: NO modifica las tablas oficiales (TRANSPORTISTA, BODEGA, DESTINO)
 * ni altera lo que se muestra en la web en vivo.
 * 
 * Te permite auditar, agregar o quitar destinos y teléfonos en AppSheet con calma
 * antes de dar el visto bueno (Aprobar).
 * ==============================================================================
 */

const DATOS_PDF_STAGING = [
  {
    "ID": "CAP-PDF-01",
    "FOTO": "Documento PDF Encomiendas",
    "ESTADO": "Existe - ¿Actualizar?",
    "IDTRANSPORTE": "transp4",
    "GPS": "",
    "TRANSPORTISTA": "TEMPISQUE",
    "TELEFONOS": "2221-3541\n2256-1962\n8789-3003",
    "DESTINOS": "BAGACES\nBELÉN\nCARTAGENA\nCAÑAS\nCOMUNIDAD\nEL LLANO\nFILADELFIA\nFLAMINGO\nGUARDIA\nHOJANCHA\nHUACAS\nJICARAL\nLAS JUNTAS DE ABANGARES\nLIBERIA\nLIMONAL\nMANSIÓN\nNANDAYURE\nNICOYA\nNOSARA\nPALMIRA\nPASO TEMPISQUE\nPLAYA HERMOSA\nPLAYA PANAMA\nPLAYAS DEL COCO\nPORTE GOLPE\nPOTREO\nPUERTO CARRILLO\nSANTA CRUZ\nSARDINAL\nSÁMARA\nTAMARINDO\nVILLAREAL",
    "BODEGAS": "BARRIO MEXICO",
    "HORARIO": "",
    "OBSERVACIONES": "[YA EXISTE: transp4] | Tels sugeridos: 8789-3003 | 10 destinos nuevos a revisar | Bodega PDF: BARRIO MEXICO"
  },
  {
    "ID": "CAP-PDF-02",
    "FOTO": "Documento PDF Encomiendas",
    "ESTADO": "Nuevo - Por Revisar",
    "IDTRANSPORTE": "",
    "GPS": "",
    "TRANSPORTISTA": "TRANSPORTES GUANACASTE",
    "TELEFONOS": "4080-4903",
    "DESTINOS": "27 DE ABRIL\nAVELLANAS\nBAGACES\nBELÉN\nBRASILITO\nCARTAGENA\nCAÑAS\nCHIRCÓ\nCOLORADO\nCOMUNIDAD\nEL LLANO\nFILADELFIA\nFLAMINGO\nGUARDIA\nHOJANCHA\nHUACAS\nJICARAL\nLA GARITA\nLAS JUNTAS DE ABANGARES\nLIBERTAD\nLOS JOCOTES\nMATAPALO\nNANDAYURE\nNICOYA\nPALMIRA\nPARAÍSO\nPASO TEMPISQUE\nPINILLA\nPLAYA GRANDE\nPLAYA HERMOSA\nPLAYA NEGRA\nPLAYA PANAMA\nPLAYA POTRERO\nPLAYAS DEL COCO\nPORTE GOLPE\nSAN PEDRO\nSANTA CRUZ\nSARDINAL\nTAMARINDO\nVILLAREAL",
    "BODEGAS": "BARRIO MEXICO",
    "HORARIO": "",
    "OBSERVACIONES": "[NUEVO EN PDF] Bodega: BARRIO MEXICO | 40 destinos extraídos para auditar."
  },
  {
    "ID": "CAP-PDF-03",
    "FOTO": "Documento PDF Encomiendas",
    "ESTADO": "Existe - ¿Actualizar?",
    "IDTRANSPORTE": "transp3",
    "GPS": "",
    "TRANSPORTISTA": "ENCOMIENDAS EL MACHO",
    "TELEFONOS": "8701-7325\n2695-2158",
    "DESTINOS": "BAGACES\nCAÑAS\nCHOMES\nFILADELFIA\nLAS JUNTAS\nLIBERIA\nNICOYA\nSANTA CRUZ\nTILARAN",
    "BODEGAS": "CALLE BLANCOS",
    "HORARIO": "",
    "OBSERVACIONES": "[YA EXISTE: transp3] | Tels sugeridos: 8701-7325 | 2 destinos nuevos a revisar | Bodega PDF: CALLE BLANCOS"
  },
  {
    "ID": "CAP-PDF-04",
    "FOTO": "Documento PDF Encomiendas",
    "ESTADO": "Nuevo - Por Revisar",
    "IDTRANSPORTE": "",
    "GPS": "",
    "TRANSPORTISTA": "PACIFICO EXPRESS GUANACASTE",
    "TELEFONOS": "4703-7979",
    "DESTINOS": "27 DE ABRIL\nBRASILITO\nCARTAGENA\nCHIRCÓ\nCOMUNIDAD\nEL COCO\nEL LLANO\nFILADELFIA\nFLAMINGO\nHOJANCHA\nHUACAS\nJICARAL\nLIBERIA\nLIMONAL\nMATAPALO\nNANDAYURE\nNICOYA\nPASO TEMPISQUE\nPINILLA\nPLAYA GRANDE\nPLAYA HERMOSA\nPLAYA POTRERO\nPORTE GOLPE\nSAN PEDRO\nSANTA CRUZ\nSARDINAL\nTAMARINDO\nVILLAREAL",
    "BODEGAS": "BARRIO MEXICO",
    "HORARIO": "",
    "OBSERVACIONES": "[NUEVO EN PDF] Bodega: BARRIO MEXICO | 28 destinos extraídos para auditar."
  },
  {
    "ID": "CAP-PDF-05",
    "FOTO": "Documento PDF Encomiendas",
    "ESTADO": "Existe - ¿Actualizar?",
    "IDTRANSPORTE": "b8816262",
    "GPS": "",
    "TRANSPORTISTA": "TRANSUR",
    "TELEFONOS": "2222-7494",
    "DESTINOS": "CHARARITA\nCHOMES\nCIUDAD CORTES\nCOLORADO\nCUERVITO\nCUIDAD NEILY\nDOMINICAL\nGOLFITO\nLA CUESTA\nMATAPALO\nOJOCHAL\nPALMAR NORTE\nPALMAR SUR\nPARRITA\nPASO CANOAS\nPIEDRAS BLANCAS\nQUEPOS\nRÍO CLARO\nSAN VITO\nSERENO\nUVITA",
    "BODEGAS": "BARRIO MEXICO",
    "HORARIO": "",
    "OBSERVACIONES": "[YA EXISTE: b8816262] | 7 destinos nuevos a revisar | Bodega PDF: BARRIO MEXICO"
  },
  {
    "ID": "CAP-PDF-06",
    "FOTO": "Documento PDF Encomiendas",
    "ESTADO": "Existe - ¿Actualizar?",
    "IDTRANSPORTE": "c6e2dbc8",
    "GPS": "",
    "TRANSPORTISTA": "ENCOMIENDAS PACIFICO CENTRAL",
    "TELEFONOS": "8837-7979\n8992-7283",
    "DESTINOS": "ATENAS\nEL ROBLE\nESPARZA\nESTERILLOS\nHERRADURA\nJACO\nJACÓ\nMANUEL ANTONIO\nOROTINA\nPARRITA\nPLAYA HERMOSA\nPUNTARENAS\nQUEBRADA GANADO\nQUEPOS\nTURRUCARES",
    "BODEGAS": "BARRIO MEXICO",
    "HORARIO": "",
    "OBSERVACIONES": "[YA EXISTE: c6e2dbc8] | Tels sugeridos: 8992-7283 | 1 destinos nuevos a revisar | Bodega PDF: BARRIO MEXICO"
  },
  {
    "ID": "CAP-PDF-07",
    "FOTO": "Documento PDF Encomiendas",
    "ESTADO": "Existe - ¿Actualizar?",
    "IDTRANSPORTE": "TRP-0046",
    "GPS": "",
    "TRANSPORTISTA": "TRANSPORTES GOLFO EXPRESS",
    "TELEFONOS": "2221-0338",
    "DESTINOS": "BARRANCA\nCÓBANO\nMIRAMAR\nMONTEZUMA\nPAQUERA\nSANTA TERESA",
    "BODEGAS": "PAVAS / BARRIO MEXICO\nBARRIO MEXICO",
    "HORARIO": "",
    "OBSERVACIONES": "[YA EXISTE: TRP-0046] | 2 destinos nuevos a revisar | Bodega PDF: PAVAS / BARRIO MEXICO\nBARRIO MEXICO"
  },
  {
    "ID": "CAP-PDF-08",
    "FOTO": "Documento PDF Encomiendas",
    "ESTADO": "Existe - ¿Actualizar?",
    "IDTRANSPORTE": "69833490",
    "GPS": "",
    "TRANSPORTISTA": "TRANSPORTES DAMAKA",
    "TELEFONOS": "2220-3400",
    "DESTINOS": "ATENAS\nGRECIA\nMAL PAÍS\nNARANJO\nPALMARES\nSAN RAMÓN\nSARCHÍ\nTAMBOR\nZARCERO",
    "BODEGAS": "PAVAS / BARRIO MEXICO\nPAVAS",
    "HORARIO": "",
    "OBSERVACIONES": "[YA EXISTE: 69833490] | Tels sugeridos: 2220-3400 | 4 destinos nuevos a revisar | Bodega PDF: PAVAS / BARRIO MEXICO\nPAVAS"
  },
  {
    "ID": "CAP-PDF-09",
    "FOTO": "Documento PDF Encomiendas",
    "ESTADO": "Existe - ¿Actualizar?",
    "IDTRANSPORTE": "TRP-0051",
    "GPS": "",
    "TRANSPORTISTA": "TRANSPORTES UPALA EXPRESS",
    "TELEFONOS": "8737-7373",
    "DESTINOS": "BIJAGUA\nCANELETE\nLA GARITA\nRIO BAGACES\nRIO NARANJO\nTURRUCARES",
    "BODEGAS": "PAVAS",
    "HORARIO": "",
    "OBSERVACIONES": "[YA EXISTE: TRP-0051] | 4 destinos nuevos a revisar | Bodega PDF: PAVAS"
  },
  {
    "ID": "CAP-PDF-10",
    "FOTO": "Documento PDF Encomiendas",
    "ESTADO": "Existe - ¿Actualizar?",
    "IDTRANSPORTE": "TRP-0040",
    "GPS": "",
    "TRANSPORTISTA": "TRANSPORTES CORCOVADO",
    "TELEFONOS": "2220-3400",
    "DESTINOS": "AMAPOLA\nCAÑAZA\nCOLONIA\nDRAKE\nLA PALMA\nMONTERREY\nUPALA",
    "BODEGAS": "PAVAS",
    "HORARIO": "",
    "OBSERVACIONES": "[YA EXISTE: TRP-0040] | Tels sugeridos: 2220-3400 | 7 destinos nuevos a revisar | Bodega PDF: PAVAS"
  },
  {
    "ID": "CAP-PDF-11",
    "FOTO": "Documento PDF Encomiendas",
    "ESTADO": "Existe - ¿Actualizar?",
    "IDTRANSPORTE": "TRP-A8FFEDEA",
    "GPS": "",
    "TRANSPORTISTA": "TRANSPORTES CENTENO",
    "TELEFONOS": "8930-9711",
    "DESTINOS": "JUAN VIÑAS\nLA SUIZA\nPAVONES\nPEJIBAYE\nPUERTO JIMÉNEZ\nSÁNDALO\nTUCURRIQUE\nTUIS\nTURRIALBA",
    "BODEGAS": "PAVAS / BARRIO MEXICO\nPAVAS",
    "HORARIO": "",
    "OBSERVACIONES": "[YA EXISTE: TRP-A8FFEDEA] | 2 destinos nuevos a revisar | Bodega PDF: PAVAS / BARRIO MEXICO\nPAVAS"
  },
  {
    "ID": "CAP-PDF-12",
    "FOTO": "Documento PDF Encomiendas",
    "ESTADO": "Existe - ¿Actualizar?",
    "IDTRANSPORTE": "991ac054",
    "GPS": "",
    "TRANSPORTISTA": "YUBA",
    "TELEFONOS": "2248-1573",
    "DESTINOS": "CAÑAS\nCHITARIA\nTRES X",
    "BODEGAS": "PAVAS / BARRIO MEXICO\nPASEO COLÓN",
    "HORARIO": "",
    "OBSERVACIONES": "[YA EXISTE: 991ac054] | 2 destinos nuevos a revisar | Bodega PDF: PAVAS / BARRIO MEXICO\nPASEO COLÓN"
  },
  {
    "ID": "CAP-PDF-13",
    "FOTO": "Documento PDF Encomiendas",
    "ESTADO": "Nuevo - Por Revisar",
    "IDTRANSPORTE": "",
    "GPS": "",
    "TRANSPORTISTA": "TRALI",
    "TELEFONOS": "2255-3867\n2221-6147",
    "DESTINOS": "BATAAN\nCAHUITA\nGUACIMO\nGUAPILES\nLA GUARIA\nLIMÓN\nNUEVO ARENAL\nPOCORA\nPUERTO VIEJO\nSIQUIRRES\nTILARAN\nVALLE LA ESTRELLA",
    "BODEGAS": "TIBÁS\nPASEO COLÓN",
    "HORARIO": "",
    "OBSERVACIONES": "[NUEVO EN PDF] Bodega: TIBÁS\nPASEO COLÓN | 12 destinos extraídos para auditar."
  },
  {
    "ID": "CAP-PDF-14",
    "FOTO": "Documento PDF Encomiendas",
    "ESTADO": "Nuevo - Por Revisar",
    "IDTRANSPORTE": "",
    "GPS": "",
    "TRANSPORTISTA": "TRANSPORTES LA COSTA",
    "TELEFONOS": "2258-0134",
    "DESTINOS": "BRIBRI\nPUERTO VIEJO\nRÍO FRÍO",
    "BODEGAS": "TIBÁS\nBARRIO MEXICO",
    "HORARIO": "",
    "OBSERVACIONES": "[NUEVO EN PDF] Bodega: TIBÁS\nBARRIO MEXICO | 3 destinos extraídos para auditar."
  },
  {
    "ID": "CAP-PDF-15",
    "FOTO": "Documento PDF Encomiendas",
    "ESTADO": "Nuevo - Por Revisar",
    "IDTRANSPORTE": "",
    "GPS": "",
    "TRANSPORTISTA": "TRANSPORTES VALEMOR",
    "TELEFONOS": "6141-3698",
    "DESTINOS": "BRIBRI\nGUAPILES\nHOME GREEK\nPUERTO VIEJO\nSIQUIRRES\nSIXAOLA\nTALAMANCA",
    "BODEGAS": "CALLE BLANCOS / PAVAS\nBARRIO MEXICO",
    "HORARIO": "",
    "OBSERVACIONES": "[NUEVO EN PDF] Bodega: CALLE BLANCOS / PAVAS\nBARRIO MEXICO | 7 destinos extraídos para auditar."
  },
  {
    "ID": "CAP-PDF-16",
    "FOTO": "Documento PDF Encomiendas",
    "ESTADO": "Nuevo - Por Revisar",
    "IDTRANSPORTE": "",
    "GPS": "",
    "TRANSPORTISTA": "CAJETA EXPRESS",
    "TELEFONOS": "2257-2050\n2221-7841",
    "DESTINOS": "AGUAS ZARCAS\nBOCA ARENAL\nCIUDAD QUESADA\nLIMON\nPITAL\nVALLE LA ESTRELLA\nZARCERO",
    "BODEGAS": "CALLE BLANCOS / PAVAS\nBARRIO MEXICO",
    "HORARIO": "",
    "OBSERVACIONES": "[NUEVO EN PDF] Bodega: CALLE BLANCOS / PAVAS\nBARRIO MEXICO | 7 destinos extraídos para auditar."
  },
  {
    "ID": "CAP-PDF-17",
    "FOTO": "Documento PDF Encomiendas",
    "ESTADO": "Existe - ¿Actualizar?",
    "IDTRANSPORTE": "6bde4f14",
    "GPS": "",
    "TRANSPORTISTA": "TRANSPORTES SAN CARLEÑOS",
    "TELEFONOS": "2236-8015\n8308-8632",
    "DESTINOS": "AGUAS ZARCAS\nBOCA ARENAL\nCERRO CORTEZ\nCIUDAD QUESADA\nEL TANQUE\nFLORENCIA\nFORTUNA\nJICARITO\nLA MARINA\nLA TIGRA\nLOS ANGELES\nLOS LIRIOS\nMONTERREY\nMUELLE\nPEÑAS BLANCAS\nPITAL\nPLATANAR\nQUEBRADA AZUL\nRIO CUARTO\nSAN ISIDRO\nSANTA CLARA\nSANTA RITA\nSANTA ROSA\nVALLE AZUL\nVENECIA",
    "BODEGAS": "TIBÁS\nBARRIO MEXICO",
    "HORARIO": "",
    "OBSERVACIONES": "[YA EXISTE: 6bde4f14] | 3 destinos nuevos a revisar | Bodega PDF: TIBÁS\nBARRIO MEXICO"
  },
  {
    "ID": "CAP-PDF-18",
    "FOTO": "Documento PDF Encomiendas",
    "ESTADO": "Existe - ¿Actualizar?",
    "IDTRANSPORTE": "TRP-3C53E761",
    "GPS": "",
    "TRANSPORTISTA": "TAVO",
    "TELEFONOS": "8379-0449\n8879-0449",
    "DESTINOS": "PAVON",
    "BODEGAS": "TIBÁS",
    "HORARIO": "",
    "OBSERVACIONES": "[YA EXISTE: TRP-3C53E761] | Tels sugeridos: 8379-0449, 8879-0449 | 1 destinos nuevos a revisar | Bodega PDF: TIBÁS"
  },
  {
    "ID": "CAP-PDF-19",
    "FOTO": "Documento PDF Encomiendas",
    "ESTADO": "Existe - ¿Actualizar?",
    "IDTRANSPORTE": "transp1",
    "GPS": "",
    "TRANSPORTISTA": "TRANSCAMA",
    "TELEFONOS": "2297-5858",
    "DESTINOS": "BUENOS AIRES\nCORONADO\nDOMINICAL\nLOS CHILES\nOJOCHAL\nPALMAR SUR\nPEJIBAYE\nPEREZ ZELEDÓN\nPURISCAL\nUVITA",
    "BODEGAS": "TIBÁS\nSAN JOSE / COCA COLA",
    "HORARIO": "",
    "OBSERVACIONES": "[YA EXISTE: transp1] | 4 destinos nuevos a revisar | Bodega PDF: TIBÁS\nSAN JOSE / COCA COLA"
  },
  {
    "ID": "CAP-PDF-20",
    "FOTO": "Documento PDF Encomiendas",
    "ESTADO": "Existe - ¿Actualizar?",
    "IDTRANSPORTE": "956616fc",
    "GPS": "",
    "TRANSPORTISTA": "TRANSRODEN",
    "TELEFONOS": "2771-2237",
    "DESTINOS": "BUENOS AIRES\nCORONADO\nCUIDAD CORTES\nDOMINICAL\nOJOCHAL\nPALMAR NORTE\nPEREZ ZELEDON\nSABALITO\nSAN VITO\nUVITA",
    "BODEGAS": "TIBÁS\nBARRIO MEXICO",
    "HORARIO": "",
    "OBSERVACIONES": "[YA EXISTE: 956616fc] | 7 destinos nuevos a revisar | Bodega PDF: TIBÁS\nBARRIO MEXICO"
  },
  {
    "ID": "CAP-PDF-21",
    "FOTO": "Documento PDF Encomiendas",
    "ESTADO": "Nuevo - Por Revisar",
    "IDTRANSPORTE": "",
    "GPS": "",
    "TRANSPORTISTA": "ENCOMIENDAS ENRIQUEZ",
    "TELEFONOS": "2221-1628\n8340-9525",
    "DESTINOS": "CÓBANO\nPALMAR NORTE\nPALMAR SUR\nPAQUERA\nSANTA TERESA",
    "BODEGAS": "PASEO COLÓN\nBARRIO MEXICO",
    "HORARIO": "",
    "OBSERVACIONES": "[NUEVO EN PDF] Bodega: PASEO COLÓN\nBARRIO MEXICO | 5 destinos extraídos para auditar."
  },
  {
    "ID": "CAP-PDF-22",
    "FOTO": "Documento PDF Encomiendas",
    "ESTADO": "Nuevo - Por Revisar",
    "IDTRANSPORTE": "",
    "GPS": "",
    "TRANSPORTISTA": "TRANSPORTES SUPER RAPIDO",
    "TELEFONOS": "8894-0307\n2220-2479",
    "DESTINOS": "GRECIA\nMAL PAÍS\nMONTEZUMA\nNARANJO\nPALMARES\nSARCHÍ",
    "BODEGAS": "PASEO COLÓN\nPAVAS",
    "HORARIO": "",
    "OBSERVACIONES": "[NUEVO EN PDF] Bodega: PASEO COLÓN\nPAVAS | 6 destinos extraídos para auditar."
  }
];

function cargarCapturasDesdePDF() {
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  const sheet = ss.getSheetByName(CONFIG.SHEET_NAME || 'CAPTURAS');
  
  if (!sheet) {
    SpreadsheetApp.getUi().alert('❌ Error: No se encontró la hoja CAPTURAS.');
    return;
  }

  const values = sheet.getDataRange().getValues();
  const rawHeaders = values[0];
  const headers = rawHeaders.map(h => String(h).trim());

  // Mapeo dinámico de columnas
  const idxId           = findColIndex_(headers, ["ID", "ID_CAPTURA", "KEY", "CODIGO"]);
  const idxFoto         = findColIndex_(headers, ["FOTO", "Foto"]);
  const idxEstado       = findColIndex_(headers, ["ESTADO", "Estado"]);
  const idxIdTransporte = findColIndex_(headers, ["IDTRANSPORTE", "ID TRANSPORTE"]);
  const idxGps          = findColIndex_(headers, ["GPS"]);
  const idxTransp       = findColIndex_(headers, ["NOMBRE DEL TRANSPORTISTA", "TRANSPORTISTA"]);
  const idxTelefonos    = findColIndex_(headers, ["TELEFONOS", "Teléfonos"]);
  const idxDestinos     = findColIndex_(headers, ["LUGARES O DESTINOS", "DESTINOS", "LUGARES"]);
  const idxBodegas      = findColIndex_(headers, ["DIRECCIONES O BODEGAS", "BODEGAS", "DIRECCION"]);
  const idxHorario      = findColIndex_(headers, ["HORARIO", "Horario"]);
  const idxObs          = findColIndex_(headers, ["OBSERVACIONES", "Observaciones"]);

  // IDs ya presentes en la hoja para evitar duplicados si se corre varias veces
  const idsExistentes = new Set();
  if (idxId !== -1) {
    for (let r = 1; r < values.length; r++) {
      const idVal = String(values[r][idxId] || '').trim();
      if (idVal) idsExistentes.add(idVal);
    }
  }

  let insertados = 0;
  let omitidos = 0;

  DATOS_PDF_STAGING.forEach(item => {
    if (idsExistentes.has(item.ID)) {
      omitidos++;
      return;
    }

    const nuevaFila = new Array(headers.length).fill('');
    if (idxId !== -1) nuevaFila[idxId] = item.ID;
    if (idxFoto !== -1) nuevaFila[idxFoto] = item.FOTO;
    if (idxEstado !== -1) nuevaFila[idxEstado] = item.ESTADO;
    if (idxIdTransporte !== -1 && item.IDTRANSPORTE) nuevaFila[idxIdTransporte] = item.IDTRANSPORTE;
    if (idxGps !== -1) nuevaFila[idxGps] = item.GPS;
    if (idxTransp !== -1) nuevaFila[idxTransp] = item.TRANSPORTISTA;
    if (idxTelefonos !== -1) nuevaFila[idxTelefonos] = item.TELEFONOS;
    if (idxDestinos !== -1) nuevaFila[idxDestinos] = item.DESTINOS;
    if (idxBodegas !== -1) nuevaFila[idxBodegas] = item.BODEGAS;
    if (idxHorario !== -1) nuevaFila[idxHorario] = item.HORARIO;
    if (idxObs !== -1) nuevaFila[idxObs] = item.OBSERVACIONES;

    sheet.appendRow(nuevaFila);
    idsExistentes.add(item.ID);
    insertados++;
  });

  const mensaje = '✅ Carga lista: ' + insertados + ' transportistas agregados a CAPTURAS para revisión. ' + 
                  (omitidos > 0 ? '(' + omitidos + ' ya existían y no se duplicaron).' : '');
  
  Logger.log(mensaje);
  try {
    SpreadsheetApp.getActiveSpreadsheet().toast(mensaje, 'Rutas CR', 8);
    SpreadsheetApp.getUi().alert('📥 Carga Exitosa', mensaje + '\n\nPuedes abrir AppSheet o revisar las filas en la hoja CAPTURAS.', SpreadsheetApp.getUi().ButtonSet.OK);
  } catch (e) {
    // Ejecución en segundo plano
  }
}
