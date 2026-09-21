import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { AlmacenFichero } from '../src/almacen/fichero';
import { FotosEnFichero } from '../src/almacen/fotos';
import { Servicio } from '../src/servicio';
import { ErrorHttp } from '../src/errores';
import { carpetaTemporal, configPruebas, CorreoDePruebas, cmd } from './ayuda';
import type { AppState } from '../../src/data/types';
import type { Command } from '../../src/data/commands';

class AlmacenRelevable extends AlmacenFichero {
  private gestor: (() => Promise<void>) | null = null;
  private bloquear = false;
  private resolverEntrada: (() => void) | null = null;
  private resolverSalida: (() => void) | null = null;
  private entrada = Promise.resolve();
  private salida = Promise.resolve();

  alPedirRelevo(gestor: () => Promise<void>) {
    this.gestor = gestor;
  }

  prepararBloqueo() {
    this.bloquear = true;
    this.entrada = new Promise<void>((r) => {
      this.resolverEntrada = r;
    });
    this.salida = new Promise<void>((r) => {
      this.resolverSalida = r;
    });
  }

  esperarEscrituraDentro() {
    return this.entrada;
  }

  dejarTerminarEscritura() {
    this.resolverSalida?.();
  }

  pedirRelevo() {
    if (!this.gestor) throw new Error('El servicio no registró el gestor de relevo.');
    return this.gestor();
  }

  override async anotarComando(cmd: Command, estado: AppState, guardarFoto: boolean) {
    if (this.bloquear) {
      this.bloquear = false;
      this.resolverEntrada?.();
      await this.salida;
    }
    await super.anotarComando(cmd, estado, guardarFoto);
  }
}

test('el relevo espera la escritura en curso y después rechaza escrituras nuevas', async () => {
  const dir = carpetaTemporal();
  const fichero = path.join(dir, 'estado.json');
  const almacen = new AlmacenRelevable(fichero);
  const config = configPruebas({ ficheroDatos: fichero, carpetaFotos: path.join(dir, 'fotos') });
  const servicio = await Servicio.crear(
    almacen,
    config,
    new FotosEnFichero(config.carpetaFotos),
    new CorreoDePruebas()
  );

  try {
    const admin = servicio.estado.users.find((u) => u.role === 'admin')!;
    almacen.prepararBloqueo();

    const escritura = servicio.ejecutar(
      cmd('vehicle.create', { vin8: 'RELEV001', location: { siteId: 'leioa' } }),
      admin
    );
    await almacen.esperarEscrituraDentro();

    let relevoTerminado = false;
    const relevo = almacen.pedirRelevo().then(() => {
      relevoTerminado = true;
    });

    await new Promise((r) => setTimeout(r, 20));
    assert.equal(relevoTerminado, false, 'no entrega liderazgo con una escritura a medias');

    almacen.dejarTerminarEscritura();
    await escritura;
    await relevo;
    assert.equal(relevoTerminado, true);

    await assert.rejects(
      () => servicio.ejecutar(cmd('vehicle.create', { vin8: 'RELEV002' }), admin),
      (e: unknown) => e instanceof ErrorHttp && e.codigo === 503,
      'una escritura nueva debe quedar para reintento en la instancia nueva'
    );

    // Las lecturas siguen disponibles durante el breve solape.
    assert.ok(servicio.estadoDe(admin).vehicles.some((v) => v.vin8 === 'RELEV001'));
  } finally {
    await servicio.cerrar();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
