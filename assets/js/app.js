/* No API keys, Sheet access, or untrusted HTML in the browser. */
(function(){
  'use strict';
  const C=window.RutasCore,$=id=>document.getElementById(id);
  let data=[],results=[],visible=0,position=null,map=null,cluster=null,userMarker=null,loadingMap=null;
  let mode='destino',busy=false,mapActive=false,hasSearch=false;
  const PAGE=15, query=$('consulta');
  function el(tag,text,cls){const node=document.createElement(tag);if(text!=null)node.textContent=text;if(cls)node.className=cls;return node;}
  function link(text,url,cls){const a=el('a',text,cls);a.href=url;if(/^https:/.test(url)){a.target='_blank';a.rel='noopener noreferrer';}return a;}
  function https(raw){try{const u=new URL(raw);return u.protocol==='https:'?u.href:'';}catch{return '';}}
  function notice(message){$('estadoDatos').textContent=message;}
  async function load(){
    if(busy)return;busy=true;$('buscar').disabled=true;$('reintentar').hidden=true;notice('Cargando directorio…');
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
    try{
      const response=await fetch(new URL('./data/transportistas.json',document.baseURI),{signal:controller.signal,cache:'no-store',credentials:'omit'});
      if(!response.ok)throw Error('HTTP '+response.status);
      const snapshot=C.validate(await response.json());data=snapshot.transportistas;
      const date=snapshot.generatedAt?new Date(snapshot.generatedAt):null;
      notice(data.length+' transportistas disponibles'+(date&&Number.isFinite(date.getTime())?' · Actualizado '+date.toLocaleDateString('es-CR'):''));
      suggestions();$('buscar').disabled=false;if(hasSearch)search(false);
    }catch(error){notice('No se pudo cargar el directorio. Puede reintentar.');$('reintentar').hidden=false;console.error('Carga del directorio:',error.message);}
    finally{clearTimeout(timer);busy=false;}
  }
  function suggestions(){const vals=mode==='destino'?data.flatMap(t=>t.destinos):data.map(t=>t.nombre);const unique=new Map();vals.forEach(v=>{if(!unique.has(C.key(v)))unique.set(C.key(v),v);});const frag=document.createDocumentFragment();[...unique.values()].sort((a,b)=>a.localeCompare(b,'es')).forEach(v=>{const o=el('option');o.value=v;frag.append(o);});$('sugerencias').replaceChildren(frag);}
  function nearest(t){if(!position)return Infinity;return Math.min(...t.bodegas.filter(C.validGPS).map(b=>C.distance(position,b)));}
  function search(focus=true){
    $('limpiar').hidden=!query.value;hasSearch=!!query.value.trim();
    if(!hasSearch){results=[];visible=0;$('tarjetas').replaceChildren();$('tituloResultados').textContent='Busque un destino o transportista';$('resumenResultados').textContent='';$('mas').hidden=true;renderMap();query.focus();return;}
    results=C.search(data,mode,query.value).sort((a,b)=>{const da=nearest(a),db=nearest(b);return da===db?a.nombre.localeCompare(b.nombre,'es'):da-db;});
    $('tituloResultados').textContent=results.length?'Transportistas disponibles':'Sin coincidencias';
    $('resumenResultados').textContent=results.length+' resultado'+(results.length===1?'':'s')+' para «'+query.value.trim()+'»'+(position?' · Distancia aproximada en línea recta':'');
    visible=0;$('tarjetas').replaceChildren();more();renderMap();if(focus)$('tituloResultados').focus();
  }
  function card(t){
    const article=el('article',null,'boleto'),photo=el('div',null,'foto-col'),info=el('div',null,'info-col');article.append(photo,info);
    const image=https(t.imagen);
    function fallback(){photo.replaceChildren(el('span','Imagen no disponible','foto-suplente'));}
    if(image){const button=el('button',null,'foto-boton'),img=el('img');button.type='button';button.setAttribute('aria-label','Ampliar imagen de '+t.nombre);img.alt=t.nombre;img.loading='lazy';img.decoding='async';img.width=130;img.height=130;img.src=image;img.addEventListener('error',fallback,{once:true});button.append(img);button.addEventListener('click',()=>{$('imagenAmpliada').src=image;$('imagenAmpliada').alt=t.nombre;$('visorImagen').showModal();});photo.append(button);}else fallback();
    info.append(el('h3',t.nombre));if(t.horario)info.append(el('p','Horario: '+t.horario));
    const phones=el('div',null,'acciones');t.telefonos.forEach(p=>{
      const local=p.numero.slice(3),display=(p.numero.startsWith('506')?'':'+507 ')+local.slice(0,4)+'-'+local.slice(4),description=p.contacto?' · '+p.contacto:'';
      phones.append(link('Llamar '+display+description,'tel:+'+p.numero,'btn-tel'));
      // WhatsApp is claimed only where the contact label explicitly says so.
      if(/WHATSAPP/i.test(p.contacto))phones.append(link('WhatsApp '+display,'https://wa.me/'+p.numero,'btn-waze'));
    });info.append(phones);
    const bodegas=el('details',null,'destinos');bodegas.open=true;bodegas.append(el('summary',t.bodegas.length+' bodega'+(t.bodegas.length===1?'':'s')));
    t.bodegas.forEach(b=>{
      const section=el('div',null,'bodega-item');if(b.zona)section.append(el('span',b.zona,'zona-tag'));section.append(el('p',b.direccion||'Dirección pendiente de confirmar'));
      if(C.validGPS(b)){if(position)section.append(el('p',C.distance(position,b).toFixed(1)+' km en línea recta','mono'));
        const actions=el('div',null,'acciones'),coords=b.lat+','+b.lng;
        actions.append(link('Abrir Waze','https://waze.com/ul?ll='+encodeURIComponent(coords)+'&navigate=yes','btn-waze'),link('Abrir Google Maps','https://www.google.com/maps/dir/?api=1&destination='+encodeURIComponent(coords),'btn-maps'));section.append(actions);
      }else section.append(el('p','Ubicación GPS pendiente'));
      bodegas.append(section);
    });info.append(bodegas);
    const destinations=el('details',null,'destinos');destinations.append(el('summary','Destinos ('+t.destinos.length+')'),el('p',t.destinos.join(' · ')||'Destinos pendientes de confirmar'));info.append(destinations);return article;
  }
  function more(){const frag=document.createDocumentFragment();results.slice(visible,visible+PAGE).forEach(t=>frag.append(card(t)));visible+=Math.min(PAGE,results.length-visible);$('tarjetas').append(frag);$('mas').hidden=visible>=results.length;}
  function setInteraction(active){mapActive=active;$('activarMapa').setAttribute('aria-pressed',String(active));$('activarMapa').textContent=active?'Bloquear interacción':'Activar interacción';if(!map)return;
    for(const name of ['scrollWheelZoom','dragging','touchZoom','doubleClickZoom','boxZoom','keyboard'])if(map[name])map[name][active?'enable':'disable']();
  }
  function style(href){if(document.querySelector('link[data-map-style="'+href+'"]'))return;const l=el('link');l.rel='stylesheet';l.href=href;l.dataset.mapStyle=href;document.head.append(l);}
  function script(src){return new Promise((resolve,reject)=>{const s=el('script');s.src=src;s.onload=resolve;s.onerror=()=>{s.remove();reject(Error('Recurso de mapa no disponible'));};document.head.append(s);});}
  async function initMap(){
    if(map)return;if(loadingMap)return loadingMap;
    loadingMap=(async()=>{
      style('./assets/vendor/leaflet/leaflet.css');style('./assets/vendor/markercluster/MarkerCluster.css');style('./assets/vendor/markercluster/MarkerCluster.Default.css');
      if(!window.L)await script('./assets/vendor/leaflet/leaflet.js');if(!window.L.markerClusterGroup)await script('./assets/vendor/markercluster/leaflet.markercluster.js');
      const L=window.L;map=L.map('mapa',{scrollWheelZoom:false,dragging:false,touchZoom:false,doubleClickZoom:false,boxZoom:false,keyboard:false,maxZoom:19}).setView([9.93,-84.09],8);
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'}).addTo(map).on('tileerror',()=>{$('estadoMapa').textContent='El mapa base no está disponible. Puede consultar las bodegas en la lista.';});
      cluster=L.markerClusterGroup({maxClusterRadius:50,showCoverageOnHover:false,zoomToBoundsOnClick:true,spiderfyOnMaxZoom:true,animate:!window.matchMedia('(prefers-reduced-motion: reduce)').matches,
        iconCreateFunction(group){const count=C.operatorCount(group.getAllChildMarkers().map(m=>({carrierId:m.options.carrierId})));return L.divIcon({html:String(count),className:'cluster-operadores',iconSize:L.point(44,44)});}});
      map.addLayer(cluster);map.on('click',()=>setInteraction(true));map.on('mouseout',()=>setInteraction(false));renderMap();if(position)showUser();
    })().finally(()=>{loadingMap=null;});return loadingMap;
  }
  function renderMap(){if(!map||!cluster)return;cluster.clearLayers();const points=C.markers(results),L=window.L;
    const pins=points.map(p=>{const m=L.marker([p.bodega.lat,p.bodega.lng],{carrierId:p.carrierId,title:p.nombre,alt:'Bodega de '+p.nombre});const content=el('div');content.append(el('strong',p.nombre),el('p',p.bodega.direccion||p.bodega.zona));m.bindPopup(content);return m;});cluster.addLayers(pins);
    if(pins.length)map.fitBounds(cluster.getBounds(),{padding:[24,24],maxZoom:15,animate:!window.matchMedia('(prefers-reduced-motion: reduce)').matches});
    $('estadoMapa').textContent=points.length+' bodegas con GPS · '+C.operatorCount(points)+' transportistas. Los puntos idénticos se separan al abrir el grupo.';
  }
  function showUser(){if(!map||!position)return;if(userMarker)map.removeLayer(userMarker);userMarker=window.L.circleMarker([position.lat,position.lng],{radius:7,color:'#087f5b',fillOpacity:1}).addTo(map).bindTooltip('Su ubicación');}
  $('busqueda').addEventListener('submit',e=>{e.preventDefault();if(data.length)search();});
  query.addEventListener('input',()=>{$('limpiar').hidden=!query.value;});
  $('limpiar').addEventListener('click',()=>{query.value='';search(false);});
  document.querySelectorAll('input[name="modo"]').forEach(r=>r.addEventListener('change',()=>{mode=r.value;$('etiquetaBusqueda').textContent=mode==='destino'?'¿A dónde envía?':'Nombre del transportista';query.placeholder=mode==='destino'?'Ej.: Liberia, Nosara…':'Ej.: Transcama';query.value='';suggestions();search(false);}));
  $('reintentar').addEventListener('click',load);$('mas').addEventListener('click',more);
  $('mostrarMapa').addEventListener('click',async()=>{const show=$('panelMapa').hidden;$('panelMapa').hidden=!show;$('mostrarMapa').setAttribute('aria-expanded',String(show));$('mostrarMapa').textContent=show?'Ocultar mapa':'Mostrar mapa';if(!show){setInteraction(false);return;}try{await initMap();map.invalidateSize();}catch{$('estadoMapa').textContent='No se pudo cargar el mapa. Cierre y vuelva a abrir para reintentar.';}});
  $('activarMapa').addEventListener('click',()=>setInteraction(!mapActive));
  $('mapa').addEventListener('mouseleave',()=>setInteraction(false));$('mapa').addEventListener('focusout',e=>{if(!$('mapa').contains(e.relatedTarget))setInteraction(false);});
  document.addEventListener('pointerdown',e=>{if(!$('panelMapa').contains(e.target))setInteraction(false);});
  document.addEventListener('keydown',e=>{if(e.key==='Escape')setInteraction(false);});window.addEventListener('blur',()=>setInteraction(false));
  if(window.ResizeObserver)new ResizeObserver(()=>{if(map&&!$('panelMapa').hidden)map.invalidateSize();}).observe($('mapa'));
  window.addEventListener('orientationchange',()=>setTimeout(()=>{if(map)map.invalidateSize();},200));
  $('ubicacion').addEventListener('click',()=>{
    if(!navigator.geolocation){$('estadoUbicacion').textContent='Su navegador no admite geolocalización.';return;}
    $('ubicacion').disabled=true;$('estadoUbicacion').textContent='Buscando su ubicación…';
    navigator.geolocation.getCurrentPosition(p=>{position={lat:p.coords.latitude,lng:p.coords.longitude};$('ubicacion').disabled=false;$('estadoUbicacion').textContent='Resultados ordenados por distancia en línea recta.';if(hasSearch)search(false);showUser();},()=>{$('ubicacion').disabled=false;$('estadoUbicacion').textContent='No se pudo obtener la ubicación. Puede seguir buscando.';},{timeout:10000,maximumAge:120000,enableHighAccuracy:false});
  });
  $('cerrarVisor').addEventListener('click',()=>$('visorImagen').close());$('visorImagen').addEventListener('close',()=>{$('imagenAmpliada').removeAttribute('src');});
  // Register after initial render; this worker never caches directory JSON.
  if('serviceWorker'in navigator&&location.protocol==='https:')window.addEventListener('load',()=>{navigator.serviceWorker.register('./sw.js').catch(()=>{});});
  load();
})();
