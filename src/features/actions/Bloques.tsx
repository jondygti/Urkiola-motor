import React, { useMemo, useState } from 'react';
import { Btn, Field, Input, Select } from '@/ui';
import { useStore } from '@/data/store';
import { can as puede } from '@/data/selectors';
import {
  filasAsignarComercial,
  filasAsignarPreparador,
  filasCancelar,
  filasCancelarPreparaciones,
  filasLlavesPreparadas,
  filasPedirSolicitud,
} from '@/data/bloque';
import { siteName } from '@/data/format';
import { usePerms } from '@/features/common/Guard';
import { ConfirmarBloque } from '@/features/common/AccionBloque';
import type { Preparation, ServiceRequest, Vehicle } from '@/data/types';

/**
 * Las acciones en bloque de cada tabla de oficina. Cada botón sale solo si
 * el rol tiene el permiso de esa acción (el mismo que hace falta para
 * hacerla coche a coche); qué coches concretos la admiten lo dice la
 * confirmación.
 */

type Hecho = { onHecho: (mensaje: string) => void; limpiar: () => void };

/* -------------------------------------------------------------- flota */

export function AccionesFlota({ vehicles, onHecho, limpiar }: { vehicles: Vehicle[] } & Hecho) {
  const { state } = useStore();
  const { can } = usePerms();
  const [accion, setAccion] = useState<'traslado' | 'preparacion' | 'comercial' | null>(null);
  const [siteId, setSiteId] = useState('');
  const [comercialId, setComercialId] = useState('');

  const sedes = accion === 'preparacion' ? state.sites.filter((s) => s.prepares) : state.sites;
  const comerciales = state.users.filter((u) => u.active && puede(state, u, 'flota.asignarse'));
  const comercial = comerciales.find((u) => u.id === comercialId);

  const filas = useMemo(() => {
    if (accion === 'comercial') return comercial ? filasAsignarComercial(state, vehicles, comercial) : [];
    if (accion && siteId) return filasPedirSolicitud(state, vehicles, { requestType: accion, siteId });
    return [];
  }, [accion, siteId, comercial, state, vehicles]);

  const abrir = (a: typeof accion) => {
    setSiteId('');
    setComercialId('');
    setAccion(a);
  };
  const cerrar = () => setAccion(null);

  return (
    <>
      {can('solicitudes.crear') ? (
        <>
          <Btn small icon="camion" onPress={() => abrir('traslado')}>Pedir traslado</Btn>
          <Btn small icon="preparacion" onPress={() => abrir('preparacion')}>Pedir preparación</Btn>
        </>
      ) : null}
      {can('flota.editar') ? (
        <Btn small icon="persona" onPress={() => abrir('comercial')}>Asignar comercial</Btn>
      ) : null}

      {accion === 'traslado' || accion === 'preparacion' ? (
        <ConfirmarBloque
          titulo={accion === 'traslado' ? 'Pedir traslado en bloque' : 'Pedir preparación en bloque'}
          icono={accion === 'traslado' ? 'camion' : 'preparacion'}
          queHace={`pedir ${accion === 'traslado' ? 'traslado' : 'preparación'} a ${siteName(state, siteId)}`}
          filas={filas}
          listo={!!siteId}
          onClose={cerrar}
          onHecho={(m) => {
            cerrar();
            limpiar();
            onHecho(m);
          }}
        >
          <Field label={accion === 'traslado' ? 'Destino' : 'Sede de preparación'}>
            <Select
              full
              value={siteId}
              onChange={setSiteId}
              placeholder="Elige la sede"
              title="Sede"
              options={sedes.map((s) => ({ value: s.id, label: s.name }))}
            />
          </Field>
        </ConfirmarBloque>
      ) : null}

      {accion === 'comercial' ? (
        <ConfirmarBloque
          titulo="Asignar comercial en bloque"
          icono="persona"
          queHace={`asignar a ${comercial?.name ?? ''}`}
          filas={filas}
          listo={!!comercial}
          onClose={cerrar}
          onHecho={(m) => {
            cerrar();
            limpiar();
            onHecho(m);
          }}
        >
          <Field label="Comercial">
            <Select
              full
              searchable
              value={comercialId}
              onChange={setComercialId}
              placeholder="Elige el comercial"
              title="Comercial"
              options={comerciales.map((u) => ({ value: u.id, label: u.name }))}
            />
          </Field>
        </ConfirmarBloque>
      ) : null}
    </>
  );
}

/* -------------------------------------------------------- solicitudes */

export function AccionesSolicitudes({ requests, onHecho, limpiar }: { requests: ServiceRequest[] } & Hecho) {
  const { state } = useStore();
  const { can } = usePerms();
  const [accion, setAccion] = useState<'cancelar' | 'llaves' | null>(null);
  const [motivo, setMotivo] = useState('');
  const cerrar = () => setAccion(null);
  const hecho = (m: string) => {
    cerrar();
    limpiar();
    onHecho(m);
  };

  const filas = useMemo(
    () =>
      accion === 'cancelar'
        ? filasCancelar(state, requests, motivo.trim())
        : accion === 'llaves'
          ? filasLlavesPreparadas(state, requests)
          : [],
    [accion, motivo, state, requests]
  );

  return (
    <>
      {can('solicitudes.gestionar') ? (
        <Btn small icon="llaves" onPress={() => setAccion('llaves')}>Llaves preparadas</Btn>
      ) : null}
      {can('solicitudes.gestionar') || can('solicitudes.crear') ? (
        <Btn
          small
          icon="cerrar"
          onPress={() => {
            setMotivo('');
            setAccion('cancelar');
          }}
        >
          Cancelar
        </Btn>
      ) : null}

      {accion === 'llaves' ? (
        <ConfirmarBloque
          titulo="Llaves preparadas en bloque"
          icono="llaves"
          queHace="marcar las llaves como preparadas"
          filas={filas}
          onClose={cerrar}
          onHecho={hecho}
        />
      ) : null}
      {accion === 'cancelar' ? (
        <ConfirmarBloque
          titulo="Cancelar solicitudes en bloque"
          icono="cerrar"
          queHace="cancelar la solicitud"
          filas={filas}
          listo={motivo.trim().length >= 3}
          onClose={cerrar}
          onHecho={hecho}
        >
          <Field label="Motivo" hint="Queda apuntado en cada solicitud y en la ficha de cada coche.">
            <Input value={motivo} onChangeText={setMotivo} placeholder="Por qué se cancelan" />
          </Field>
        </ConfirmarBloque>
      ) : null}
    </>
  );
}

/* -------------------------------------------------------- preparación */

export function AccionesPreparacion({ preps, onHecho, limpiar }: { preps: Preparation[] } & Hecho) {
  const { state } = useStore();
  const { can } = usePerms();
  const [accion, setAccion] = useState<'asignar' | 'cancelar' | null>(null);
  const [preparadorId, setPreparadorId] = useState('');
  const [motivo, setMotivo] = useState('');
  const cerrar = () => setAccion(null);
  const hecho = (m: string) => {
    cerrar();
    limpiar();
    onHecho(m);
  };

  const preparadores = state.users.filter((u) => u.active && puede(state, u, 'preparacion.ejecutar'));
  const preparador = preparadores.find((u) => u.id === preparadorId);

  const filas = useMemo(
    () =>
      accion === 'asignar'
        ? preparador
          ? filasAsignarPreparador(state, preps, preparador)
          : []
        : accion === 'cancelar'
          ? filasCancelarPreparaciones(state, preps, motivo.trim())
          : [],
    [accion, preparador, motivo, state, preps]
  );

  return (
    <>
      {can('solicitudes.gestionar') ? (
        <Btn
          small
          icon="persona"
          onPress={() => {
            setPreparadorId('');
            setAccion('asignar');
          }}
        >
          Asignar preparador
        </Btn>
      ) : null}
      {can('solicitudes.gestionar') ? (
        <Btn
          small
          icon="cerrar"
          onPress={() => {
            setMotivo('');
            setAccion('cancelar');
          }}
        >
          Cancelar
        </Btn>
      ) : null}

      {accion === 'asignar' ? (
        <ConfirmarBloque
          titulo="Asignar preparador en bloque"
          icono="persona"
          queHace={`pasar la preparación a ${preparador?.name ?? ''}`}
          filas={filas}
          listo={!!preparador}
          onClose={cerrar}
          onHecho={hecho}
        >
          <Field label="Preparador">
            <Select
              full
              value={preparadorId}
              onChange={setPreparadorId}
              placeholder="Elige quién la hace"
              title="Preparador"
              options={preparadores.map((u) => ({ value: u.id, label: u.name }))}
            />
          </Field>
        </ConfirmarBloque>
      ) : null}
      {accion === 'cancelar' ? (
        <ConfirmarBloque
          titulo="Cancelar preparaciones en bloque"
          icono="cerrar"
          queHace="cancelar la preparación"
          filas={filas}
          listo={motivo.trim().length >= 3}
          onClose={cerrar}
          onHecho={hecho}
        >
          <Field label="Motivo" hint="Queda apuntado en cada solicitud y en la ficha de cada coche.">
            <Input value={motivo} onChangeText={setMotivo} placeholder="Por qué se cancelan" />
          </Field>
        </ConfirmarBloque>
      ) : null}
    </>
  );
}
