// Sin dependencias: prueba el HTML/CSS real en el motor del navegador actual.
// Abrir tests/ui-search.html. Registra coordenadas y falla si la X invade el texto.
const app = document.getElementById('app');
const informe = document.getElementById('informe');
const ejecutar = document.getElementById('ejecutar');
async function probarBuscadores() {
  ejecutar.disabled = true;
  const registros = [];
  const doc = app.contentDocument;
  const win = app.contentWindow;
  try {
    for (const ancho of [320, 360, 375, 390, 414, 620, 768]) {
      app.style.width = ancho + 'px';
      for (const modo of ['destino', 'transportista', 'plantel']) {
        doc.querySelector('input[name="modo"][value="' + modo + '"]').checked = true;
        win.cambiarModo();
        const sufijo = modo[0].toUpperCase() + modo.slice(1);
        const input = doc.getElementById('input' + sufijo);
        const boton = doc.getElementById('btnClear' + sufijo);
        input.value = 'NOMBRE MUY LARGO PARA COMPROBAR TEXTO, CURSOR Y BOTÓN DE LIMPIEZA';
        boton.style.display = 'flex';
        await new Promise(resolve => win.requestAnimationFrame(() => win.requestAnimationFrame(resolve)));
        const r = input.getBoundingClientRect();
        const x = boton.getBoundingClientRect();
        const css = win.getComputedStyle(input);
        const limiteTexto = r.right - parseFloat(css.borderRightWidth) - parseFloat(css.paddingRight);
        const margen = x.left - limiteTexto;
        const ok = r.width > 0 && x.width > 0 && margen >= 1 &&
          x.right <= r.right && x.top >= r.top && x.bottom <= r.bottom &&
          r.left >= 0 && r.right <= ancho && parseFloat(css.paddingRight) >= 50;
        registros.push({ ancho, modo, inputX:r.x, inputAncho:r.width,
          textoDerecha:limiteTexto, botonX:x.x, botonAncho:x.width,
          botonDerecha:x.right, margen, ok });
      }
    }
    console.table(registros);
    const fallos = registros.filter(r => !r.ok);
    informe.textContent = (fallos.length ? 'FALLO' : 'CORRECTO') + ': ' +
      (registros.length - fallos.length) + '/' + registros.length + ' casos sin solapamiento\n' +
      JSON.stringify(registros, null, 2);
    if (fallos.length) console.error('Solapamiento detectado', fallos);
  } catch (error) {
    informe.textContent = 'ERROR: ' + error.message;
    console.error(error);
  } finally {
    ejecutar.disabled = false;
  }
}
ejecutar.addEventListener('click', probarBuscadores);
app.addEventListener('load', probarBuscadores);
