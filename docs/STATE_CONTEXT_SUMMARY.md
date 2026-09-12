# State Context Summary — Rutas CR

## Objetivo y restricciones

Implementar responsive, X de búsqueda, mapa sin zoom accidental, clustering, mejoras UX, exportación Sheets/AppSheet → JSON en GitHub → Pages. Producción permanece suspendida hasta completar pruebas reales. Responder en español. No apagar equipo; solo entregar instrucción Windows cuando se solicite al cierre.

## Fuente y rama

- Repositorio: sh2658/directorio-transportistas-
- Base: ca2fe2a4105a731e90e7dce33166860fba7240ca
- Rama de trabajo: fix/rutas-cr-integracion-segura
- Workspace: /workspace/scratch/5d7eb963c1e7/rutas-cr
- Sheet: 1gXtF2KcCuy_cdYRNTbGrulNbB5SYw_mrN-H_AVSXOeA
- AppSheet: f16ef6ba-dec1-4bbd-81e6-e3ae21f5019d
- Apps Script histórico en comentarios: 1rdeJAaznbGAu36FZAs6MqYnM3yAHvvZ9K0kWgExM070Vv_6i4ddJt9Jf; no se inspeccionó el código instalado.

## Hecho

- Clonado repositorio y creado rama aislada; frontend real era Google Maps, no Leaflet como decía README.
- Lectura real de 5 tablas: 54 transportistas, 74 filas de DIRECCION, 152 teléfonos, 415 lugares y 1007 VISITA; sin IDs duplicados, nombres repetidos, pares duplicados ni FKs huérfanas. El JSON público contiene 55 bodegas con zona confirmada, 49 con GPS; 19 filas sin zona quedan excluidas para revisión.
- Frontend usa JSON estático versionado, render seguro mediante DOM, búsqueda exacta prioritaria y parcial por texto, 15 tarjetas por carga, todas las bodegas por empresa.
- Input iOS con padding reservado a X, reset nativo desactivado, radio accesible y orientación any.
- Leaflet 1.9.4 y markercluster 1.5.3 incluidos con licencias. Carga diferida, controles explícitos, rueda bloqueada hasta interacción, reset al salir/blur/Escape, cluster cuenta empresas distintas.
- Nuevo constructor puro de datos con validación; fuente no mutada.
- Nuevo proyecto Apps Script independiente: RutasCR_Data + RutasCR_Sync + manifiesto. Properties privadas, PAT, lock, SHA, compare de contenido, retry 409, debounce y reloj 5 min para cambios AppSheet/API. Nunca publica si falta flag de aprobación o hay errores estructurales. Eliminaciones requieren hash específico aprobado.
- JSON preparado de fuente real; 54 empresas, 68 bodegas con coordenadas; sin observaciones internas/CAPTURAS/correos. Teléfono de Panamá conservado con 507.
- Actions verify y Pages con flag false por defecto; construcción publica lista permitida de archivos.
- Pruebas de contrato, DOM y REST mock; npm test y npm run build ejecutados satisfactoriamente.

## Pendiente / límites que NO deben declararse resueltos

- Browser: auto-review denegó navegar a preview local por uso agotado. No usar otro browser/raw CDP/Playwright para evadirlo. No hubo screenshots actuales, ni auditoría visual completa, ni pruebas reales de iOS/Android.
- 48 imágenes tienen rutas internas de AppSheet; preparar copias públicas seleccionadas, mapear ID→URL en RUTAS_PUBLIC_IMAGE_URLS. No desactivar firma de AppSheet ni abrir toda carpeta Drive.
- Seis GPS vacíos; y verificar GPS/destinos semánticamente (bounding box no prueba ubicación correcta).
- No se cambió configuración de AppSheet ni instaló Apps Script/PAT/activadores; guía contiene propuestas exactas. Revisión de selector de lugares y vistas inline pendiente en copia de ensayo.
- Flujo real Google→PAT→commit→Actions→Pages no ejecutado. No reactivar hasta completar.
- No atribuir corrupción a Transkaja sin historia de cambios/ejecuciones. API histórica del repo tiene esquema incompatible pero no prueba lo desplegado.
- Publicación de rama/PR debe comprobarse en respuesta final de esta sesión; consultar estado git/remote antes de repetir.

## Siguientes pasos exactos

1. Leer docs/RUTAS_CR_IMPLEMENTACION.md y estado git/PR; no repetir cambios ya guardados.
2. Cuando vuelva acceso, capturar frontend en preview; ejecutar matriz de tamaños/orientaciones y mapa con coordenadas idénticas. Probar AppSheet añadiendo/editando/eliminando una relación en copia y verificar selector.
3. Resolver imágenes y GPS pendientes con fuentes reales.
4. Crear proyecto independiente Apps Script, cargar archivos y propiedades según guía; PAT fine-grained solo repo Contents RW. No pedir token en chat.
5. Ensayar contra rama no publicada. Dos ejecuciones estables; confirmar GET/PUT, hash, commit único y no-op posterior, reintento y error.
6. Integrar PR después de pruebas. Pages Source=GitHub Actions; environment github-pages/main. Activar RUTAS_PAGES_ENABLED solo al aprobar la matriz; apuntar sync a main.
7. Verificar URL final y registrar commit/despliegue. Windows, tras guardar todo: shutdown /s /t 60; cancelar con shutdown /a. No ejecutar automáticamente.
