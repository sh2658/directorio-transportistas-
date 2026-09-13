/** Standalone Apps Script project. Add RutasCR_Data.js as RutasCR_Data.gs.
 * Only reads Sheets. All secrets live in Script Properties. No public doPost.
 */
function rutasCRConfig_() {
  var p=PropertiesService.getScriptProperties();
  function need(k){var v=p.getProperty(k);if(!v)throw Error('Falta propiedad '+k);return v;}
  var branch=need('RUTAS_GITHUB_BRANCH');
  if (!/^[\w./-]+$/.test(branch)) throw Error('Rama inválida');
  return {p:p,sheet:need('RUTAS_SHEET_ID'),owner:need('RUTAS_GITHUB_OWNER'),repo:need('RUTAS_GITHUB_REPO'),
    branch:branch,path:'data/transportistas.json',token:need('RUTAS_GITHUB_PAT')};
}
function rutasCRPrepararConfiguracion() {
  var p=PropertiesService.getScriptProperties();
  p.setProperties({
    RUTAS_GITHUB_OWNER:'sh2658',
    RUTAS_GITHUB_REPO:'directorio-transportistas-',
    RUTAS_GITHUB_BRANCH:'main',
    RUTAS_SYNC_ENABLED:'false',
    RUTAS_PUBLIC_DATA_APPROVED:'false',
    RUTAS_AUTO_DESTINATION_REMOVALS:'true',
    RUTAS_AUTO_PHONE_REMOVALS:'true',
    RUTAS_IMAGE_SYNC_ENABLED:'false'
  },false);
  return {state:'prepared',syncEnabled:false,publicDataApproved:false,sheetConfigured:!!p.getProperty('RUTAS_SHEET_ID')};
}
function rutasCREstado() {
  var p=PropertiesService.getScriptProperties();
  return {syncEnabled:p.getProperty('RUTAS_SYNC_ENABLED')==='true',imageSyncEnabled:p.getProperty('RUTAS_IMAGE_SYNC_ENABLED')==='true',publicDataApproved:p.getProperty('RUTAS_PUBLIC_DATA_APPROVED')==='true',branch:p.getProperty('RUTAS_GITHUB_BRANCH')||'',tokenConfigured:!!p.getProperty('RUTAS_GITHUB_PAT'),imageFolderConfigured:!!p.getProperty('RUTAS_APPSHEET_IMAGE_FOLDER_ID'),lastOk:p.getProperty('RUTAS_LAST_OK')||'',lastCommit:p.getProperty('RUTAS_LAST_COMMIT')||'',lastError:p.getProperty('RUTAS_LAST_ERROR')||'',imagesLastOk:p.getProperty('RUTAS_IMAGES_LAST_OK')||'',imagesLastError:p.getProperty('RUTAS_IMAGES_LAST_ERROR')||''};
}
function rutasCRActivar() {
  var c=rutasCRConfig_(),test=rutasCRRequest_(c,'get','/branches/'+encodeURIComponent(c.branch));
  if(test.status!==200)throw Error('No se pudo validar GitHub. HTTP '+test.status);
  c.p.setProperties({RUTAS_PUBLIC_DATA_APPROVED:'true',RUTAS_SYNC_ENABLED:'true'});
  rutasCRInstalar();
  return rutasCREstado();
}
function rutasCRRead_(id) {
  var ss=SpreadsheetApp.openById(id), tables={};
  ['TRANSPORTISTA','LUGARES','VISITA','DIRECCION','TELEFONOS'].forEach(function(name){
    var sh=ss.getSheetByName(name);if(!sh)throw Error('Falta pestaña '+name);
    tables[name]=sh.getDataRange().getDisplayValues();
  });
  return tables;
}
function rutasCRHash_(value) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,JSON.stringify(value),Utilities.Charset.UTF_8)
    .map(function(b){return ('0'+((b+256)%256).toString(16)).slice(-2);}).join('');
}
function rutasCRBuild_(c) {
  var first=rutasCRRead_(c.sheet);
  // AppSheet writes do not share ScriptLock. Compare two reads before publishing.
  Utilities.sleep(1000);
  var second=rutasCRRead_(c.sheet);
  if(rutasCRHash_(first)!==rutasCRHash_(second))throw Error('La hoja está cambiando; se reintentará en el siguiente ciclo');
  var result=RutasCRData.build(second,{imageUrls:JSON.parse(c.p.getProperty('RUTAS_PUBLIC_IMAGE_URLS')||'{}')});
  var json={schemaVersion:1,transportistas:result.transportistas};
  return {json:json,diagnostics:result.diagnostics,hash:rutasCRHash_(json)};
}
function rutasCRDiagnosticar() {
  var p=PropertiesService.getScriptProperties();
  var sheet=p.getProperty('RUTAS_SHEET_ID');
  if(!sheet)throw Error('Falta propiedad RUTAS_SHEET_ID');
  var built=rutasCRBuild_({p:p,sheet:sheet});
  var result={transportistas:built.json.transportistas.length,hash:built.hash,diagnostics:built.diagnostics};
  console.log(JSON.stringify(result));return result;
}
function rutasCRRequest_(c, method, suffix, body) {
  var response=UrlFetchApp.fetch('https://api.github.com/repos/'+encodeURIComponent(c.owner)+'/'+encodeURIComponent(c.repo)+suffix,{
    method:method,contentType:'application/json',muteHttpExceptions:true,followRedirects:false,
    headers:{Authorization:'Bearer '+c.token,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'},
    payload:body?JSON.stringify(body):undefined
  });
  var status=response.getResponseCode(), data;
  try { data=JSON.parse(response.getContentText()); } catch(e) {data={};}
  // Do not log response bodies, request headers or tokens.
  return {status:status,data:data};
}
function rutasCRProbarGitHub() {
  var c=rutasCRConfig_();
  var response=rutasCRRequest_(c,'get','/branches/'+encodeURIComponent(c.branch));
  if(response.status!==200)throw Error('No se pudo acceder a la rama segura. HTTP '+response.status);
  return {state:'connected',branch:c.branch,syncEnabled:c.p.getProperty('RUTAS_SYNC_ENABLED')==='true'};
}
function rutasCRSincronizar() {
  var lock=LockService.getScriptLock();if(!lock.tryLock(1000))return {state:'busy'};
  var c;
  try {
    c=rutasCRConfig_();
    if(c.p.getProperty('RUTAS_SYNC_ENABLED')!=='true')return {state:'disabled'};
    var built=rutasCRBuild_(c);
    // Require explicit source approval. Repeated names / invalid GPS / invalid phones need correction.
    // Duplicate visits remain diagnostic-only because RutasCRData.build already collapses
    // repeated transportista/destino pairs in the public snapshot.
    var blockers=built.diagnostics.filter(function(d){return ['INVALID_GPS','INVALID_PHONE','REPEATED_NAME'].indexOf(d.code)>=0;});
    if(blockers.length)throw Error('Datos requieren revisión: '+JSON.stringify(blockers));
    if(c.p.getProperty('RUTAS_PUBLIC_DATA_APPROVED')!=='true')throw Error('Falta aprobación de datos públicos');
    // Debounce: publish only after identical snapshots observed on successive executions.
    var now=Date.now(), candidate=c.p.getProperty('RUTAS_CANDIDATE_HASH');
    if(candidate!==built.hash){c.p.setProperties({RUTAS_CANDIDATE_HASH:built.hash,RUTAS_CANDIDATE_AT:String(now)});return {state:'settling'};}
    if(now-Number(c.p.getProperty('RUTAS_CANDIDATE_AT')||now)<60000)return {state:'settling'};
    var branchCheck=rutasCRRequest_(c,'get','/branches/'+encodeURIComponent(c.branch));
    if(branchCheck.status!==200)throw Error('Rama remota no disponible HTTP '+branchCheck.status);
    var endpoint='/contents/'+c.path.split('/').map(encodeURIComponent).join('/');
    for(var attempt=0;attempt<3;attempt++) {
      var current=rutasCRRequest_(c,'get',endpoint+'?ref='+encodeURIComponent(c.branch));
      if(current.status!==200 && current.status!==404)throw Error('GitHub GET HTTP '+current.status);
      var previous=null;
      if(current.status===200){
        if(!current.data.content || current.data.encoding!=='base64')throw Error('JSON remoto no se puede leer (límite 1 MB)');
        previous=JSON.parse(Utilities.newBlob(Utilities.base64Decode(current.data.content.replace(/\s/g,''))).getDataAsString('UTF-8'));
        if(previous.schemaVersion!==1 || !Array.isArray(previous.transportistas))throw Error('Contrato remoto incompatible');
        if(JSON.stringify(previous.transportistas)===JSON.stringify(built.json.transportistas)){
          c.p.setProperty('RUTAS_LAST_OK',new Date().toISOString());c.p.deleteProperty('RUTAS_LAST_ERROR');return {state:'unchanged'};
        }
        var before=previous.transportistas.length, after=built.json.transportistas.length;
        var oldIds=new Set(previous.transportistas.map(function(t){return t.id;}));
        var removed=Array.from(oldIds).filter(function(id){return !built.json.transportistas.some(function(t){return t.id===id;});});
        // Block accidental deletions; allow exactly one reviewed snapshot by its hash.
        var oldDest=previous.transportistas.reduce(function(n,t){return n+(t.destinos||[]).length;},0);
        var newDest=built.json.transportistas.reduce(function(n,t){return n+t.destinos.length;},0);
        var removedDest=false,removedWarehouse=false,removedPhone=false;
        previous.transportistas.forEach(function(t){var next=built.json.transportistas.find(function(n){return n.id===t.id;});if(!next)return;(t.destinos||[]).forEach(function(d){if(next.destinos.indexOf(d)<0)removedDest=true;});(t.bodegas||[]).forEach(function(b){if(!next.bodegas.some(function(n){return n.id===b.id;}))removedWarehouse=true;});(t.telefonos||[]).forEach(function(p){if(!next.telefonos.some(function(n){return n.numero===p.numero;}))removedPhone=true;});});
        var protectedReduction=removed.length||after<before||removedWarehouse||(removedDest&&c.p.getProperty('RUTAS_AUTO_DESTINATION_REMOVALS')!=='true')||(removedPhone&&c.p.getProperty('RUTAS_AUTO_PHONE_REMOVALS')!=='true');
        if(protectedReduction && c.p.getProperty('RUTAS_APPROVED_DELETION_HASH')!==built.hash)
          throw Error('Reducción de datos bloqueada; revisar hash '+built.hash);
      }
      var snapshot={schemaVersion:1,generatedAt:new Date().toISOString(),contentHash:built.hash,transportistas:built.json.transportistas};
      var body=JSON.stringify(snapshot,null,2)+'\n', bytes=Utilities.newBlob(body).getBytes();
      if(bytes.length>900000)throw Error('JSON excede 900 KB; dividir antes de continuar');
      var payload={message:'data: sincronizar Rutas CR '+built.hash.slice(0,12),branch:c.branch,content:Utilities.base64Encode(bytes)};
      if(current.status===200)payload.sha=current.data.sha;
      var written=rutasCRRequest_(c,'put',endpoint,payload);
      if(written.status===409){Utilities.sleep(1000*(attempt+1));continue;}
      if(written.status!==200&&written.status!==201)throw Error('GitHub PUT HTTP '+written.status);
      c.p.setProperties({RUTAS_LAST_OK:new Date().toISOString(),RUTAS_LAST_COMMIT:written.data.commit.sha});
      c.p.deleteProperty('RUTAS_LAST_ERROR');c.p.deleteProperty('RUTAS_APPROVED_DELETION_HASH');
      return {state:'updated',commit:written.data.commit.sha};
    }
    throw Error('Conflicto concurrente; reintento en siguiente ciclo');
  } catch(e) {
    if(c)c.p.setProperty('RUTAS_LAST_ERROR',new Date().toISOString()+' '+e.message);
    console.error(e.message);throw e;
  } finally {lock.releaseLock();}
}
function rutasCRAlEditar(e) {
  if(!e || !e.range)return;
  if(['TRANSPORTISTA','LUGARES','VISITA','DIRECCION','TELEFONOS'].indexOf(e.range.getSheet().getName())>=0)rutasCRCiclo();
}
// Optional AppSheet Automation > Call a script; same source edits also picked up by clock.
function rutasCRDesdeAppSheet() { return rutasCRCiclo(); }
function rutasCRCiclo() {
  var result={datos:rutasCRSincronizar(),imagenes:{state:'not-installed'}};
  if(typeof rutasCRSincronizarImagenes==='function')try{result.imagenes=rutasCRSincronizarImagenes();}catch(e){PropertiesService.getScriptProperties().setProperty('RUTAS_IMAGES_LAST_ERROR',new Date().toISOString()+' '+e.message);result.imagenes={state:'error',message:e.message};}
  return result;
}
function rutasCRInstalar() {
  var c=rutasCRConfig_();
  ['rutasCRSincronizar','rutasCRCiclo','rutasCRAlEditar'].forEach(function(name){
    ScriptApp.getProjectTriggers().filter(function(t){return t.getHandlerFunction()===name;}).forEach(function(t){ScriptApp.deleteTrigger(t);});
  });
  ScriptApp.newTrigger('rutasCRCiclo').timeBased().everyMinutes(5).create();
  ScriptApp.newTrigger('rutasCRAlEditar').forSpreadsheet(c.sheet).onEdit().create();
  // Does not change RUTAS_SYNC_ENABLED; installation alone never starts publication.
}
