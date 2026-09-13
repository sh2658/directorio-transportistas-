/* No API keys, Sheet access, or untrusted HTML in the browser. */
(function(){
  'use strict';
  const C=window.RutasCore,$=id=>document.getElementById(id);
  let data=[],results=[],visible=0,position=null,map=null,cluster=null,userMarker=null,loadingMap=null;
  let mode='destino',busy=false,mapActive=false,hasSearch=false,territory=null,territoryPromise=null,searchSequence=0,nearbyResults=false;
  const PAGE=15,query=$('consulta'),iconPath=name=>'./assets/icons/'+name+'.svg';
  function el(tag,text,cls){const node=document.createElement(tag);if(text!=null)node.textContent=text;if(cls)node.className=cls;return node;}
  function icon(name,alt=''){const img=el('img');img.src=iconPath(name);img.alt=alt;img.width=20;img.height=20;img.className='icono';return img;}
  function link(text,url,cls,iconName){const a=el('a',null,cls);a.href=url;if(/^https:/.test(url)){a.target='_blank';a.rel='noopener noreferrer';}if(iconName)a.append(icon(iconName));if(text)a.append(el('span',text));return a;}
  function safeImage(raw){try{const u=new URL(raw,document.baseURI),base=new URL('./assets/carriers/',document.baseURI);if(u.protocol!=='https:')return '';if(raw.startsWith('./assets/carriers/')&&u.origin===base.origin&&u.pathname.startsWith(base.pathname))return u.href;return /^https:\/\//i.test(raw)?u.href:'';}catch{return '';}}
  function notice(message){$('estadoDatos').textContent=message;}
  async function load(){
    if(busy)return;busy=true;$('buscar').disabled=true;$('reintentar').hidden=true;notice('Cargando directorio…');
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
    try{
      const response=await fetch(new URL('./data/transportistas.json',document.baseURI),{signal:controller.signal,cache:'no-store',credentials:'omit'});
      if(!response.ok)throw Error('HTTP '+response.status);
      const snapshot=C.validate(await response.json());
      let images={};try{const manifest=await fetch(new URL('./assets/carriers/manifest.json',document.baseURI),{signal:controller.signal,cache:'no-store',credentials:'omit'});if(manifest.ok)images=(await manifest.json()).images||{};}catch(error){console.warn('Manifiesto de imágenes:',error.message);}
      data=snapshot.transportistas.map(t=>({...t,imagen:images[t.id]||t.imagen}));
      const date=snapshot.generatedAt?new Date(snapshot.generatedAt):null;
      notice(data.length+' transportistas disponibles'+(date&&Number.isFinite(date.getTime())?' · Actualizado '+date.toLocaleDateString('es-CR'):''));
      suggestions();$('buscar').disabled=false;if(hasSearch)search(false);
    }catch(error){notice('No se pudo cargar el directorio. Puede reintentar.');$('reintentar').hidden=false;console.error('Carga del directorio:',error.message);}
    finally{clearTimeout(timer);busy=false;}
  }
  function suggestions(){const vals=mode==='destino'?data.flatMap(t=>t.destinos):data.map(t=>t.nombre);const unique=new Map();vals.forEach(v=>{if(!unique.has(C.key(v)))unique.set(C.key(v),v);});const frag=document.createDocumentFragment();[...unique.values()].sort((a,b)=>a.localeCompare(b,'es')).forEach(v=>{const o=el('option');o.value=v;frag.append(o);});$('sugerencias').replaceChildren(frag);}
  async function loadTerritory(){
    if(territory)return territory;if(territoryPromise)return territoryPromise;
    territoryPromise=Promise.all(['localidades_dta_cr.json','cantones_logistica_cr.json','homonimos_dta_cr.json'].map(async file=>{const response=await fetch(new URL('./assets/'+file,document.baseURI),{cache:'force-cache',credentials:'omit'});if(!response.ok)throw Error(file+' HTTP '+response.status);const value=await response.json();if(!value||Array.isArray(value)||typeof value!=='object')throw Error(file+' inválido');return value;})).then(([localities,cantons,homonyms])=>(territory={localities,cantons,homonyms})).catch(error=>{territoryPromise=null;throw error;});
    return territoryPromise;
  }
  function ordered(rows){const copy=[...rows];return position?C.sortByNearest(copy,position):copy.sort((a,b)=>a.nombre.localeCompare(b.nombre,'es'));}
  function renderRows(rows,title,summary,focus=true,prefix=null,isNearby=false){results=ordered(rows);nearbyResults=isNearby;visible=0;$('tarjetas').replaceChildren();if(prefix)$('tarjetas').append(prefix);$('tituloResultados').textContent=title;$('resumenResultados').textContent=summary+(position&&results.length?' · Ordenados por la bodega más cercana':'');more();renderMap();if(focus)$('tituloResultados').focus();}
  function centersList(centers){const list=el('div',null,'territorial-centros');centers.forEach(center=>list.append(el('span',C.displayName(center),'chip')));return list;}
  function territorialNotice(title,message,centers=[]){const box=el('aside',null,'territorial-aviso');box.append(el('strong',title,'territorial-titulo'),el('p',message));if(centers.length)box.append(centersList(centers));return box;}
  function renderNearby(original,place,focus=true){const centers=place.logistics||[],matches=C.searchNearby(data,centers),where=place.canton+(place.province?' · '+place.province:'');const detail=place.district&&C.key(place.district)!==C.key(place.canton)?' (distrito '+C.displayName(place.district)+')':'';const box=territorialNotice('Aún no hay servicio confirmado a '+C.displayName(original),'Estos transportistas viajan por localidades cercanas o por el corredor de acceso a '+C.displayName(original)+', que pertenece a '+C.displayName(place.canton)+detail+', '+C.displayName(place.province)+'. Consulte directamente si pueden recibir o entregar su encomienda.',centers);renderRows(matches,matches.length?'Transportistas que viajan por el área':'Sin rutas cercanas registradas',matches.length+' transportista'+(matches.length===1?'':'s')+' relacionado'+(matches.length===1?'':'s')+' con '+where,focus,box,true);}
  function renderAmbiguous(original,resolution,focus){
    results=[];visible=0;renderMap();$('tituloResultados').textContent='Necesitamos precisar el lugar';$('resumenResultados').textContent='Hay '+resolution.locations.length+' lugares llamados «'+original+'» en Costa Rica.';$('mas').hidden=true;
    const box=territorialNotice('Este nombre tiene homónimos','Elija el cantón y la provincia correctos antes de mostrar rutas. Así evitamos recomendar transportistas de otro lugar.'),options=el('div',null,'territorial-opciones');
    resolution.locations.forEach(place=>{const button=el('button','Ver rutas cerca de '+C.displayName(place.canton)+' · '+C.displayName(place.province),'territorial-opcion');button.type='button';button.addEventListener('click',()=>renderNearby(original,place));options.append(button);});box.append(options);$('tarjetas').replaceChildren(box);if(focus)$('tituloResultados').focus();
  }
  function renderLexical(original,focus){const choices=C.lexicalDestinations(data,original),box=territorialNotice('No encontramos ese lugar en la referencia territorial',choices.length?'Puede intentar con uno de estos destinos registrados:':'Revise la escritura o pruebe con el cantón más cercano.');if(choices.length){const options=el('div',null,'territorial-opciones');choices.forEach(value=>{const button=el('button',C.displayName(value),'territorial-opcion');button.type='button';button.addEventListener('click',()=>{query.value=value;search();});options.append(button);});box.append(options);}renderRows([],'Sin coincidencias','0 resultados para «'+original+'»',focus,box);}
  async function search(focus=true){
    const sequence=++searchSequence;
    $('limpiar').hidden=!query.value;hasSearch=!!query.value.trim();
    if(!hasSearch){results=[];nearbyResults=false;visible=0;$('tarjetas').replaceChildren();$('tituloResultados').textContent='Busque un destino o transportista';$('resumenResultados').textContent='';$('mas').hidden=true;$('buscar').disabled=false;$('resultados').removeAttribute('aria-busy');renderMap();query.focus();return;}
    const original=query.value.trim(),matches=C.search(data,mode,original);
    if(mode!=='destino'){renderRows(matches,matches.length?'Transportistas disponibles':'Sin coincidencias',matches.length+' resultado'+(matches.length===1?'':'s')+' para «'+original+'»',focus);return;}
    $('buscar').disabled=true;$('resultados').setAttribute('aria-busy','true');$('tituloResultados').textContent='Consultando referencia territorial…';
    try{
      const ref=await loadTerritory();if(sequence!==searchSequence)return;const resolution=C.resolvePlace(original,ref.localities,ref.homonyms,ref.cantons);
      if(resolution.type==='ambiguous'){renderAmbiguous(original,resolution,focus);return;}
      if(matches.length){renderRows(matches,'Transportistas disponibles',matches.length+' resultado'+(matches.length===1?'':'s')+' para «'+original+'»',focus);return;}
      if((resolution.type==='locality'||resolution.type==='canton')&&resolution.logistics.length){renderNearby(original,resolution,focus);return;}
      renderLexical(original,focus);
    }catch(error){if(sequence!==searchSequence)return;console.warn('Referencia territorial:',error.message);renderRows(matches,matches.length?'Transportistas disponibles':'Sin coincidencias',matches.length+' resultado'+(matches.length===1?'':'s')+' para «'+original+'»',focus,matches.length?null:territorialNotice('Referencia territorial temporalmente no disponible','Puede buscar un destino registrado mientras se recupera la guía de localidades.'));}
    finally{if(sequence===searchSequence){$('buscar').disabled=false;$('resultados').removeAttribute('aria-busy');}}
  }
  function avatar(t){
    const wrap=el('div',null,'avatar'),src=safeImage(t.imagen);
    const fallback=()=>wrap.replaceChildren(el('span',C.initials(t.nombre),'avatar-iniciales'));
    if(!src){fallback();return wrap;}
    const button=el('button',null,'avatar-boton'),img=el('img');button.type='button';button.setAttribute('aria-label','Ampliar logotipo de '+t.nombre);img.alt='Logotipo de '+t.nombre;img.loading='lazy';img.decoding='async';img.width=88;img.height=88;img.src=src;img.addEventListener('error',fallback,{once:true});button.append(img);button.addEventListener('click',()=>{$('imagenAmpliada').src=src;$('imagenAmpliada').alt='Logotipo de '+t.nombre;$('visorImagen').showModal();});wrap.append(button);return wrap;
  }
  function scheduleBadge(t){
    const status=C.scheduleStatus(t),box=el('div',null,'horario-badge '+status.state);box.dataset.carrier=t.id;
    box.append(el('strong',status.label),el('span',status.detail));return box;
  }
  function updateScheduleBadges(){document.querySelectorAll('.horario-badge').forEach(box=>{const t=data.find(row=>row.id===box.dataset.carrier);if(!t)return;const s=C.scheduleStatus(t);box.className='horario-badge '+s.state;box.replaceChildren(el('strong',s.label),el('span',s.detail));});}
  function phoneDisplay(number){const local=number.slice(3),country=number.slice(0,3);return '+'+country+' '+local.slice(0,4)+'-'+local.slice(4);}
  function contacts(t){
    const panel=el('section',null,'contactos');panel.setAttribute('aria-label','Contactos');
    t.telefonos.forEach(p=>{const row=el('div',null,'contacto'),info=el('div',null,'contacto-info'),actions=el('div',null,'contacto-acciones'),display=phoneDisplay(p.numero),label='Llamar al '+display+(p.contacto?' · '+p.contacto:'');
      info.append(el('strong',display));if(p.contacto)info.append(el('span',C.displayName(p.contacto),'contacto-nota'));row.append(info);
      if(C.hasWhatsApp(p)){const wa=link('','https://wa.me/'+p.numero,'accion-contacto whatsapp whatsapp-icono','whatsapp');wa.setAttribute('aria-label','Enviar WhatsApp al '+display);wa.title='Enviar mensaje por WhatsApp';actions.append(wa);}
      const call=link('Llamar','tel:+'+p.numero,'accion-contacto llamada','phone');call.setAttribute('aria-label',label);call.title='Llamar al '+display;actions.append(call);row.append(actions);panel.append(row);
    });return panel;
  }
  function warehouse(t,item,nearest){
    const b=item.b,section=el('section',null,'bodega-item'+(nearest?' bodega-cercana':'')),head=el('div',null,'bodega-cabecera');
    head.append(el('span',C.displayName(b.zona||'Zona por confirmar'),'zona-tag'));
    if(nearest)head.append(el('span','Más cercana','cercana-tag'));section.append(head,el('p',b.direccion||'Dirección pendiente de confirmar','direccion'));
    if(C.validGPS(b)){if(position)section.append(el('p',item.km.toFixed(1)+' km en línea recta','distancia'));
      const actions=el('div',null,'navegacion'),coords=b.lat+','+b.lng;
      const waze=link('', 'https://waze.com/ul?ll='+encodeURIComponent(coords)+'&navigate=yes','icono-boton waze','waze');waze.setAttribute('aria-label','Abrir esta bodega en Waze');waze.title='Abrir en Waze';
      const maps=link('', 'https://www.google.com/maps/dir/?api=1&destination='+encodeURIComponent(coords),'icono-boton maps','google-maps');maps.setAttribute('aria-label','Abrir esta bodega en Google Maps');maps.title='Abrir en Google Maps';
      actions.append(waze,maps);section.append(actions);
    }else section.append(el('p','Ubicación GPS pendiente','aviso-suave'));return section;
  }
  function destinations(t){
    const details=el('details',null,'destinos'),summary=el('summary','Destinos ('+t.destinos.length+')'),body=el('div',null,'destinos-cuerpo'),chips=el('div',null,'chips');details.open=true;details.append(summary);body.append(chips);
    const paint=value=>{const q=C.key(value);chips.replaceChildren(...t.destinos.filter(d=>!q||C.key(d).includes(q)).map(d=>el('span',C.displayName(d),'chip')));if(!chips.children.length)chips.append(el('span','Sin coincidencias','chips-vacio'));};
    if(t.destinos.length>12){const label=el('label','Filtrar destinos','filtro-label'),input=el('input');input.type='search';input.placeholder='Ej.: Bagaces';input.className='filtro-destinos';input.setAttribute('aria-label','Filtrar destinos de '+t.nombre);input.addEventListener('input',()=>paint(input.value));body.prepend(label,input);}paint('');details.append(body);return details;
  }
  function card(t){
    const article=el('article',null,'transportista-card'+(nearbyResults?' sugerencia-card':'')),head=el('div',null,'card-head'),identity=el('div',null,'card-identidad');identity.append(el('h3',C.displayName(t.nombre)),scheduleBadge(t));if(nearbyResults)identity.append(el('span','Viaja por el área · confirme cobertura','cobertura-badge'));head.append(avatar(t),identity);article.append(head);
    if(t.telefonos.length)article.append(contacts(t));
    const details=el('details',null,'bodegas');details.open=true;details.append(el('summary',t.bodegas.length+' bodega'+(t.bodegas.length===1?'':'s')));
    const ordered=C.warehouseOrder(t,position);ordered.forEach((item,index)=>details.append(warehouse(t,item,!!position&&index===0&&Number.isFinite(item.km))));article.append(details,destinations(t));return article;
  }
  function more(){const frag=document.createDocumentFragment();results.slice(visible,visible+PAGE).forEach(t=>frag.append(card(t)));visible+=Math.min(PAGE,results.length-visible);$('tarjetas').append(frag);$('mas').hidden=visible>=results.length;}
  function setInteraction(active){mapActive=active;$('activarMapa').setAttribute('aria-pressed',String(active));$('activarMapa').textContent=active?'Bloquear interacción':'Activar interacción';if(!map)return;for(const name of ['scrollWheelZoom','dragging','touchZoom','doubleClickZoom','boxZoom','keyboard'])if(map[name])map[name][active?'enable':'disable']();}
  function style(href){if(document.querySelector('link[data-map-style="'+href+'"]'))return;const l=el('link');l.rel='stylesheet';l.href=href;l.dataset.mapStyle=href;document.head.append(l);}
  function script(src){return new Promise((resolve,reject)=>{const s=el('script');s.src=src;s.onload=resolve;s.onerror=()=>{s.remove();reject(Error('Recurso de mapa no disponible'));};document.head.append(s);});}
  async function initMap(){
    if(map)return;if(loadingMap)return loadingMap;loadingMap=(async()=>{
      style('./assets/vendor/leaflet/leaflet.css');style('./assets/vendor/markercluster/MarkerCluster.css');style('./assets/vendor/markercluster/MarkerCluster.Default.css');
      if(!window.L)await script('./assets/vendor/leaflet/leaflet.js');if(!window.L.markerClusterGroup)await script('./assets/vendor/markercluster/leaflet.markercluster.js');
      const L=window.L;map=L.map('mapa',{scrollWheelZoom:false,dragging:false,touchZoom:false,doubleClickZoom:false,boxZoom:false,keyboard:false,maxZoom:19}).setView([9.93,-84.09],8);
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'}).addTo(map).on('tileerror',()=>{$('estadoMapa').textContent='El mapa base no está disponible. Puede consultar las bodegas en la lista.';});
      cluster=L.markerClusterGroup({maxClusterRadius:50,showCoverageOnHover:false,zoomToBoundsOnClick:true,spiderfyOnMaxZoom:true,animate:!window.matchMedia('(prefers-reduced-motion: reduce)').matches,iconCreateFunction(group){const count=C.operatorCount(group.getAllChildMarkers().map(m=>({carrierId:m.options.carrierId})));return L.divIcon({html:String(count),className:'cluster-operadores',iconSize:L.point(44,44)});}});
      map.addLayer(cluster);map.on('click',()=>setInteraction(true));map.on('mouseout',()=>setInteraction(false));renderMap();if(position)showUser();
    })().finally(()=>{loadingMap=null;});return loadingMap;
  }
  function renderMap(){if(!map||!cluster)return;cluster.clearLayers();const points=C.markers(results),L=window.L,pins=points.map(p=>{const m=L.marker([p.bodega.lat,p.bodega.lng],{carrierId:p.carrierId,title:p.nombre,alt:'Bodega de '+p.nombre}),content=el('div');content.append(el('strong',C.displayName(p.nombre)),el('p',p.bodega.direccion||p.bodega.zona));m.bindPopup(content);return m;});cluster.addLayers(pins);if(pins.length)map.fitBounds(cluster.getBounds(),{padding:[24,24],maxZoom:15,animate:!window.matchMedia('(prefers-reduced-motion: reduce)').matches});$('estadoMapa').textContent=points.length+' bodegas con GPS · '+C.operatorCount(points)+' transportistas. Los puntos idénticos se separan al abrir el grupo.';}
  function showUser(){if(!map||!position)return;if(userMarker)map.removeLayer(userMarker);userMarker=window.L.circleMarker([position.lat,position.lng],{radius:7,color:'#087f5b',fillOpacity:1}).addTo(map).bindTooltip('Su ubicación');}
  $('busqueda').addEventListener('submit',e=>{e.preventDefault();if(data.length)search();});query.addEventListener('input',()=>{$('limpiar').hidden=!query.value;});$('limpiar').addEventListener('click',()=>{query.value='';search(false);});
  document.querySelectorAll('input[name="modo"]').forEach(r=>r.addEventListener('change',()=>{mode=r.value;$('etiquetaBusqueda').textContent=mode==='destino'?'¿A dónde envía?':'Nombre del transportista';query.placeholder=mode==='destino'?'Ej.: Liberia, Nosara…':'Ej.: Transcama';query.value='';suggestions();search(false);}));
  $('reintentar').addEventListener('click',load);$('mas').addEventListener('click',more);
  $('mostrarMapa').addEventListener('click',async()=>{const show=$('panelMapa').hidden;$('panelMapa').hidden=!show;$('mostrarMapa').setAttribute('aria-expanded',String(show));$('mostrarMapa').textContent=show?'Ocultar mapa':'Mostrar mapa';if(!show){setInteraction(false);return;}try{await initMap();map.invalidateSize();}catch{$('estadoMapa').textContent='No se pudo cargar el mapa. Cierre y vuelva a abrir para reintentar.';}});
  $('activarMapa').addEventListener('click',()=>setInteraction(!mapActive));$('mapa').addEventListener('mouseleave',()=>setInteraction(false));$('mapa').addEventListener('focusout',e=>{if(!$('mapa').contains(e.relatedTarget))setInteraction(false);});
  document.addEventListener('pointerdown',e=>{if(!$('panelMapa').contains(e.target))setInteraction(false);});document.addEventListener('keydown',e=>{if(e.key==='Escape')setInteraction(false);});window.addEventListener('blur',()=>setInteraction(false));
  if(window.ResizeObserver)new ResizeObserver(()=>{if(map&&!$('panelMapa').hidden)map.invalidateSize();}).observe($('mapa'));window.addEventListener('orientationchange',()=>setTimeout(()=>{if(map)map.invalidateSize();},200));
  $('ubicacion').addEventListener('click',()=>{if(!navigator.geolocation){$('estadoUbicacion').textContent='Su navegador no admite geolocalización.';return;}$('ubicacion').disabled=true;$('estadoUbicacion').textContent='Buscando su ubicación…';navigator.geolocation.getCurrentPosition(p=>{position={lat:p.coords.latitude,lng:p.coords.longitude};$('ubicacion').disabled=false;$('estadoUbicacion').textContent='Resultados ordenados por la bodega más cercana.';if(hasSearch)search(false);showUser();},()=>{$('ubicacion').disabled=false;$('estadoUbicacion').textContent='No se pudo obtener la ubicación. Puede seguir buscando.';},{timeout:10000,maximumAge:120000,enableHighAccuracy:false});});
  $('cerrarVisor').addEventListener('click',()=>$('visorImagen').close());$('visorImagen').addEventListener('close',()=>{$('imagenAmpliada').removeAttribute('src');});
  setInterval(updateScheduleBadges,60000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)updateScheduleBadges();});
  if('serviceWorker'in navigator&&location.protocol==='https:')window.addEventListener('load',()=>{navigator.serviceWorker.register('./sw.js').catch(()=>{});});load();
})();
