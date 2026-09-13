/** Sincroniza copias públicas versionadas de imágenes privadas de AppSheet.
 * Requiere RUTAS_APPSHEET_IMAGE_FOLDER_ID y RUTAS_IMAGE_SYNC_ENABLED=true.
 * Los originales de Drive conservan sus permisos privados.
 */
function rutasCRImageTable_(rows) {
  var headers=rows[0].map(function(v){return String(v||'').trim().toUpperCase();}),id=headers.indexOf('IDTRANSPORTE'),image=headers.indexOf('IMAGEN');
  if(id<0||image<0)throw Error('TRANSPORTISTA: faltan IDTRANSPORTE o IMAGEN');
  return rows.slice(1).filter(function(r){return r[id];}).map(function(r){return {id:String(r[id]).trim(),path:String(r[image]||'').trim()};});
}
function rutasCRDriveFile_(rootId,relativePath) {
  var parts=String(relativePath||'').replace(/\\/g,'/').split('/').filter(Boolean),folder=DriveApp.getFolderById(rootId);
  if(!parts.length)return null;
  for(var i=0;i<parts.length-1;i++){var folders=folder.getFoldersByName(parts[i]);if(!folders.hasNext())return null;folder=folders.next();if(folders.hasNext())throw Error('Carpeta ambigua en ruta de imagen: '+parts[i]);}
  var files=folder.getFilesByName(parts[parts.length-1]);if(!files.hasNext())return null;var file=files.next();if(files.hasNext())throw Error('Imagen duplicada en Drive: '+parts[parts.length-1]);return file;
}
function rutasCRRepoJson_(c,path) {
  var endpoint='/contents/'+path.split('/').map(encodeURIComponent).join('/'),current=rutasCRRequest_(c,'get',endpoint+'?ref='+encodeURIComponent(c.branch));
  if(current.status!==200||!current.data.content)throw Error('No se pudo leer '+path+' de GitHub. HTTP '+current.status);
  return {sha:current.data.sha,value:JSON.parse(Utilities.newBlob(Utilities.base64Decode(current.data.content.replace(/\s/g,''))).getDataAsString('UTF-8'))};
}
function rutasCRPutFile_(c,path,bytes,message) {
  var endpoint='/contents/'+path.split('/').map(encodeURIComponent).join('/'),current=rutasCRRequest_(c,'get',endpoint+'?ref='+encodeURIComponent(c.branch));
  if(current.status!==200&&current.status!==404)throw Error('GitHub GET '+path+' HTTP '+current.status);
  var payload={message:message,branch:c.branch,content:Utilities.base64Encode(bytes)};if(current.status===200)payload.sha=current.data.sha;
  var written=rutasCRRequest_(c,'put',endpoint,payload);if(written.status!==200&&written.status!==201)throw Error('GitHub PUT '+path+' HTTP '+written.status);return written.data.commit.sha;
}
function rutasCRSincronizarImagenes() {
  var c=rutasCRConfig_(),p=c.p;if(p.getProperty('RUTAS_IMAGE_SYNC_ENABLED')!=='true')return {state:'disabled'};
  var root=p.getProperty('RUTAS_APPSHEET_IMAGE_FOLDER_ID');if(!root)throw Error('Falta propiedad RUTAS_APPSHEET_IMAGE_FOLDER_ID');
  var table=rutasCRImageTable_(rutasCRRead_(c.sheet).TRANSPORTISTA),remote=rutasCRRepoJson_(c,'assets/carriers/manifest.json'),manifest=remote.value;
  if(!manifest||manifest.schemaVersion!==1||!manifest.images)throw Error('Manifiesto de imágenes incompatible');
  var state=JSON.parse(p.getProperty('RUTAS_IMAGE_STATE')||'{}'),next={},changed=false,uploaded=0,mimes={'image/jpeg':'jpg','image/png':'png','image/gif':'gif','image/webp':'webp'};
  table.forEach(function(row){
    if(!row.path){if(state[row.id]&&manifest.images[row.id]){delete manifest.images[row.id];changed=true;}return;}
    var file=rutasCRDriveFile_(root,row.path);if(!file)throw Error('No se encontró imagen de '+row.id+': '+row.path);
    var blob=file.getBlob(),bytes=blob.getBytes(),ext=mimes[blob.getContentType()];if(!ext)throw Error('Formato de imagen no permitido: '+blob.getContentType());if(bytes.length>2500000)throw Error('Imagen excede 2,5 MB: '+row.id);
    var signature=row.path+'|'+file.getLastUpdated().toISOString()+'|'+bytes.length,nextPath=manifest.images[row.id];
    if(state[row.id]!==signature||!nextPath){var hash=Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,bytes).slice(0,6).map(function(b){return ('0'+((b+256)%256).toString(16)).slice(-2);}).join('');nextPath='./assets/carriers/'+row.id.toLowerCase().replace(/[^a-z0-9_-]/g,'-')+'.'+hash+'.'+ext;rutasCRPutFile_(c,nextPath.slice(2),bytes,'imagen: actualizar '+row.id);manifest.images[row.id]=nextPath;changed=true;uploaded++;}
    next[row.id]=signature;
  });
  if(changed){var body=Utilities.newBlob(JSON.stringify(manifest,null,2)+'\n').getBytes();rutasCRPutFile_(c,'assets/carriers/manifest.json',body,'imagenes: actualizar manifiesto público');}
  p.setProperties({RUTAS_IMAGE_STATE:JSON.stringify(next),RUTAS_IMAGES_LAST_OK:new Date().toISOString()});p.deleteProperty('RUTAS_IMAGES_LAST_ERROR');return {state:changed?'updated':'unchanged',uploaded:uploaded};
}
