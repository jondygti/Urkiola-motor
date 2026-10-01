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
  // Las funciones propias del navegador (getSelection, matchMedia, fetch…)
  // tienen que llamarse sobre la ventana de verdad: llamadas sobre este
  // envoltorio, el navegador responde «Illegal invocation». Antes se ataban
  // solo las de una lista, y React Native Web pide la selección de texto al
  // pulsar: la demo daba ese error en cada toque. Ahora se atan todas las
  // nativas, y siempre la misma copia atada, para que dos lecturas seguidas
  // devuelvan la misma función. Lo que la app guarde en la ventana se
  // devuelve tal cual.
  const atadas = new WeakMap();
  const esNativa = (f) => {
    try {
      return /\{\s*\[native code\]\s*\}\s*$/.test(Function.prototype.toString.call(f));
    } catch {
      return false;
    }
  };
  const ventana = new Proxy({}, {
    get(_, clave) {
      if (clave === 'location') return ubicacion;
      if (clave === 'history') return historial;
      if (clave === 'window' || clave === 'self') return ventana;
      const valor = real[clave];
      if (typeof valor !== 'function' || !esNativa(valor)) return valor;
      // Los constructores (Date, URL, Image…) se dejan como están: atarlos
      // no los rompe, pero no lo necesitan y así `new` y `instanceof` siguen
      // viendo exactamente el mismo objeto que el resto del navegador.
      if (/^[A-Z]/.test(String(clave))) return valor;
      if (!atadas.has(valor)) atadas.set(valor, valor.bind(real));
      return atadas.get(valor);
    },
    set(_, clave, valor) { real[clave] = valor; return true; },
    has(_, clave) { return clave in real; },
  });
  return ventana;
}
