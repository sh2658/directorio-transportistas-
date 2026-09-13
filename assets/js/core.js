(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.RutasCore=factory();})(typeof globalThis==='object'?globalThis:this,function(){
  'use strict';
  const key=v=>String(v??'').trim().replace(/\s+/g,' ').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase();
  const validGPS=b=>!!b&&typeof b.lat==='number'&&typeof b.lng==='number'&&Number.isFinite(b.lat)&&Number.isFinite(b.lng)&&b.lat>=5&&b.lat<=11.5&&b.lng>=-88&&b.lng<=-82;
  function distance(a,b){const r=Math.PI/180,dlat=(b.lat-a.lat)*r,dlng=(b.lng-a.lng)*r;const x=Math.sin(dlat/2)**2+Math.cos(a.lat*r)*Math.cos(b.lat*r)*Math.sin(dlng/2)**2;return 6371*2*Math.atan2(Math.sqrt(x),Math.sqrt(Math.max(0,1-x)));}
  function validate(data){
    if(!data||data.schemaVersion!==1||!Array.isArray(data.transportistas)||!data.transportistas.length)throw Error('Contrato de datos incompatible o vacío');
    const ids=new Set(),bids=new Set(),slotFields=['LV_Apertura_1','LV_Cierre_1','LV_Apertura_2','LV_Cierre_2','SAB_Apertura_1','SAB_Cierre_1'];
    data.transportistas.forEach(t=>{
      if(!t||typeof t.id!=='string'||!t.id.trim()||ids.has(t.id)||typeof t.nombre!=='string'||!t.nombre.trim())throw Error('Transportista inválido o duplicado');ids.add(t.id);
      for(const f of ['horario','imagen'])if(typeof t[f]!=='string')throw Error('Campo inválido: '+f);
      for(const f of slotFields)if(f in t&&typeof t[f]!=='string')throw Error('Bloque horario inválido: '+f);
      if(!Array.isArray(t.destinos)||t.destinos.some(d=>typeof d!=='string'||!d.trim())||!Array.isArray(t.bodegas)||!Array.isArray(t.telefonos))throw Error('Listas inválidas');
      if(new Set(t.destinos.map(key)).size!==t.destinos.length)throw Error('Destinos duplicados');
      t.bodegas.forEach(b=>{if(!b||typeof b.id!=='string'||!b.id||bids.has(b.id)||typeof b.direccion!=='string'||typeof b.zona!=='string'||!((b.lat===null&&b.lng===null)||validGPS(b)))throw Error('Bodega inválida');bids.add(b.id);});
      const nums=new Set();t.telefonos.forEach(p=>{if(!p||typeof p.numero!=='string'||!/^(506[2-8]\d{7}|507\d{7,8})$/.test(p.numero)||typeof p.contacto!=='string'||nums.has(p.numero))throw Error('Teléfono inválido');nums.add(p.numero);});
    });return data;
  }
  function search(rows,mode,query){const q=key(query);if(!q)return [];const values=t=>mode==='destino'?t.destinos:[t.nombre];const exact=rows.filter(t=>values(t).some(v=>key(v)===q));return exact.length?exact:rows.filter(t=>values(t).some(v=>key(v).includes(q)));}
  function markers(rows){return rows.flatMap(t=>t.bodegas.filter(validGPS).map(b=>({carrierId:t.id,nombre:t.nombre,bodega:b})));}
  function operatorCount(items){return new Set(items.map(m=>m.carrierId)).size;}
  function initials(name){const ignored=new Set(['DE','DEL','LA','LAS','LOS','Y']);const words=String(name||'').trim().split(/\s+/).filter(w=>w&&!ignored.has(key(w)));return (words.slice(0,2).map(w=>[...w][0]).join('')||'CR').toUpperCase();}
  function displayName(value){return String(value||'').toLocaleLowerCase('es-CR').replace(/(^|[\s/(-])([a-záéíóúñ])/g,(m,a,b)=>a+b.toLocaleUpperCase('es-CR'));}
  function warehouseOrder(t,position){return t.bodegas.map((b,index)=>({b,index,km:position&&validGPS(b)?distance(position,b):Infinity})).sort((a,b)=>a.km-b.km||a.index-b.index);}
  function nearestDistance(t,position){return warehouseOrder(t,position)[0]?.km??Infinity;}
  function sortByNearest(rows,position){return rows.map((t,index)=>({t,index,km:nearestDistance(t,position)})).sort((a,b)=>a.km-b.km||a.index-b.index).map(x=>x.t);}
  function minutes(raw,period){let [h,m='0']=String(raw).split(':').map(Number);const p=key(period).replace(/\./g,'');if(p==='PM'&&h<12)h+=12;if(p==='AM'&&h===12)h=0;return h*60+m;}
  function extractTimes(text){const out=[];String(text||'').replace(/(\d{1,2})(?::(\d{2}))?\s*(A\.?\s*M\.?|P\.?\s*M\.?|MD)?/gi,(all,h,m,p)=>{const value=minutes(h+':'+(m||'00'),p);if(value>=0&&value<1440)out.push(value);return all;});return out;}
  function slotPair(a,c){if(!a||!c||!/^(?:[01]?\d|2[0-3]):[0-5]\d$/.test(a)||!/^(?:[01]?\d|2[0-3]):[0-5]\d$/.test(c))return null;return {open:minutes(a),close:minutes(c)};}
  function scheduleSlots(t){
    const explicit={lv:[slotPair(t.LV_Apertura_1,t.LV_Cierre_1),slotPair(t.LV_Apertura_2,t.LV_Cierre_2)].filter(Boolean),sab:[slotPair(t.SAB_Apertura_1,t.SAB_Cierre_1)].filter(Boolean)};
    if(explicit.lv.length||explicit.sab.length)return explicit;
    const raw=String(t.horario||'');if(!raw||/NO ESPECIFICADO|SERVICIO(?:S)? .*DIARIO|SERVICIO DIARIO/i.test(raw))return explicit;
    const split=raw.match(/\b(?:SAB|SÁBADO|SÁBADOS|S)\b/i),lvText=split?raw.slice(0,split.index):raw,sabText=split?raw.slice(split.index):'';
    const lv=extractTimes(lvText),sab=extractTimes(sabText),pairs=values=>values.length>=4?[{open:values[0],close:values[1]},{open:values[2],close:values[3]}]:values.length>=2?[{open:values[0],close:values[1]}]:[];
    return {lv:pairs(lv),sab:pairs(sab)};
  }
  const timeLabel=m=>String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0');
  const dayName=d=>['domingo','lunes','martes','miércoles','jueves','viernes','sábado'][d];
  function nextOpening(slots,day,now){for(let add=0;add<8;add++){const d=(day+add)%7,list=d>=1&&d<=5?slots.lv:d===6?slots.sab:[];for(const s of list)if(add>0||s.open>now)return {add,day:d,time:s.open};}return null;}
  function scheduleStatusAt(t,day,now){
    const slots=scheduleSlots(t),today=day>=1&&day<=5?slots.lv:day===6?slots.sab:[];
    if(!slots.lv.length&&!slots.sab.length)return {state:'unknown',label:'Horario por confirmar',detail:t.horario||'Consulte antes de enviar'};
    for(let i=0;i<today.length;i++){const s=today[i];if(now>=s.open&&now<s.close)return {state:'open',label:'Abierto',detail:'Cierra a las '+timeLabel(s.close)};const next=today[i+1];if(next&&now>=s.close&&now<next.open)return {state:'lunch',label:'Cerrado por almuerzo',detail:'Regresa a las '+timeLabel(next.open)};}
    const next=nextOpening(slots,day,now);return {state:'closed',label:'Cerrado',detail:next?(next.add===0?'Abre hoy a las ':'Abre '+dayName(next.day)+' a las ')+timeLabel(next.time):'Consulte el próximo horario'};
  }
  function costaRicaClock(date=new Date()){const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/Costa_Rica',weekday:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(date);const get=t=>parts.find(p=>p.type===t)?.value||'';const days={Sun:0,Mon:1,Tue:2,Wed:3,Thu:4,Fri:5,Sat:6};return {day:days[get('weekday')],minutes:Number(get('hour'))*60+Number(get('minute'))};}
  function scheduleStatus(t,date){const c=costaRicaClock(date);return scheduleStatusAt(t,c.day,c.minutes);}
  return {key,validGPS,distance,validate,search,markers,operatorCount,initials,displayName,warehouseOrder,nearestDistance,sortByNearest,scheduleSlots,scheduleStatusAt,scheduleStatus,costaRicaClock,timeLabel};
});
