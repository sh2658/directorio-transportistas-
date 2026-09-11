(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.RutasCore=factory();})(typeof globalThis==='object'?globalThis:this,function(){
  'use strict';
  const key=v=>String(v??'').trim().replace(/\s+/g,' ').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase();
  const validGPS=b=>!!b&&typeof b.lat==='number'&&typeof b.lng==='number'&&Number.isFinite(b.lat)&&Number.isFinite(b.lng)&&b.lat>=5&&b.lat<=11.5&&b.lng>=-88&&b.lng<=-82;
  function distance(a,b){const r=Math.PI/180,dlat=(b.lat-a.lat)*r,dlng=(b.lng-a.lng)*r;const x=Math.sin(dlat/2)**2+Math.cos(a.lat*r)*Math.cos(b.lat*r)*Math.sin(dlng/2)**2;return 6371*2*Math.atan2(Math.sqrt(x),Math.sqrt(Math.max(0,1-x)));}
  function validate(data){
    if(!data||data.schemaVersion!==1||!Array.isArray(data.transportistas)||!data.transportistas.length)throw Error('Contrato de datos incompatible o vacío');
    const ids=new Set(),bids=new Set();
    data.transportistas.forEach(t=>{
      if(!t||typeof t.id!=='string'||!t.id.trim()||ids.has(t.id)||typeof t.nombre!=='string'||!t.nombre.trim())throw Error('Transportista inválido o duplicado');
      ids.add(t.id);
      for(const f of ['horario','imagen'])if(typeof t[f]!=='string')throw Error('Campo inválido: '+f);
      if(!Array.isArray(t.destinos)||t.destinos.some(d=>typeof d!=='string'||!d.trim())||!Array.isArray(t.bodegas)||!Array.isArray(t.telefonos))throw Error('Listas inválidas');
      if(new Set(t.destinos.map(key)).size!==t.destinos.length)throw Error('Destinos duplicados');
      t.bodegas.forEach(b=>{if(!b||typeof b.id!=='string'||!b.id||bids.has(b.id)||typeof b.direccion!=='string'||typeof b.zona!=='string'||!((b.lat===null&&b.lng===null)||validGPS(b)))throw Error('Bodega inválida');bids.add(b.id);});
      const nums=new Set();t.telefonos.forEach(p=>{if(!p||typeof p.numero!=='string'||!/^(506[2-8]\d{7}|507\d{7,8})$/.test(p.numero)||typeof p.contacto!=='string'||nums.has(p.numero))throw Error('Teléfono inválido');nums.add(p.numero);});
    });return data;
  }
  function search(rows,mode,query){const q=key(query);if(!q)return [];
    // Exact matches win. No fuzzy expansion into other destinations or operators.
    const values=t=>mode==='destino'?t.destinos:[t.nombre];
    const exact=rows.filter(t=>values(t).some(v=>key(v)===q));
    return exact.length?exact:rows.filter(t=>values(t).some(v=>key(v).includes(q)));
  }
  function markers(rows){return rows.flatMap(t=>t.bodegas.filter(validGPS).map(b=>({carrierId:t.id,nombre:t.nombre,bodega:b})));}
  function operatorCount(markers){return new Set(markers.map(m=>m.carrierId)).size;}
  return {key,validGPS,distance,validate,search,markers,operatorCount};
});
