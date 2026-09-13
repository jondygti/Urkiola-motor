/** Solo para el HTML autónomo: el historial cambia el fragmento, nunca el fichero. */
export function ventanaDemo(real) {
  const base = 'https://urkiola-demo.invalid';
  const actual = () => new URL(real.location.hash.startsWith('#/')
    ? real.location.hash.slice(1) : '/', base);
  const cambiar = (metodo, estado, titulo, destino) => {
    const url = new URL(destino ?? actual().href, actual());
    if (url.origin !== base) throw new Error('La demo solo admite rutas internas.');
    real.history[metodo](estado, titulo, '#' + url.pathname + url.search + url.hash);
  };
  const ubicacion = new Proxy({}, {
    get(_, clave) {
      if (clave === 'reload') return real.location.reload.bind(real.location);
      if (clave === 'assign' || clave === 'replace') return destino =>
        cambiar(clave === 'assign' ? 'pushState' : 'replaceState', null, '', destino);
      if (clave === 'toString' || clave === Symbol.toPrimitive) return () => actual().href;
      return actual()[clave];
    },
  });
  const historial = new Proxy({}, {
    get(_, clave) {
      if (clave === 'pushState' || clave === 'replaceState') return (...args) => cambiar(clave, ...args);
      const valor = real.history[clave];
      return typeof valor === 'function' ? valor.bind(real.history) : valor;
    },
  });
  const metodos = new Set(['addEventListener', 'removeEventListener', 'dispatchEvent',
    'matchMedia', 'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame',
    'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'scrollTo', 'scroll',
    'open', 'fetch']);
  const ventana = new Proxy({}, {
    get(_, clave) {
      if (clave === 'location') return ubicacion;
      if (clave === 'history') return historial;
      if (clave === 'window' || clave === 'self') return ventana;
      const valor = real[clave];
      return metodos.has(clave) && typeof valor === 'function' ? valor.bind(real) : valor;
    },
    set(_, clave, valor) { real[clave] = valor; return true; },
    has(_, clave) { return clave in real; },
  });
  return ventana;
}
