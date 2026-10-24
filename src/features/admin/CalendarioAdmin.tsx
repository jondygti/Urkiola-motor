import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { Btn, Field, Grid, Input, Modal, Muted, Notice, Panel, Pill, Segmented, Select, Toolbar, space, tipografia, useTheme } from '@/ui';
import { useStore } from '@/data/store';
import { diaEnEspana } from '@/data/delivery-date';
import { TIPO_AUSENCIA_LABEL, type FichaLaboral, type TipoAusencia, type User } from '@/data/types';
import { JORNADA_MINUTOS, fichaDeSerie, fichaVigente, leerDia, leerJornada, preparadores, textoDia, textoJornada } from '@/data/ocupacion';

/**
 * Calendario de los preparadores: con qué jornada trabaja cada uno, en qué
 * sedes y en qué proporción, cuándo no está y qué días no se trabaja en cada
 * sede. De aquí salen las horas de presencia de la ocupación.
 *
 * Las ausencias no llevan motivo a propósito: de una baja basta con saber
 * que existe. Y todo esto solo lo recibe quien ve la ocupación.
 */
export function CalendarioAdmin({ onDone }: { onDone: (m: string) => void }) {
  const { state, run } = useStore();
  const { c } = useTheme();
  const [ficha, setFicha] = useState<User | null>(null);
  const [ausencia, setAusencia] = useState(false);
  const [festivo, setFestivo] = useState(false);
  const hoy = diaEnEspana(new Date().toISOString());
  const sedeNombre = (id: string | null) => (id ? state.sites.find((s) => s.id === id)?.name ?? id : 'Todas las sedes');
  const gente = preparadores(state);
  const fichas = state.fichasLaborales ?? [];
  // Las de los últimos tres meses y las que vienen: lo de antes ya no se toca.
  const desde = diaEnEspana(new Date(Date.now() - 92 * 86_400_000).toISOString());
  const ausencias = (state.ausencias ?? []).filter((a) => a.hasta >= desde).sort((a, b) => a.desde.localeCompare(b.desde));
  const festivos = (state.config.festivos ?? []).filter((f) => f.fecha >= `${hoy.slice(0, 4)}-01-01`)
    .sort((a, b) => a.fecha.localeCompare(b.fecha));

  const fila = { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8, paddingVertical: 8,
    borderBottomWidth: 1, borderBottomColor: c.borderSoft, flexWrap: 'wrap' as const };

  return (
    <>
      <Panel icon="personas" title="Jornada y sedes de cada preparador">
        <Muted>
          De lunes a viernes. Si alguien trabaja entre sedes, se reparte su jornada en porcentajes. Cada cambio lleva la
          fecha desde la que vale, para que los meses anteriores sigan contándose como fueron.
        </Muted>
        {gente.map((u) => {
          const vigente = fichaVigente(fichas, u.id, hoy);
          const deSerie = vigente ? null : fichaDeSerie(state, u);
          const f = vigente ?? deSerie;
          const historico = fichas.filter((x) => x.userId === u.id).sort((a, b) => b.desde.localeCompare(a.desde));
          return (
            <View key={u.id} testID="ficha-preparador" style={fila}>
              <View style={{ flex: 1, minWidth: 200 }}>
                <Text style={{ fontSize: tipografia.body, fontWeight: '700', color: c.text }}>{u.name}</Text>
                <Text style={{ fontSize: tipografia.micro, color: c.textMuted }}>
                  {f
                    ? `${textoJornada(f.jornadaMinutos)} · ${f.reparto.map((r) => `${sedeNombre(r.siteId)} ${Math.round(r.pct)} %`).join(' · ')}`
                    : 'Sin sedes que preparen: no cuenta para la ocupación'}
                  {vigente ? ` · desde ${textoDia(vigente.desde)}` : ''}
                </Text>
                {historico.length > 1 ? (
                  <Text style={{ fontSize: tipografia.micro, color: c.textFaint }}>
                    Antes: {historico.slice(1).map((x) => `desde ${textoDia(x.desde)}, ${x.reparto.map((r) => `${sedeNombre(r.siteId)} ${Math.round(r.pct)} %`).join(' · ')}`).join(' · ')}
                  </Text>
                ) : null}
              </View>
              {!vigente ? <Pill tone="amber">Sin ficha</Pill> : null}
              <Btn small onPress={() => setFicha(u)}>
                {vigente ? 'Cambiar' : 'Poner ficha'}
              </Btn>
            </View>
          );
        })}
        {gente.length === 0 ? <Notice>No hay preparadores dados de alta.</Notice> : null}
      </Panel>

      <View style={{ height: space.lg }} />

      <Grid cols={2} minWidth={380}>
        <Panel icon="calendario" title="Vacaciones, bajas y permisos">
          <Toolbar>
            <Btn variant="primary" onPress={() => setAusencia(true)}>
              + Ausencia
            </Btn>
          </Toolbar>
          {ausencias.map((a) => (
            <View key={a.id} testID="ausencia" style={fila}>
              <View style={{ flex: 1, minWidth: 160 }}>
                <Text style={{ fontSize: tipografia.body, fontWeight: '700', color: c.text }}>
                  {state.users.find((u) => u.id === a.userId)?.name ?? a.userId}
                </Text>
                <Text style={{ fontSize: tipografia.micro, color: c.textMuted }}>
                  {a.desde === a.hasta ? textoDia(a.desde) : `${textoDia(a.desde)} – ${textoDia(a.hasta)}`}
                </Text>
              </View>
              <Pill tone={a.tipo === 'vacaciones' ? 'blue' : 'neutral'}>{TIPO_AUSENCIA_LABEL[a.tipo]}</Pill>
              <Btn
                small
                variant="ghost"
                onPress={() => {
                  run({ type: 'calendario.ausenciaBorrar', ausenciaId: a.id });
                  onDone('Ausencia borrada.');
                }}
              >
                Borrar
              </Btn>
            </View>
          ))}
          {ausencias.length === 0 ? <Muted>No hay ausencias apuntadas.</Muted> : null}
        </Panel>

        <Panel icon="calendario" title={`Festivos de ${hoy.slice(0, 4)} en adelante`}>
          <Toolbar>
            <Btn variant="primary" onPress={() => setFestivo(true)}>
              + Festivo
            </Btn>
          </Toolbar>
          {festivos.map((f) => (
            <View key={f.id} testID="festivo" style={fila}>
              <View style={{ flex: 1, minWidth: 160 }}>
                <Text style={{ fontSize: tipografia.body, fontWeight: '700', color: c.text }}>{f.nombre}</Text>
                <Text style={{ fontSize: tipografia.micro, color: c.textMuted }}>
                  {textoDia(f.fecha)} · {sedeNombre(f.siteId)}
                </Text>
              </View>
              <Btn
                small
                variant="ghost"
                onPress={() => {
                  run({ type: 'calendario.festivoBorrar', festivoId: f.id });
                  onDone(`Festivo «${f.nombre}» borrado.`);
                }}
              >
                Borrar
              </Btn>
            </View>
          ))}
          {festivos.length === 0 ? <Muted>No hay festivos apuntados.</Muted> : null}
          <Muted>Los locales van con su sede: San Marcial es fiesta en Irun, no en Leioa.</Muted>
        </Panel>
      </Grid>

      {ficha ? (
        <FichaModal
          preparador={ficha}
          actual={fichaVigente(fichas, ficha.id, hoy) ?? fichaDeSerie(state, ficha)}
          hoy={hoy}
          onClose={() => setFicha(null)}
          onDone={onDone}
        />
      ) : null}
      {ausencia ? <AusenciaModal gente={gente} hoy={hoy} onClose={() => setAusencia(false)} onDone={onDone} /> : null}
      {festivo ? <FestivoModal hoy={hoy} onClose={() => setFestivo(false)} onDone={onDone} /> : null}
    </>
  );
}

function FichaModal({
  preparador,
  actual,
  hoy,
  onClose,
  onDone,
}: {
  preparador: User;
  actual: FichaLaboral | null;
  hoy: string;
  onClose: () => void;
  onDone: (m: string) => void;
}) {
  const { state, run } = useStore();
  const { c } = useTheme();
  const sedes = state.sites.filter((s) => s.prepares);
  const [desde, setDesde] = useState(textoDia(hoy));
  const [jornada, setJornada] = useState(textoJornada(actual?.jornadaMinutos ?? JORNADA_MINUTOS).replace(' min', ''));
  const [pcts, setPcts] = useState<Record<string, string>>(() =>
    Object.fromEntries((actual?.reparto ?? []).map((r) => [r.siteId, String(Math.round(r.pct))]))
  );
  const [error, setError] = useState<string | null>(null);
  const reparto = sedes
    .map((s) => ({ siteId: s.id, pct: Number((pcts[s.id] ?? '').replace(',', '.')) || 0 }))
    .filter((r) => r.pct > 0);
  const suma = reparto.reduce((t, r) => t + r.pct, 0);

  const guardar = () => {
    const dia = leerDia(desde);
    if (!dia) return setError('La fecha tiene que ser como 01/11/2026.');
    const minutos = leerJornada(jornada);
    if (!minutos || minutos > 12 * 60) return setError('La jornada tiene que ser como 7:40.');
    if (reparto.length === 0) return setError('Pon en qué sede trabaja.');
    if (Math.abs(suma - 100) > 0.5) return setError(`El reparto suma ${suma} %, y tiene que sumar 100 %.`);
    run({ type: 'calendario.ficha', preparadorId: preparador.id, desde: dia, jornadaMinutos: minutos, reparto });
    onDone(`Ficha de ${preparador.name} guardada desde el ${textoDia(dia)}.`);
    onClose();
  };

  return (
    <Modal
      visible
      onClose={onClose}
      icon="persona"
      title={`Jornada · ${preparador.name}`}
      footer={
        <Btn variant="primary" full onPress={guardar}>
          Guardar
        </Btn>
      }
    >
      <Field label="Desde qué día vale" hint="Lo anterior sigue contándose con la ficha que tenía.">
        <Input value={desde} onChangeText={setDesde} placeholder="01/11/2026" />
      </Field>
      <Field label="Jornada diaria" hint="De lunes a viernes. Por ejemplo, 7:40.">
        <Input value={jornada} onChangeText={setJornada} placeholder="7:40" />
      </Field>
      <Field label="Reparto entre sedes (%)" hint={`Suma ${suma} %. Tiene que sumar 100.`}>
        {sedes.map((s) => (
          <View key={s.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <Text style={{ flex: 1, fontSize: tipografia.body, color: c.text }}>{s.name}</Text>
            <View style={{ width: 90 }}>
              <Input
                small
                keyboardType="numeric"
                placeholder="0"
                value={pcts[s.id] ?? ''}
                onChangeText={(v) => setPcts((p) => ({ ...p, [s.id]: v.replace(/[^\d,.]/g, '') }))}
              />
            </View>
          </View>
        ))}
      </Field>
      {error ? <Notice tone="danger">{error}</Notice> : null}
    </Modal>
  );
}

function AusenciaModal({
  gente,
  hoy,
  onClose,
  onDone,
}: {
  gente: User[];
  hoy: string;
  onClose: () => void;
  onDone: (m: string) => void;
}) {
  const { run } = useStore();
  const [quien, setQuien] = useState<string | null>(gente[0]?.id ?? null);
  const [tipo, setTipo] = useState<TipoAusencia>('vacaciones');
  const [desde, setDesde] = useState(textoDia(hoy));
  const [hasta, setHasta] = useState(textoDia(hoy));
  const [error, setError] = useState<string | null>(null);

  const guardar = () => {
    const d = leerDia(desde);
    const h = leerDia(hasta);
    if (!quien) return setError('Elige quién.');
    if (!d || !h) return setError('Las fechas tienen que ser como 01/11/2026.');
    if (h < d) return setError('El último día no puede ser anterior al primero.');
    run({ type: 'calendario.ausencia', preparadorId: quien, desde: d, hasta: h, tipo });
    onDone('Ausencia apuntada.');
    onClose();
  };

  return (
    <Modal
      visible
      onClose={onClose}
      icon="calendario"
      title="Nueva ausencia"
      footer={
        <Btn variant="primary" full onPress={guardar}>
          Apuntar
        </Btn>
      }
    >
      <Field label="Quién">
        <Select value={quien} onChange={setQuien} full options={gente.map((u) => ({ value: u.id, label: u.name }))} />
      </Field>
      <Field label="Qué" hint="Sin motivo: de una baja basta con saber que existe.">
        <Segmented
          value={tipo}
          onChange={setTipo}
          options={(Object.keys(TIPO_AUSENCIA_LABEL) as TipoAusencia[]).map((t) => ({ value: t, label: TIPO_AUSENCIA_LABEL[t] }))}
        />
      </Field>
      <Field label="Primer día">
        <Input value={desde} onChangeText={setDesde} placeholder="01/11/2026" />
      </Field>
      <Field label="Último día">
        <Input value={hasta} onChangeText={setHasta} placeholder="05/11/2026" />
      </Field>
      {error ? <Notice tone="danger">{error}</Notice> : null}
    </Modal>
  );
}

function FestivoModal({ hoy, onClose, onDone }: { hoy: string; onClose: () => void; onDone: (m: string) => void }) {
  const { state, run } = useStore();
  const [fecha, setFecha] = useState(textoDia(hoy));
  const [sede, setSede] = useState<string>('todas');
  const [nombre, setNombre] = useState('');
  const [error, setError] = useState<string | null>(null);

  const guardar = () => {
    const dia = leerDia(fecha);
    if (!dia) return setError('La fecha tiene que ser como 01/11/2026.');
    if (!nombre.trim()) return setError('Ponle nombre.');
    run({ type: 'calendario.festivo', fecha: dia, siteId: sede === 'todas' ? null : sede, nombre: nombre.trim() });
    onDone(`Festivo «${nombre.trim()}» apuntado.`);
    onClose();
  };

  return (
    <Modal
      visible
      onClose={onClose}
      icon="calendario"
      title="Nuevo festivo"
      footer={
        <Btn variant="primary" full onPress={guardar}>
          Apuntar
        </Btn>
      }
    >
      <Field label="Día">
        <Input value={fecha} onChangeText={setFecha} placeholder="31/07/2026" />
      </Field>
      <Field label="Sede" hint="Los nacionales y de Euskadi, en todas; los locales, en la suya.">
        <Select
          value={sede}
          onChange={setSede}
          full
          options={[
            { value: 'todas', label: 'Todas las sedes' },
            ...state.sites.filter((s) => s.prepares).map((s) => ({ value: s.id, label: s.name })),
          ]}
        />
      </Field>
      <Field label="Nombre">
        <Input value={nombre} onChangeText={setNombre} placeholder="San Ignacio" />
      </Field>
      {error ? <Notice tone="danger">{error}</Notice> : null}
    </Modal>
  );
}
