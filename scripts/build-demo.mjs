/**
 * Empaqueta el panel web en un ÚNICO fichero HTML autónomo.
 *
 *   npm run build:demo
 *
 * Sirve para enseñar la aplicación sin montar ningún servidor: el fichero
 * resultante se abre con doble clic o se envía por correo. Funciona en modo
 * demostración (datos de ejemplo guardados en el propio navegador).
 *
 * Para el despliegue real se usa `npm run build:web`, que genera el sitio
 * estático normal.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { cssDeLaFuente } from './fuente.mjs';
import { ventanaDemo } from './demo-navegacion.mjs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BUILD = join(ROOT, '.demo-build');
const OUT_DIR = join(ROOT, 'demo');
const OUT = join(OUT_DIR, 'urkiola-car-service-demo.html');

console.log('· Compilando la web como página única…');
rmSync(BUILD, { recursive: true, force: true });
// `--clear` no es opcional: Metro cachea el valor de EXPO_PUBLIC_API_URL de
// la compilación anterior, y una demostración que intenta hablar con un
// servidor que no existe no sirve para enseñar nada.
execFileSync('npx', ['expo', 'export', '--platform', 'web', '--output-dir', BUILD, '--clear'], {
  cwd: ROOT,
  stdio: 'inherit',
  env: { ...process.env, EXPO_WEB_OUTPUT: 'single', EXPO_PUBLIC_API_URL: '' },
});

const jsDir = join(BUILD, '_expo/static/js/web');
const entry = readdirSync(jsDir).find((f) => f.startsWith('entry-') && f.endsWith('.js'));
if (!entry) throw new Error('No se encuentra el bundle de entrada en ' + jsDir);

const bundle = readFileSync(join(jsDir, entry), 'utf8');

// Un `</script` dentro del bundle cerraría la etiqueta antes de tiempo.
if (bundle.includes('</script')) {
  throw new Error('El bundle contiene "</script": hay que escaparlo antes de incrustarlo.');
}

const html = `<!DOCTYPE html><html lang="es"><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Urkiola Car Service · Demo</title>
<style>
/* La fuente va dentro del propio fichero: la demostración se abre con doble
   clic y tiene que verse igual sin conexión. */
${cssDeLaFuente()}
</style>
<style>
  /* La aplicación pinta su propio fondo; estos tokens solo evitan un
     destello del color equivocado mientras carga el bundle. */
  :root {
    --ground: #f3f6f7;
    --ink: #6e8087;
    --accent: #1e9d82;
  }
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme='light']) {
      --ground: #0b171b;
      --ink: #93a9af;
      --accent: #2fb899;
    }
  }
  :root[data-theme='dark'] {
    --ground: #0b171b;
    --ink: #93a9af;
    --accent: #2fb899;
  }

  html,
  body {
    height: 100%;
    margin: 0;
  }
  body {
    background: var(--ground);
    overflow: hidden;
  }
  #root {
    display: flex;
    height: 100%;
    flex: 1;
  }

  /* Se sustituye por la aplicación en cuanto React monta. */
  .booting {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 14px;
    font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
    color: var(--ink);
  }
  .booting b {
    font-size: 15px;
    font-weight: 800;
    letter-spacing: 0.12em;
    color: var(--accent);
  }
  .booting span {
    font-size: 13px;
  }
  .booting i {
    width: 34px;
    height: 34px;
    border: 3px solid color-mix(in srgb, var(--ink) 30%, transparent);
    border-top-color: var(--accent);
    border-radius: 50%;
    animation: spin 0.9s linear infinite;
  }
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .booting i {
      animation-duration: 3s;
    }
  }
</style>

<div id="root">
  <div class="booting">
    <i></i>
    <b>URKIOLA CAR SERVICE</b>
    <span>Cargando la demostración…</span>
  </div>
</div>

<script>
  /* React Native Web decide el tema con \`prefers-color-scheme\`. Cuando la
     página se ve dentro de un visor que marca el tema en <html data-theme>,
     ese ajuste manda sobre el del sistema: aquí se le hace llegar. */

  (function () {
    var native = window.matchMedia.bind(window);
    var subscribers = [];

    function forced() {
      var t = document.documentElement.getAttribute('data-theme');
      return t === 'dark' ? true : t === 'light' ? false : null;
    }

    window.matchMedia = function (query) {
      if (!/prefers-color-scheme/.test(query)) return native(query);
      var wantsDark = /dark/.test(query);
      var real = native(query);
      var shim = {
        media: query,
        onchange: null,
        get matches() {
          var f = forced();
          return f === null ? real.matches : f === wantsDark;
        },
        addEventListener: function (type, cb) {
          if (type !== 'change') return;
          subscribers.push({ shim: shim, cb: cb });
          real.addEventListener('change', cb);
        },
        removeEventListener: function (type, cb) {
          if (type !== 'change') return;
          subscribers = subscribers.filter(function (s) {
            return s.cb !== cb;
          });
          real.removeEventListener('change', cb);
        },
        addListener: function (cb) {
          shim.addEventListener('change', cb);
        },
        removeListener: function (cb) {
          shim.removeEventListener('change', cb);
        },
        dispatchEvent: function () {
          return true;
        },
      };
      return shim;
    };

    new MutationObserver(function () {
      subscribers.forEach(function (s) {
        try {
          s.cb({ matches: s.shim.matches, media: s.shim.media });
        } catch (e) {
          /* un suscriptor con error no debe frenar a los demás */
        }
      });
    }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  })();
</script>

<script>
(function (window) {
var location = window.location;
var history = window.history;
${bundle}
})((${ventanaDemo.toString()})(window));
</script>
</html>
`;

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(OUT, html);
rmSync(BUILD, { recursive: true, force: true });

const mb = (html.length / 1024 / 1024).toFixed(2);
console.log(`\n✔ ${OUT.replace(ROOT + '/', '')} (${mb} MB)`);
console.log('  Ábrelo con doble clic: no necesita servidor ni conexión.');
