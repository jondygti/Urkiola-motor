import React, { useMemo } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Btn, Modal, Notice, Spacer, space, tipografia, useTheme, type IconName } from '@/ui';
import { useStore } from '@/data/store';
import { comprobarBloque, type FilaBloque } from '@/data/bloque';

/**
 * Confirmación de una acción en bloque.
 *
 * Dice cuántos coches, y cuáles no la admiten y por qué, **antes** de
 * hacer nada. Después manda un comando por coche, como si se hubiera hecho
 * de uno en uno: cada coche se queda con su apunte en el historial, y el
 * servidor vuelve a comprobar cada uno (`src/data/bloque.ts`).
 */
export function ConfirmarBloque({
  titulo,
  icono,
  queHace,
  filas,
  children,
  listo = true,
  onClose,
  onHecho,
}: {
  titulo: string;
  icono: IconName;
  /** «pedir traslado a Leioa», «cancelar»… para la frase de la cuenta. */
  queHace: string;
  filas: FilaBloque[];
  /** Lo que haya que elegir antes (destino, comercial, motivo…). */
  children?: React.ReactNode;
  /** false mientras falte algo por elegir. */
  listo?: boolean;
  onClose: () => void;
  onHecho: (mensaje: string) => void;
}) {
  const { c } = useTheme();
  const { state, user, run } = useStore();
  const { admitidos, rechazados } = useMemo(() => comprobarBloque(state, user, filas), [state, user, filas]);
  const n = admitidos.length;
  const conAviso = admitidos.filter((a) => a.aviso);
  const coches = (k: number) => (k === 1 ? '1 coche' : `${k} coches`);

  const aplicar = () => {
    for (const a of admitidos) run(a.comando);
    onHecho(
      rechazados.length
        ? `Hecho en ${coches(n)}. ${rechazados.length === 1 ? '1 no la admitía' : `${rechazados.length} no la admitían`}.`
        : `Hecho en ${coches(n)}.`
    );
  };

  return (
    <Modal
      visible
      onClose={onClose}
      icon={icono}
      title={titulo}
      footer={
        <Btn variant="primary" full disabled={!listo || n === 0} onPress={aplicar}>
          {n === 0 ? 'Ningún coche la admite' : `Aplicar a ${coches(n)}`}
        </Btn>
      }
    >
      {children}
      {listo ? (
        <>
          <Text testID="bloque-cuenta" style={{ fontSize: tipografia.body, fontWeight: '800', color: c.text }}>
            Se va a {queHace} en {coches(n)}
            {rechazados.length ? ` de los ${filas.length} seleccionados` : ''}.
          </Text>
          {rechazados.length ? (
            <>
              <Spacer h={space.sm} />
              <Notice tone="warn" icon="aviso">
                {rechazados.length === 1
                  ? 'Este no la admite y se quedará como está:'
                  : `Estos ${rechazados.length} no la admiten y se quedarán como están:`}
              </Notice>
              <ScrollView style={{ maxHeight: 220 }} testID="bloque-rechazados">
                {rechazados.map((r, i) => (
                  <View
                    key={`${r.etiqueta}-${i}`}
                    style={{ flexDirection: 'row', gap: 8, paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: c.borderSoft }}
                  >
                    <Text style={{ fontSize: tipografia.small, fontWeight: '800', color: c.text, minWidth: 90 }}>{r.etiqueta}</Text>
                    <Text style={{ flex: 1, fontSize: tipografia.small, color: c.textMuted }}>{r.motivo}</Text>
                  </View>
                ))}
              </ScrollView>
            </>
          ) : null}
          {conAviso.length ? (
            <>
              <Spacer h={space.sm} />
              <Notice tone="warn" icon="alarma">
                {conAviso.length === 1 ? 'Ojo con este:' : `Ojo con estos ${conAviso.length}:`}
              </Notice>
              <View testID="bloque-avisos">
                {conAviso.map((a, i) => (
                  <View
                    key={`${a.etiqueta}-${i}`}
                    style={{ flexDirection: 'row', gap: 8, paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: c.borderSoft }}
                  >
                    <Text style={{ fontSize: tipografia.small, fontWeight: '800', color: c.text, minWidth: 90 }}>{a.etiqueta}</Text>
                    <Text style={{ flex: 1, fontSize: tipografia.small, color: c.textMuted }}>{a.aviso}</Text>
                  </View>
                ))}
              </View>
            </>
          ) : null}
          <Spacer h={space.sm} />
          <Text style={{ fontSize: tipografia.micro, color: c.textFaint }}>
            Cada coche queda con su propio apunte en el historial, igual que si se hiciera de uno en uno.
          </Text>
        </>
      ) : null}
    </Modal>
  );
}
