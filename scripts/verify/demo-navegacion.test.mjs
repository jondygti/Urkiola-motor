import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ventanaDemo } from '../demo-navegacion.mjs';

function navegador(href) {
  const real = { location: new URL(href), history: { state: null } };
  const pila = [href];
  let indice = 0;
  for (const metodo of ['pushState', 'replaceState']) real.history[metodo] = (state, _, destino) => {
    // Reproduce la restricción que provocaba Unmatched Route en Windows.
    assert.ok(destino.startsWith('#'), 'no se puede cambiar la ruta física');
    real.location = new URL(destino, real.location);
    real.history.state = state;
    if (metodo === 'pushState') pila[++indice] = real.location.href;
    else pila[indice] = real.location.href;
  };
  real.history.back = () => { real.location = new URL(pila[--indice]); };
  return real;
}

for (const archivo of ['file:///C:/Users/jondi/AppData/Local/Temp/demo.html',
  'file:///tmp/demo%20urkiola.html', 'https://ejemplo.invalid/archivos/demo.html']) {
  test(`arranque, navegación, recarga y atrás: ${archivo}`, () => {
    const real = navegador(archivo);
    const demo = ventanaDemo(real);
    assert.equal(new URL(demo.location.href).pathname, '/');
    demo.history.replaceState({ id: 'login' }, '', '/login');
    demo.history.pushState({ id: 'flota' }, '', '/flota?q=1234');
    assert.equal(demo.location.pathname, '/flota');
    assert.equal(demo.location.search, '?q=1234');
    assert.equal(demo.location.hash, '');
    assert.equal(real.location.href.split('#')[0], archivo);
    assert.equal(ventanaDemo(real).location.pathname, '/flota');
    demo.history.back();
    assert.equal(demo.location.pathname, '/login');
  });
}

test('no convierte enlaces externos en pantallas internas', () => {
  const demo = ventanaDemo(navegador('file:///tmp/demo.html'));
  assert.throws(() => demo.history.pushState(null, '', 'https://otra.invalid/'));
});

test('las funciones del navegador se llaman sobre la ventana de verdad', () => {
  // Una función nativa que, como getSelection, exige que «this» sea la
  // ventana real: llamada sobre el envoltorio, el navegador da «Illegal
  // invocation» y la demo fallaba en cada toque.
  const real = navegador('file:///tmp/demo.html');
  real.getSelection = function getSelection() {
    assert.equal(this, real, 'llamada fuera de la ventana real');
    return 'seleccion';
  }.bind(real);
  real.miDato = { a: 1 };
  real.miFuncion = () => 42;
  const demo = ventanaDemo(real);
  assert.equal(demo.getSelection(), 'seleccion');
  assert.equal(demo.getSelection, demo.getSelection, 'siempre la misma función');
  assert.equal(demo.miDato, real.miDato);
  assert.equal(demo.miFuncion, real.miFuncion, 'lo que guarda la app se devuelve tal cual');
  assert.equal(demo.URL, real.URL);
});
