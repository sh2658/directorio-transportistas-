/* No API keys, Sheet access, or untrusted HTML in the browser. */
(function(){
  'use strict';
  const C=window.RutasCore,$=id=>document.getElementById(id);
  let data=[],results=[],visible=0,position=null,map=null,cluster=null,userMarker=null,loadingMap=null;
  let mode='destino',busy=false,mapActive=false,hasSearch=false,territory=null,territoryPromise=null,searchSequence=0,nearbyResults=false,onlyOpen=false;
  const PAGE=15,query=$('consulta'),iconPath=name=>'./assets/icons/'+name+'.svg';
  // Bodegas compartidas mal clasificadas históricamente como transportistas.
  const NON_CARRIER_IDS=new Set(['transp2','TRP-0046']);
  const PUBLIC_DIRECTORY_URL='https://sh2658.github.io/directorio-transportistas-/';
  const QR_URL='https://api.qrserver.com/v1/create-qr-code/?size=180x180&margin=8&data='+encodeURIComponent(PUBLIC_DIRECTORY_URL);
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
      data=snapshot.transportistas.filter(t=>!NON_CARRIER_IDS.has(t.id)).map(t=>({...t,imagen:images[t.id]||t.imagen}));
      const date=snapshot.generatedAt?new Date(snapshot.generatedAt):null;
      notice(data.length+' transportistas disponibles'+(date&&Number.isFinite(date.getTime())?' · Actualizado '+date.toLocaleDateString('es-CR'):''));
      suggestions();renderQuick();$('buscar').disabled=false;if(hasSearch)search(false);
    }catch(error){notice('No se pudo cargar el directorio. Puede reintentar.');$('reintentar').hidden=false;console.error('Carga del directorio:',error.message);}
    finally{clearTimeout(timer);busy=false;}
  }
  function suggestions(){const vals=mode==='destino'?data.flatMap(t=>t.destinos):data.map(t=>t.nombre);const unique=new Map();vals.forEach(v=>{if(!unique.has(C.key(v)))unique.set(C.key(v),v);});const frag=document.createDocumentFragment();[...unique.values()].sort((a,b)=>a.localeCompare(b,'es')).forEach(v=>{const o=el('option');o.value=v;frag.append(o);});$('sugerencias').replaceChildren(frag);const select=$('guiaTransportista');if(select){const current=select.value,frag2=document.createDocumentFragment(),first=el('option','Seleccione un transportista');first.value='';frag2.append(first);[...data].sort((a,b)=>a.nombre.localeCompare(b.nombre,'es')).forEach(t=>{const o=el('option',C.displayName(t.nombre));o.value=t.id;frag2.append(o);});select.replaceChildren(frag2);select.value=data.some(t=>t.id===current)?current:'';}}
  async function loadTerritory(){
    if(territory)return territory;if(territoryPromise)return territoryPromise;
    territoryPromise=Promise.all(['localidades_dta_cr.json','cantones_logistica_cr.json','homonimos_dta_cr.json'].map(async file=>{const response=await fetch(new URL('./assets/'+file,document.baseURI),{cache:'force-cache',credentials:'omit'});if(!response.ok)throw Error(file+' HTTP '+response.status);const value=await response.json();if(!value||Array.isArray(value)||typeof value!=='object')throw Error(file+' inválido');return value;})).then(([localities,cantons,homonyms])=>(territory={localities,cantons,homonyms})).catch(error=>{territoryPromise=null;throw error;});
    return territoryPromise;
  }
  function openRank(t){const state=C.scheduleStatus(t).state;return state==='open'?0:state==='lunch'?1:state==='unknown'?2:3;}
  function ordered(rows){let copy=[...rows];if(onlyOpen)copy=copy.filter(t=>C.scheduleStatus(t).state==='open');return position?C.sortByNearest(copy,position):copy.sort((a,b)=>openRank(a)-openRank(b)||a.nombre.localeCompare(b.nombre,'es'));}
  function setQuick(){const box=$('rapidos');if(box)box.hidden=hasSearch||mode!=='destino'||!data.length;}
  function renderQuick(){const box=$('rapidos');if(!box||!data.length)return;const counts=new Map();data.forEach(t=>t.destinos.forEach(d=>{const k=C.key(d),c=counts.get(k)||{value:d,n:0};c.n++;counts.set(k,c);}));const top=[...counts.values()].sort((a,b)=>b.n-a.n||a.value.localeCompare(b.value,'es')).slice(0,8),row=el('div',null,'rapidos-lista');top.forEach(item=>{const b=el('button',C.displayName(item.value),'chip chip-boton');b.type='button';b.addEventListener('click',()=>{query.value=item.value;search();});row.append(b);});box.replaceChildren(el('p','Destinos frecuentes','rapidos-titulo'),row);setQuick();}
  function renderRows(rows,title,summary,focus=true,prefix=null,isNearby=false){results=ordered(rows);const hiddenRows=onlyOpen?rows.length-results.length:0;if(hiddenRows)summary+=' · '+hiddenRows+' oculto'+(hiddenRows===1?'':'s')+' por no estar abierto'+(hiddenRows===1?'':'s')+' ahora';nearbyResults=isNearby;visible=0;$('tarjetas').replaceChildren();if(prefix)$('tarjetas').append(prefix);$('tituloResultados').textContent=title;$('resumenResultados').textContent=summary+(position&&results.length?' · Ordenados por la bodega más cercana':'');more();renderMap();if(focus)$('tituloResultados').focus();}
  function centersList(centers){const list=el('div',null,'territorial-centros');centers.forEach(center=>list.append(el('span',C.displayName(center),'chip')));return list;}
  function territorialNotice(title,message,centers=[]){const box=el('aside',null,'territorial-aviso');box.append(el('strong',title,'territorial-titulo'),el('p',message));if(centers.length)box.append(centersList(centers));return box;}
  function nearbyForPlace(place){const centers=(place.logistics||[]).filter(center=>data.some(t=>t.destinos.some(d=>C.destinationMatches(d,center))));return {centers,matches:C.searchNearby(data,centers)};}
  function renderNearby(original,place,focus=true){const nearby=nearbyForPlace(place),centers=nearby.centers,matches=nearby.matches,where=place.canton+(place.province?' · '+place.province:'');const detail=place.district&&C.key(place.district)!==C.key(place.canton)?' (distrito '+C.displayName(place.district)+')':'';const box=territorialNotice('Aún no hay servicio confirmado a '+C.displayName(original),matches.length?'Estos transportistas sí tienen registrado al menos uno de los centros cercanos o la cabecera de '+C.displayName(place.canton)+detail+', '+C.displayName(place.province)+'. Consulte directamente si pueden recibir o entregar su encomienda.':'No hay transportistas con destinos registrados en la cabecera o centros cercanos disponibles para '+C.displayName(original)+'.',centers);renderRows(matches,matches.length?'Transportistas que viajan por el área':'Sin rutas cercanas registradas',matches.length+' transportista'+(matches.length===1?'':'s')+' relacionado'+(matches.length===1?'':'s')+' con '+where,focus,box,true);}
  function viableHomonym(original,place){const exact=C.searchExactPlace(data,original,place),nearby=nearbyForPlace(place);return {place,exact,nearby:nearby.matches,centers:nearby.centers,count:exact.length||nearby.matches.length};}
  function renderAmbiguous(original,resolution,focus){
    const viable=resolution.locations.map(place=>viableHomonym(original,place)).filter(item=>item.count>0);
    if(viable.length===1){const item=viable[0];if(item.exact.length)renderExactHomonym(original,item.place);else renderNearby(original,item.place,focus);return;}
    if(!viable.length){const box=territorialNotice('Sin alternativas viables para '+C.displayName(original),'Se encontraron lugares con ese nombre, pero ninguno tiene transportistas registrados para ese destino ni para su cabecera o centros cercanos. Por eso no se muestran opciones que terminarían sin resultados.');renderRows([],'Sin rutas registradas','0 transportistas viables para «'+original+'»',focus,box);return;}
    results=[];visible=0;renderMap();$('tituloResultados').textContent='Necesitamos precisar el lugar';$('resumenResultados').textContent='Hay '+viable.length+' ubicaciones viables para «'+original+'».';$('mas').hidden=true;
    const box=territorialNotice('Este nombre tiene más de una opción viable','Elija únicamente entre las ubicaciones que sí tienen transportistas registrados para el destino, su cabecera o centros cercanos.'),options=el('div',null,'territorial-opciones');
    viable.forEach(item=>{const place=item.place,count=item.exact.length||item.nearby.length,button=el('button','Buscar '+C.displayName(original)+' en '+C.displayName(place.canton)+' · '+C.displayName(place.province)+' ('+count+')','territorial-opcion');button.type='button';button.addEventListener('click',()=>item.exact.length?renderExactHomonym(original,place):renderNearby(original,place));options.append(button);});box.append(options);$('tarjetas').replaceChildren(box);if(focus)$('tituloResultados').focus();
  }
  function renderExactHomonym(original,place){const matches=C.searchExactPlace(data,original,place),where=C.displayName(place.canton)+' · '+C.displayName(place.province);const box=territorialNotice(matches.length?'Asignación exacta confirmada':'Sin asignación territorial confirmada',matches.length?'Se muestran únicamente transportistas asignados exactamente a '+C.displayName(original)+'. No se incluyeron empresas por viajar a toda la provincia.':'No se mostrarán transportistas de '+C.displayName(place.province)+' únicamente por viajar a esa provincia. Para confirmar este homónimo, el lugar debe tener cantón y provincia registrados en AppSheet.');renderRows(matches,matches.length?'Transportistas para '+C.displayName(original):'Sin transportistas confirmados',matches.length+' resultado'+(matches.length===1?'':'s')+' exacto'+(matches.length===1?'':'s')+' en '+where,true,box);}
  function renderLexical(original,focus){const choices=C.lexicalDestinations(data,original),box=territorialNotice('No encontramos ese lugar en la referencia territorial',choices.length?'Puede intentar con uno de estos destinos registrados:':'Revise la escritura o pruebe con el cantón más cercano.');if(choices.length){const options=el('div',null,'territorial-opciones');choices.forEach(value=>{const button=el('button',C.displayName(value),'territorial-opcion');button.type='button';button.addEventListener('click',()=>{query.value=value;search();});options.append(button);});box.append(options);}renderRows([],'Sin coincidencias','0 resultados para «'+original+'»',focus,box);}
  async function search(focus=true){
    const sequence=++searchSequence;
    $('limpiar').hidden=!query.value;hasSearch=!!query.value.trim();setQuick();
    if(!hasSearch){results=[];nearbyResults=false;visible=0;$('tarjetas').replaceChildren();$('tituloResultados').textContent='Busque un destino o transportista';$('resumenResultados').textContent='';$('mas').hidden=true;$('buscar').disabled=false;$('resultados').removeAttribute('aria-busy');renderMap();query.focus();return;}
    const original=query.value.trim(),matches=C.search(data,mode,original);
    if(mode!=='destino'){renderRows(matches,matches.length?'Transportistas disponibles':'Sin coincidencias',matches.length+' resultado'+(matches.length===1?'':'s')+' para «'+original+'»',focus);return;}
    const exactMatches=C.searchExactDestination(data,original);
    if(exactMatches.length){renderRows(exactMatches,'Transportistas disponibles',exactMatches.length+' resultado'+(exactMatches.length===1?'':'s')+' exacto'+(exactMatches.length===1?'':'s')+' para «'+original+'»',focus);return;}
    $('buscar').disabled=true;$('resultados').setAttribute('aria-busy','true');$('tituloResultados').textContent='Consultando referencia territorial…';
    try{
      const ref=await loadTerritory();if(sequence!==searchSequence)return;const resolution=C.resolvePlace(original,ref.localities,ref.homonyms,ref.cantons);
      if(resolution.type==='ambiguous'){renderAmbiguous(original,resolution,focus);return;}
      if((resolution.type==='locality'||resolution.type==='canton')&&resolution.logistics.length){renderNearby(original,resolution,focus);return;}
      renderLexical(original,focus);
    }catch(error){if(sequence!==searchSequence)return;console.warn('Referencia territorial:',error.message);const fallback=exactMatches.length?exactMatches:matches;renderRows(fallback,fallback.length?'Transportistas disponibles':'Sin coincidencias',fallback.length+' resultado'+(fallback.length===1?'':'s')+' para «'+original+'»',focus,fallback.length?null:territorialNotice('Referencia territorial temporalmente no disponible','Puede buscar un destino registrado mientras se recupera la guía de localidades.'));}
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
  function phoneDisplay(number){return C.formatPhone(number);}
  function contactRow(p){
    const row=el('div',null,'contacto'),info=el('div',null,'contacto-info'),actions=el('div',null,'contacto-acciones'),display=phoneDisplay(p.numero),label='Llamar al '+display+(p.contacto?' · '+p.contacto:'');
    info.append(el('strong',display));if(p.contacto)info.append(el('span',C.displayName(p.contacto),'contacto-nota'));row.append(info);
    if(C.hasWhatsApp(p)){const wa=link('','https://wa.me/'+p.numero,'accion-contacto whatsapp whatsapp-icono','whatsapp');wa.setAttribute('aria-label','Enviar WhatsApp al '+display);wa.title='Enviar mensaje por WhatsApp';actions.append(wa);}
    const call=link('Llamar','tel:+'+p.numero,'accion-contacto llamada','phone');call.setAttribute('aria-label',label);call.title='Llamar al '+display;actions.append(call);row.append(actions);return row;
  }
  function contacts(t){
    const panel=el('section',null,'contactos'),LIMIT=3;panel.setAttribute('aria-label','Contactos');
    t.telefonos.slice(0,LIMIT).forEach(p=>panel.append(contactRow(p)));
    if(t.telefonos.length>LIMIT){const extra=t.telefonos.length-LIMIT,more=el('details',null,'telefonos-extra'),list=el('div',null,'telefonos-extra-lista');more.append(el('summary','Ver '+extra+' teléfono'+(extra===1?'':'s')+' más'));t.telefonos.slice(LIMIT).forEach(p=>list.append(contactRow(p)));more.append(list);panel.append(more);}
    return panel;
  }
  function warehouse(t,item,nearest){
    const b=item.b,section=el('section',null,'bodega-item'+(nearest?' bodega-cercana':'')),head=el('div',null,'bodega-cabecera');
    head.append(el('span',C.displayName(b.zona||'Zona por confirmar'),'zona-tag'));
    if(nearest)head.append(el('span','Más cercana','cercana-tag'));section.append(head,el('p',b.direccion?C.displayName(b.direccion):'Dirección pendiente de confirmar','direccion'));
    if(C.validGPS(b)){if(position)section.append(el('p',item.km.toFixed(1)+' km en línea recta','distancia'));
      const actions=el('div',null,'navegacion'),coords=b.lat+','+b.lng;
      const waze=link('Waze', 'https://waze.com/ul?ll='+encodeURIComponent(coords)+'&navigate=yes','icono-boton waze','navigation');waze.setAttribute('aria-label','Abrir esta bodega en Waze');waze.title='Abrir en Waze';
      const maps=link('Google Maps', 'https://www.google.com/maps/dir/?api=1&destination='+encodeURIComponent(coords),'icono-boton maps','map-pin');maps.setAttribute('aria-label','Abrir esta bodega en Google Maps');maps.title='Abrir en Google Maps';
      actions.append(waze,maps);section.append(actions);
    }else section.append(el('p','Ubicación GPS pendiente','aviso-suave'));return section;
  }
  function destinations(t){
    const details=el('details',null,'destinos'),summary=el('summary','Destinos ('+t.destinos.length+')'),body=el('div',null,'destinos-cuerpo'),chips=el('div',null,'chips');details.open=false;details.append(summary);body.append(chips);
    const paint=value=>{const q=C.key(value);chips.replaceChildren(...t.destinos.filter(d=>!q||C.key(d).includes(q)).map(d=>el('span',C.displayName(d),'chip')));if(!chips.children.length)chips.append(el('span','Sin coincidencias','chips-vacio'));};
    if(t.destinos.length>12){const label=el('label','Filtrar destinos','filtro-label'),input=el('input');input.type='search';input.placeholder='Ej.: Bagaces';input.className='filtro-destinos';input.setAttribute('aria-label','Filtrar destinos de '+t.nombre);input.addEventListener('input',()=>paint(input.value));body.prepend(label,input);}paint('');details.append(body);return details;
  }
  function card(t){
    const article=el('article',null,'transportista-card'+(nearbyResults?' sugerencia-card':'')),head=el('div',null,'card-head'),identity=el('div',null,'card-identidad');identity.append(el('h3',C.displayName(t.nombre)),scheduleBadge(t));if(nearbyResults)identity.append(el('span','Viaja por el área · confirme cobertura','cobertura-badge'));head.append(avatar(t),identity);article.append(head);
    if(t.telefonos.length)article.append(contacts(t));
    const details=el('details',null,'bodegas');details.open=true;details.append(el('summary',t.bodegas.length+' bodega'+(t.bodegas.length===1?'':'s')));
    const ordered=C.warehouseOrder(t,position);ordered.slice(0,1).forEach(item=>details.append(warehouse(t,item,!!position&&Number.isFinite(item.km))));
    if(ordered.length>1){const rest=ordered.slice(1),more=el('details',null,'bodegas-extra');more.append(el('summary','Ver '+rest.length+' bodega'+(rest.length===1?'':'s')+' más'));rest.forEach(item=>more.append(warehouse(t,item,false)));details.append(more);}
    const tools=el('div',null,'card-herramientas'),printButton=el('button','Imprimir guía de embalaje','boton-secundario boton-embalaje');printButton.type='button';printButton.addEventListener('click',()=>openPackingGuide(t));tools.append(printButton);
    article.append(details,destinations(t),tools);return article;
  }
  function fieldValue(id){return ($(id)?.value||'').trim();}
  function openPackingGuide(t=null){
    const d=$('guiaEmbalaje');if(!d)return;
    $('guiaTransportista').value=t?t.id:'';updateGuideDestinations();
    $('guiaDestino').value='';
    // El transportista no es el destinatario. Estos datos pertenecen al paquete.
    $('guiaDestinatario').value='';
    $('guiaTelefono').value='';
    $('guiaDireccion').value='';
    $('guiaRemitente').value='';
    $('guiaTelefonoRemitente').value='';
    $('guiaContenido').value='';
    $('guiaBultos').value='1';
    $('guiaObservaciones').value='';
    $('guiaTitulo').textContent=t?'Guía de embalaje · '+C.displayName(t.nombre):'Guía de embalaje';
    renderPackingGuide();
    if(typeof d.showModal==='function')d.showModal();else d.setAttribute('open','');
  }
  function guideCarrier(){const id=fieldValue('guiaTransportista');return data.find(t=>t.id===id)||null;}
  function updateGuideDestinations(){const list=$('sugerenciasDestinosGuia');if(!list)return;const t=guideCarrier(),frag=document.createDocumentFragment();(t?[...t.destinos]:[]).sort((a,b)=>a.localeCompare(b,'es')).forEach(v=>{const o=el('option');o.value=C.displayName(v);frag.append(o);});list.replaceChildren(frag);}
  function renderPackingGuide(){
    const preview=$('guiaPreview');if(!preview)return;
    const selected=guideCarrier(),carrier=selected?selected.nombre:'TRANSPORTISTA POR DEFINIR',dest=fieldValue('guiaDestino')||'DESTINO POR DEFINIR',receiver=fieldValue('guiaDestinatario')||'DESTINATARIO',receiverPhone=fieldValue('guiaTelefono')||'TELÉFONO',receiverAddress=fieldValue('guiaDireccion')||'DIRECCIÓN POR DEFINIR',sender=fieldValue('guiaRemitente')||'REMITENTE',senderPhone=fieldValue('guiaTelefonoRemitente')||'TELÉFONO',content=fieldValue('guiaContenido')||'CONTENIDO POR DEFINIR',notes=fieldValue('guiaObservaciones'),qty=Math.max(1,Math.min(50,Number(fieldValue('guiaBultos'))||1));
    preview.replaceChildren();if($('imprimirGuia'))$('imprimirGuia').disabled=!selected;
    for(let i=1;i<=qty;i++){const sheet=el('section',null,'guia-hoja');sheet.append(el('h2','EMBALAJE DE ENCOMIENDA'),el('div','BULTO '+i+' / '+qty,'guia-bulto'));
      const meta=el('div',null,'guia-meta');meta.append(el('strong',C.displayName(carrier)),el('span','Destino: '+C.displayName(dest)));sheet.append(meta);
      if(selected){const info=el('div',null,'guia-carrier'),phones=selected.telefonos.map(p=>C.formatPhone(p.numero)).join(' · '),b=C.warehouseOrder(selected,position)[0]?.b;if(phones)info.append(el('p','Teléfonos del transportista: '+phones));if(b&&(b.direccion||b.zona))info.append(el('p','Entregar en bodega: '+[b.zona&&C.displayName(b.zona),b.direccion].filter(Boolean).join(' · ')));if(info.children.length)sheet.append(info);}
      const grid=el('div',null,'guia-grid'),to=el('div',null,'guia-bloque'),from=el('div',null,'guia-bloque');
      to.append(el('h3','DESTINATARIO (PARA)'),el('p',receiver,'guia-nombre'),el('p',receiverPhone,'guia-telefono'),el('p',receiverAddress));
      from.append(el('h3','REMITENTE (DE)'),el('p',sender,'guia-nombre'),el('p',senderPhone,'guia-telefono'));
      grid.append(to,from);sheet.append(grid,el('p','Contenido: '+content,'guia-contenido-linea'));
      if(notes)sheet.append(el('p','Observaciones: '+notes,'guia-observaciones'));
      const promo=el('div',null,'guia-promo'),qr=el('img');qr.src=QR_URL;qr.alt='Código QR para abrir el directorio Rutas CR';qr.width=104;qr.height=104;qr.loading='eager';qr.referrerPolicy='no-referrer';
      const promoText=el('div');promoText.append(el('strong','Consulte transportistas y destinos en Rutas CR'),el('p',PUBLIC_DIRECTORY_URL));promo.append(qr,promoText);sheet.append(promo);
      preview.append(sheet);}
  }
  function printPackingGuide(){renderPackingGuide();document.body.classList.add('imprimiendo-guia');window.print();setTimeout(()=>document.body.classList.remove('imprimiendo-guia'),250);}
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
  document.querySelectorAll('input[name="modo"]').forEach(r=>r.addEventListener('change',()=>{mode=r.value;$('etiquetaBusqueda').textContent=mode==='destino'?'¿A dónde envía?':'Nombre del transportista';query.placeholder=mode==='destino'?'Ej.: Liberia':'Ej.: Transcama';query.value='';suggestions();search(false);}));
  $('soloAbiertos')?.addEventListener('click',()=>{onlyOpen=!onlyOpen;$('soloAbiertos').setAttribute('aria-pressed',String(onlyOpen));$('soloAbiertos').textContent=onlyOpen?'Mostrando solo abiertos':'Solo abiertos ahora';if(hasSearch)search(false);});
  $('reintentar').addEventListener('click',load);$('mas').addEventListener('click',more);
  $('mostrarMapa').addEventListener('click',async()=>{const show=$('panelMapa').hidden;$('panelMapa').hidden=!show;$('mostrarMapa').setAttribute('aria-expanded',String(show));$('mostrarMapa').textContent=show?'Ocultar mapa':'Mostrar mapa';if(!show){setInteraction(false);return;}try{await initMap();map.invalidateSize();}catch{$('estadoMapa').textContent='No se pudo cargar el mapa. Cierre y vuelva a abrir para reintentar.';}});
  $('activarMapa').addEventListener('click',()=>setInteraction(!mapActive));$('mapa').addEventListener('mouseleave',()=>setInteraction(false));$('mapa').addEventListener('focusout',e=>{if(!$('mapa').contains(e.relatedTarget))setInteraction(false);});
  document.addEventListener('pointerdown',e=>{if(!$('panelMapa').contains(e.target))setInteraction(false);});document.addEventListener('keydown',e=>{if(e.key==='Escape')setInteraction(false);});window.addEventListener('blur',()=>setInteraction(false));
  if(window.ResizeObserver)new ResizeObserver(()=>{if(map&&!$('panelMapa').hidden)map.invalidateSize();}).observe($('mapa'));window.addEventListener('orientationchange',()=>setTimeout(()=>{if(map)map.invalidateSize();},200));
  $('ubicacion').addEventListener('click',()=>{if(!navigator.geolocation){$('estadoUbicacion').textContent='Su navegador no admite geolocalización.';return;}$('ubicacion').disabled=true;$('estadoUbicacion').textContent='Buscando su ubicación…';navigator.geolocation.getCurrentPosition(p=>{position={lat:p.coords.latitude,lng:p.coords.longitude};$('ubicacion').disabled=false;$('estadoUbicacion').textContent='Resultados ordenados por la bodega más cercana.';if(hasSearch)search(false);showUser();},()=>{$('ubicacion').disabled=false;$('estadoUbicacion').textContent='No se pudo obtener la ubicación. Puede seguir buscando.';},{timeout:10000,maximumAge:120000,enableHighAccuracy:false});});
  $('cerrarVisor').addEventListener('click',()=>$('visorImagen').close());$('visorImagen').addEventListener('close',()=>{$('imagenAmpliada').removeAttribute('src');});
  $('abrirGuiaGeneral')?.addEventListener('click',()=>openPackingGuide());$('cerrarGuia')?.addEventListener('click',()=>{const d=$('guiaEmbalaje');if(typeof d.close==='function')d.close();else d.removeAttribute('open');});$('imprimirGuia')?.addEventListener('click',printPackingGuide);
  ['guiaDestino','guiaDestinatario','guiaTelefono','guiaDireccion','guiaRemitente','guiaTelefonoRemitente','guiaContenido','guiaBultos','guiaObservaciones'].forEach(id=>$(id)?.addEventListener('input',renderPackingGuide));
  $('guiaTransportista')?.addEventListener('change',()=>{updateGuideDestinations();renderPackingGuide();});
  window.addEventListener('afterprint',()=>document.body.classList.remove('imprimiendo-guia'));
  setInterval(updateScheduleBadges,60000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)updateScheduleBadges();});
  if('serviceWorker'in navigator&&location.protocol==='https:')window.addEventListener('load',()=>{navigator.serviceWorker.register('./sw.js').catch(()=>{});});load();
})();
