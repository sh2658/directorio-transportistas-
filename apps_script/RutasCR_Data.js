/* Pure contract shared by Apps Script and Node tests. Does not write Sheets. */
var RutasCRData = (function () {
  'use strict';
  function text(v) { return v == null ? '' : String(v).trim().replace(/\s+/g, ' '); }
  function key(v) { return text(v).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase(); }
  function table(rows, required, name) {
    if (!Array.isArray(rows) || !rows.length) throw Error('Falta tabla: ' + name);
    var headers = rows[0].map(key);
    required.forEach(function (h) { if (headers.indexOf(h) < 0) throw Error(name + ': falta columna ' + h); });
    if (new Set(headers.filter(Boolean)).size !== headers.filter(Boolean).length) throw Error(name + ': encabezados duplicados');
    return rows.slice(1).filter(function (r) { return r.some(function (v) { return text(v); }); }).map(function (r) {
      var out = Object.create(null);
      headers.forEach(function (h, i) { if (h) out[h] = text(r[i]); });
      return out;
    });
  }
  function index(rows, id, name) {
    var m = new Map();
    rows.forEach(function (r) {
      if (!r[id]) throw Error(name + ': ID vacío');
      if (m.has(r[id])) throw Error(name + ': ID duplicado ' + r[id]);
      m.set(r[id], r);
    });
    return m;
  }
  function gps(raw) {
    var match = text(raw).match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
    if (!match) return null;
    var lat = Number(match[1]), lng = Number(match[2]);
    // Conservative national envelope: excludes obviously corrupted points, includes Cocos Island.
    return lat >= 5 && lat <= 11.5 && lng >= -88 && lng <= -82 ? {lat:lat,lng:lng} : null;
  }
  function phone(raw) {
    var n = text(raw).replace(/[\s()+.-]/g, '');
    if (/^[2-8]\d{7}$/.test(n)) return '506' + n;
    if (/^506[2-8]\d{7}$/.test(n) || /^507\d{7,8}$/.test(n)) return n;
    return '';
  }
  function https(raw) { return /^https:\/\/[^\s<>"\\]+$/i.test(text(raw)) ? text(raw) : ''; }
  function build(source, options) {
    options = options || {};
    var trans = table(source.TRANSPORTISTA, ['IDTRANSPORTE','TRANSPORTE','HORARIO'], 'TRANSPORTISTA');
    var places = table(source.LUGARES, ['IDLUGARES','LUGAR'], 'LUGARES');
    var visits = table(source.VISITA, ['IDVISITA','IDTRANSPORTE','IDLUGARES'], 'VISITA');
    var dirs = table(source.DIRECCION, ['IDDDIREECION','IDTRANSPORTE','DIRECCION','GPS','ZONA'], 'DIRECCION');
    var phones = table(source.TELEFONOS, ['IDTELEFONO','IDTRANSPORTE','TELEFONO','CONTACTO'], 'TELEFONOS');
    var tm = index(trans,'IDTRANSPORTE','TRANSPORTISTA'), lm = index(places,'IDLUGARES','LUGARES');
    index(visits,'IDVISITA','VISITA'); index(dirs,'IDDDIREECION','DIRECCION'); index(phones,'IDTELEFONO','TELEFONOS');
    if (!trans.length) throw Error('Exportación vacía bloqueada');
    places.forEach(function(p){ if (!p.LUGAR) throw Error('LUGAR vacío: ' + p.IDLUGARES); });
    [visits,dirs,phones].forEach(function(rows){rows.forEach(function(r){
      if (!tm.has(r.IDTRANSPORTE)) throw Error('Referencia huérfana IDTRANSPORTE: ' + r.IDTRANSPORTE);
    });});
    var out = new Map(), diagnostics = [], names = new Map();
    trans.forEach(function(t){
      if (!t.TRANSPORTE) throw Error('TRANSPORTE vacío: ' + t.IDTRANSPORTE);
      // Never merge different source IDs just because names or GPS coincide.
      if (names.has(key(t.TRANSPORTE))) diagnostics.push({code:'REPEATED_NAME',id:t.IDTRANSPORTE,other:names.get(key(t.TRANSPORTE))});
      names.set(key(t.TRANSPORTE),t.IDTRANSPORTE);
      var image = https((options.imageUrls || {})[t.IDTRANSPORTE] || t.IMAGEN);
      if (t.IMAGEN && !image) diagnostics.push({code:'IMAGE_NOT_PUBLIC_URL',id:t.IDTRANSPORTE});
      out.set(t.IDTRANSPORTE,{id:t.IDTRANSPORTE,nombre:t.TRANSPORTE,horario:t.HORARIO,
        imagen:image,bodegas:[],telefonos:[],destinos:[]});
    });
    var pairs = new Set();
    visits.forEach(function(v){
      if (!lm.has(v.IDLUGARES)) throw Error('Referencia huérfana IDLUGARES: '+v.IDLUGARES);
      var pair = JSON.stringify([v.IDTRANSPORTE,v.IDLUGARES]);
      if (pairs.has(pair)) diagnostics.push({code:'DUPLICATE_VISIT',id:v.IDVISITA});
      pairs.add(pair);
      var dest = out.get(v.IDTRANSPORTE).destinos, name=lm.get(v.IDLUGARES).LUGAR;
      if (!dest.some(function(d){return key(d)===key(name);})) dest.push(name);
    });
    dirs.forEach(function(d){
      var point=gps(d.GPS);
      if (d.GPS && !point) diagnostics.push({code:'INVALID_GPS',id:d.IDDDIREECION});
      if (!d.GPS) diagnostics.push({code:'MISSING_GPS',id:d.IDDDIREECION});
      out.get(d.IDTRANSPORTE).bodegas.push({id:d.IDDDIREECION,direccion:d.DIRECCION,zona:d.ZONA,
        lat:point?point.lat:null,lng:point?point.lng:null});
    });
    phones.forEach(function(p){
      var n=phone(p.TELEFONO);
      if (!n) {diagnostics.push({code:'INVALID_PHONE',id:p.IDTELEFONO});return;}
      var list=out.get(p.IDTRANSPORTE).telefonos, prev=list.find(function(t){return t.numero===n;});
      if (prev) {if(p.CONTACTO && prev.contacto.indexOf(p.CONTACTO)<0) prev.contacto=[prev.contacto,p.CONTACTO].filter(Boolean).join(' / ');}
      else list.push({numero:n,contacto:p.CONTACTO});
    });
    var carriers=Array.from(out.values()).sort(function(a,b){return a.id<b.id?-1:a.id>b.id?1:0;});
    carriers.forEach(function(t){
      t.destinos.sort(); t.bodegas.sort(function(a,b){return a.id<b.id?-1:1;});
      t.telefonos.sort(function(a,b){return a.numero<b.numero?-1:1;});
    });
    return {schemaVersion:1,transportistas:carriers,diagnostics:diagnostics};
  }
  return {build:build,gps:gps,phone:phone,key:key};
})();
if (typeof module !== 'undefined') module.exports = RutasCRData;
