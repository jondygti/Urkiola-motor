import React, { useEffect, useState } from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import { Btn, Field, Notice, radius, space, useTheme, tipografia } from '@/ui';
import { api } from '@/data/api';
import { capturarYSubir, type FotoTomada } from './photos';
import { descartarFotoPendiente } from '@/data/photoQueue';

/**
 * Campo para hacer fotos y subirlas.
 *
 * Las fotos de daños son la prueba para reclamar al transportista, así que
 * lo importante aquí no es hacerlas: es que **salgan del móvil**. Se suben
 * en cuanto se hacen y, si alguna no sube, se dice con todas las letras en
 * vez de dejar creer que está guardada.
 */
export function CampoFotos({
  fotos,
  onChange,
  label = 'Fotos',
  hint,
}: {
  fotos: string[];
  onChange: (refs: string[]) => void;
  label?: string;
  hint?: string;
}) {
  const { c } = useTheme();
  const [tomadas, setTomadas] = useState<FotoTomada[]>([]);
  const [subiendo, setSubiendo] = useState(false);

  const pendientes = tomadas.filter((f) => !f.subida).length;

  const anadir = async (origen: 'camera' | 'library') => {
    setSubiendo(true);
    const foto = await capturarYSubir(origen);
    setSubiendo(false);
    if (!foto) return;
    const siguiente = [...tomadas, foto];
    setTomadas(siguiente);
    onChange(siguiente.map((f) => f.ref));
  };

  const quitar = (ref: string) => {
    const foto = tomadas.find((f) => f.ref === ref);
    if (foto && !foto.subida) void descartarFotoPendiente(ref);
    const siguiente = tomadas.filter((f) => f.ref !== ref);
    setTomadas(siguiente);
    onChange(siguiente.map((f) => f.ref));
  };

  return (
    <Field label={`${label} (${fotos.length})`} hint={hint}>
      {tomadas.length ? (
        <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginBottom: space.sm }}>
          {tomadas.map((f) => (
            <Pressable key={f.ref} onPress={() => quitar(f.ref)}>
              <Image
                source={{ uri: f.vistaPrevia }}
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: radius.sm,
                  backgroundColor: c.surfaceSunken,
                  borderWidth: f.subida ? 0 : 2,
                  borderColor: c.amberFg,
                }}
              />
              <Text style={{ fontSize: tipografia.label, color: c.textFaint, textAlign: 'center', marginTop: 2 }}>
                {f.subida ? 'quitar' : 'sin subir'}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Btn small onPress={() => void anadir('camera')} disabled={subiendo}>
          {subiendo ? 'Subiendo…' : '📷 Hacer foto'}
        </Btn>
        <Btn small onPress={() => void anadir('library')} disabled={subiendo}>
          🖼️ Galería
        </Btn>
      </View>

      {pendientes > 0 ? (
        <>
          <View style={{ height: space.sm }} />
          <Notice tone="warn">
            {pendientes === 1 ? 'Una foto no ha subido' : `${pendientes} fotos no han subido`}: están
            guardadas en este móvil y se subirán automáticamente cuando vuelva la cobertura.
          </Notice>
        </>
      ) : null}
    </Field>
  );
}

/** Fotos ya guardadas, para verlas. Se pulsan para abrirlas a tamaño real. */
export function Fotos({ refs, onAbrir }: { refs: string[]; onAbrir?: (url: string) => void }) {
  const { c } = useTheme();
  const [urls, setUrls] = useState<Record<string, string>>({});
  const clave = refs.join('\u0000');

  useEffect(() => {
    let activa = true;
    void Promise.all(
      refs.map(async (ref) => {
        try {
          return [ref, await api.urlFoto(ref)] as const;
        } catch {
          return [ref, ''] as const;
        }
      })
    ).then((entradas) => {
      if (activa) setUrls(Object.fromEntries(entradas));
    });
    return () => {
      activa = false;
    };
  }, [clave]);

  if (refs.length === 0) return null;

  const abrir = (ref: string) => {
    if (!onAbrir) return;
    void api.urlFoto(ref).then(onAbrir).catch(() => undefined);
  };

  return (
    <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginTop: space.md }}>
      {refs.map((ref) => {
        // Las del parque de ejemplo no existen: se pinta el hueco.
        if (ref.startsWith('demo://')) {
          return (
            <View
              key={ref}
              style={{
                width: 72,
                height: 72,
                borderRadius: radius.sm,
                backgroundColor: c.surfaceSunken,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={{ fontSize: tipografia.title }}>📷</Text>
            </View>
          );
        }

        const url = urls[ref];
        return (
          <Pressable key={ref} onPress={() => abrir(ref)} disabled={!url}>
            {url ? (
              <Image
                source={{ uri: url }}
                style={{ width: 72, height: 72, borderRadius: radius.sm, backgroundColor: c.surfaceSunken }}
              />
            ) : (
              <View
                style={{
                  width: 72,
                  height: 72,
                  borderRadius: radius.sm,
                  backgroundColor: c.surfaceSunken,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text style={{ fontSize: tipografia.label, color: c.textFaint }}>Cargando…</Text>
              </View>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}
