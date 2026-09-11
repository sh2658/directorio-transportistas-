# Rutas CR

Directorio de transportistas y encomiendas de Costa Rica. **Revisión en ensayo: GitHub Pages sigue suspendido.**

Google Sheets es la fuente; AppSheet administra las cinco tablas relacionadas. Apps Script exporta una proyección pública validada a `data/transportistas.json` mediante GitHub REST. Actions comprueba el código y el JSON antes de publicar. El frontend no necesita claves ni consultar Apps Script al abrirse.

La guía completa, propiedades privadas, PAT, código de instalación, AppSheet, limitaciones y puerta de despliegue están en [docs/RUTAS_CR_IMPLEMENTACION.md](docs/RUTAS_CR_IMPLEMENTACION.md).

```sh
npm ci --ignore-scripts
npm test
npm run build
python -m http.server 8765 --directory .local/site
```

## Código

- `index.html`, `assets/css/app.css`, `assets/js/`: frontend accesible, mapa opcional y clusters por empresa.
- `apps_script/RutasCR_Data.js`: contrato de exportación, sin modificar Sheets.
- `apps_script/RutasCR_Sync.gs`: sincronización, bloqueo, validación y commits mediante SHA.
- `apps_script/appsscript.sync.json`: manifiesto para un proyecto independiente.
- `data/transportistas.json`: snapshot para revisión con IDs estables.
- `tests/`: pruebas de contrato, DOM y transporte REST simulado.
- `.github/workflows/`: verificación y publicación condicionada a `RUTAS_PAGES_ENABLED=true`.

Las fuentes históricas en `apps_script/` no equivalen a la versión instalada. No instalar todos los archivos en el mismo proyecto: contienen funciones globales de distintas etapas.

## Estado

Implementado y probado localmente; integración con credenciales reales y revisión visual multidispositivo pendientes. 48 imágenes internas de AppSheet requieren URLs públicas de copias seleccionadas y seis bodegas tienen GPS pendiente. Un GPS numéricamente válido todavía requiere verificación física. No se afirma compatibilidad perfecta sin completar la matriz de pruebas.

No activar Pages por publicación de rama: usar GitHub Actions para que la puerta de verificación tenga efecto.
