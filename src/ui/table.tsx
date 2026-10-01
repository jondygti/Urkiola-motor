import React, { useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { radius, space, tipografia, useTheme } from './theme';
import { EmptyState, Label } from './primitives';
import { Input, Option, Select } from './controls';
import { Icon } from './Icon';

export type Column<T> = {
  key: string;
  header: string;
  /** Ancho en píxeles cuando la tabla se pinta como tabla (escritorio). */
  width?: number;
  render: (row: T) => React.ReactNode;
  /** Texto plano de la celda: se usa para filtrar y ordenar. */
  value?: (row: T) => string;
  /** Filtro por columna, como en el mockup. */
  filter?: { type: 'text' } | { type: 'select'; options: Option[] };
  /** En móvil se usa como título de la tarjeta. */
  primary?: boolean;
  /** En móvil se oculta. */
  secondary?: boolean;
  /**
   * En móvil va a la izquierda del título de la tarjeta, sin etiqueta: la
   * foto del coche, que se reconoce sin leer nada.
   */
  leading?: boolean;
  /**
   * Se puede ordenar por esta columna pulsando su cabecera: primero de
   * mayor a menor (lo que más lleva, arriba), luego al revés, luego como
   * venía.
   */
  sortValue?: (row: T) => number;
};

type Orden = { key: string; desc: boolean } | null;

/**
 * Tabla con filtros por columna. En pantallas anchas se pinta como tabla
 * con scroll horizontal; en móvil, como lista de tarjetas legible.
 */
export function DataTable<T>({
  columns,
  rows,
  keyExtractor,
  onRowPress,
  emptyText = 'No hay registros que coincidan con los filtros.',
  showFilters = true,
  pageSize = 40,
  accionesEnBloque,
}: {
  columns: Column<T>[];
  rows: T[];
  keyExtractor: (row: T) => string;
  onRowPress?: (row: T) => void;
  emptyText?: string;
  showFilters?: boolean;
  /** Nº de filas visibles antes de pulsar «Mostrar más». */
  pageSize?: number;
  /**
   * Acciones en bloque, solo en escritorio: con esto la tabla lleva una
   * casilla por fila y «seleccionar todos los filtrados», y pinta encima lo
   * que devuelva esta función con las filas marcadas. En el móvil no: allí
   * se trabaja coche a coche, con el coche delante.
   */
  accionesEnBloque?: (seleccionadas: T[], limpiar: () => void) => React.ReactNode;
}) {
  const { c, isDesktop } = useTheme();
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [limit, setLimit] = useState(pageSize);
  const [orden, setOrden] = useState<Orden>(null);
  const [marcadas, setMarcadas] = useState<Set<string>>(() => new Set());

  const hasFilters = showFilters && columns.some((col) => col.filter);

  const filtered = useMemo(() => {
    const active = Object.entries(filters).filter(([, v]) => v && v !== '__all__');
    if (!active.length) return rows;
    return rows.filter((row) =>
      active.every(([key, needle]) => {
        const col = columns.find((x) => x.key === key);
        if (!col) return true;
        const cell = (col.value?.(row) ?? '').toLowerCase();
        if (col.filter?.type === 'select') return cell === needle.toLowerCase();
        return cell.includes(needle.toLowerCase());
      })
    );
  }, [rows, filters, columns]);

  const ordenadas = useMemo(() => {
    const col = orden ? columns.find((x) => x.key === orden.key) : undefined;
    if (!orden || !col?.sortValue) return filtered;
    // Cada valor se calcula una vez por fila y no en cada comparación:
    // ordenar 400 filas son miles de comparaciones.
    const conValor = filtered.map((row) => ({ row, v: col.sortValue!(row) }));
    conValor.sort((a, b) => (orden.desc ? b.v - a.v : a.v - b.v));
    return conValor.map((x) => x.row);
  }, [filtered, orden, columns]);

  const ordenarPor = (key: string) => {
    setLimit(pageSize);
    setOrden((o) => (o?.key !== key ? { key, desc: true } : o.desc ? { key, desc: false } : null));
  };
  const ordenables = columns.filter((x) => x.sortValue);

  const setFilter = (key: string, v: string) => {
    setLimit(pageSize);
    setFilters((f) => ({ ...f, [key]: v }));
  };

  const visible = ordenadas.slice(0, limit);

  // Lo marcado que ya no está entre las filas (se cerró, se canceló, se
  // filtró fuera) deja de contar: una acción en bloque solo va sobre lo que
  // se ve en la lista filtrada.
  const seleccionadas = useMemo(
    () => (marcadas.size ? filtered.filter((r) => marcadas.has(keyExtractor(r))) : []),
    [filtered, marcadas, keyExtractor]
  );
  const conBloque = !!accionesEnBloque && isDesktop;
  const todasMarcadas = filtered.length > 0 && seleccionadas.length === filtered.length;
  const marcar = (id: string) =>
    setMarcadas((m) => {
      const n = new Set(m);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const marcarFiltradas = () => setMarcadas(new Set(filtered.map(keyExtractor)));
  const limpiar = () => setMarcadas(new Set());
  const more = filtered.length - visible.length;

  /* ------------------------------------------------------------ móvil */
  if (!isDesktop) {
    return (
      <View>
        {hasFilters ? (
          <MobileFilters columns={columns} filters={filters} setFilter={setFilter} />
        ) : null}
        {ordenables.length ? (
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginBottom: space.sm }}>
            {ordenables.map((col) => (
              <BotonOrden key={col.key} header={col.header} orden={orden?.key === col.key ? orden : null} onPress={() => ordenarPor(col.key)} />
            ))}
          </View>
        ) : null}
        {filtered.length === 0 ? (
          <EmptyState text={emptyText} />
        ) : (
          visible.map((row) => {
            const primary = columns.find((x) => x.primary) ?? columns.find((x) => !x.leading) ?? columns[0];
            const leading = columns.find((x) => x.leading);
            const rest = columns.filter((x) => x !== primary && x !== leading && !x.secondary);
            return (
              <Pressable
                key={keyExtractor(row)}
                onPress={onRowPress ? () => onRowPress(row) : undefined}
                style={({ pressed }) => ({
                  borderWidth: 1,
                  borderColor: c.border,
                  backgroundColor: pressed ? c.surfaceAlt : c.surface,
                  borderRadius: radius.md,
                  padding: 12,
                  marginBottom: space.sm,
                })}
              >
                {leading ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                    {leading.render(row)}
                    <View style={{ flex: 1 }}>{primary.render(row)}</View>
                  </View>
                ) : (
                  <View style={{ marginBottom: 6 }}>{primary.render(row)}</View>
                )}
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                  {rest.map((col) => (
                    <View key={col.key} style={{ minWidth: '45%', flexShrink: 1 }}>
                      <Label>{col.header}</Label>
                      <View style={{ marginTop: 2 }}>{col.render(row)}</View>
                    </View>
                  ))}
                </View>
              </Pressable>
            );
          })
        )}
        <ShowMore more={more} onPress={() => setLimit((l) => l + pageSize)} />
        <ResultCount shown={visible.length} total={filtered.length} />
      </View>
    );
  }

  /* --------------------------------------------------------- escritorio */
  const totalWidth = columns.reduce((acc, col) => acc + (col.width ?? 150), 0) + (conBloque ? 40 : 0);

  return (
    <View>
      {conBloque && seleccionadas.length > 0 ? (
        <View
          testID="barra-bloque"
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 10,
            padding: 10,
            marginBottom: space.sm,
            borderRadius: radius.md,
            borderWidth: 1,
            borderColor: c.primary,
            backgroundColor: c.surfaceAlt,
          }}
        >
          <Text style={{ fontSize: tipografia.small, fontWeight: '800', color: c.text }}>
            {seleccionadas.length === 1 ? '1 seleccionado' : `${seleccionadas.length} seleccionados`}
          </Text>
          {!todasMarcadas ? (
            <Pressable onPress={marcarFiltradas} accessibilityRole="button">
              <Text style={{ fontSize: tipografia.small, fontWeight: '700', color: c.primary }}>
                Seleccionar los {filtered.length} filtrados
              </Text>
            </Pressable>
          ) : null}
          <Pressable onPress={limpiar} accessibilityRole="button">
            <Text style={{ fontSize: tipografia.small, fontWeight: '700', color: c.textMuted }}>Quitar selección</Text>
          </Pressable>
          <View style={{ flex: 1 }} />
          {accionesEnBloque!(seleccionadas, limpiar)}
        </View>
      ) : null}
      <ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={{ minWidth: '100%' }}>
        <View style={{ minWidth: totalWidth }}>
          {/* cabecera */}
          <View
            style={{
              flexDirection: 'row',
              borderBottomWidth: 1,
              borderBottomColor: c.border,
              paddingBottom: 8,
            }}
          >
            {conBloque ? (
              <View style={{ width: 40, paddingHorizontal: 8, justifyContent: 'flex-end' }}>
                <Casilla
                  marcada={todasMarcadas}
                  onPress={todasMarcadas ? limpiar : marcarFiltradas}
                  etiqueta={todasMarcadas ? 'Quitar selección' : `Seleccionar los ${filtered.length} filtrados`}
                  testID="casilla-todas"
                />
              </View>
            ) : null}
            {columns.map((col) => (
              <View key={col.key} style={{ width: col.width ?? 150, paddingHorizontal: 8 }}>
                {col.sortValue ? (
                  <Pressable
                    onPress={() => ordenarPor(col.key)}
                    accessibilityRole="button"
                    accessibilityLabel={`Ordenar por ${col.header}`}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}
                  >
                    <Text style={{ fontSize: tipografia.micro, fontWeight: '800', color: orden?.key === col.key ? c.primary : c.textFaint }}>
                      {col.header}
                    </Text>
                    <Icon
                      name={orden?.key === col.key ? (orden.desc ? 'bajar' : 'subir') : 'abajo'}
                      size={tipografia.small}
                      color={orden?.key === col.key ? c.primary : c.textFaint}
                    />
                  </Pressable>
                ) : (
                  <Text style={{ fontSize: tipografia.micro, fontWeight: '800', color: c.textFaint }}>{col.header}</Text>
                )}
                {hasFilters && col.filter ? (
                  <View style={{ marginTop: 5 }}>
                    {col.filter.type === 'text' ? (
                      <Input
                        small
                        value={filters[col.key] ?? ''}
                        onChangeText={(v) => setFilter(col.key, v)}
                        placeholder="Filtrar"
                        autoCapitalize="none"
                      />
                    ) : (
                      <Select
                        small
                        full
                        value={filters[col.key] ?? '__all__'}
                        options={[{ value: '__all__', label: 'Todos' }, ...col.filter.options]}
                        onChange={(v) => setFilter(col.key, v)}
                        title={col.header}
                      />
                    )}
                  </View>
                ) : null}
              </View>
            ))}
          </View>

          {/* filas */}
          {visible.map((row) => (
            <Pressable
              key={keyExtractor(row)}
              onPress={onRowPress ? () => onRowPress(row) : undefined}
              disabled={!onRowPress}
              style={({ hovered, pressed }: { hovered?: boolean; pressed: boolean }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                borderBottomWidth: 1,
                borderBottomColor: c.borderSoft,
                backgroundColor: pressed || hovered ? c.surfaceAlt : 'transparent',
                minHeight: 46,
                ...(Platform.OS === 'web' && onRowPress ? ({ cursor: 'pointer' } as object) : null),
              })}
            >
              {conBloque ? (
                <View style={{ width: 40, paddingHorizontal: 8 }}>
                  <Casilla
                    marcada={marcadas.has(keyExtractor(row))}
                    onPress={() => marcar(keyExtractor(row))}
                    etiqueta="Seleccionar esta fila"
                  />
                </View>
              ) : null}
              {columns.map((col) => (
                <View key={col.key} style={{ width: col.width ?? 150, paddingHorizontal: 8, paddingVertical: 9 }}>
                  {col.render(row)}
                </View>
              ))}
            </Pressable>
          ))}
        </View>
      </ScrollView>
      {filtered.length === 0 ? <EmptyState text={emptyText} /> : null}
      <ShowMore more={more} onPress={() => setLimit((l) => l + pageSize)} />
      <ResultCount shown={visible.length} total={filtered.length} />
    </View>
  );
}

function Casilla({
  marcada,
  onPress,
  etiqueta,
  testID = 'casilla-bloque',
}: {
  marcada: boolean;
  onPress: () => void;
  etiqueta: string;
  testID?: string;
}) {
  const { c } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: marcada }}
      accessibilityLabel={etiqueta}
      testID={testID}
      hitSlop={8}
      style={{
        width: 20,
        height: 20,
        borderRadius: 5,
        borderWidth: 1.5,
        borderColor: marcada ? c.primary : c.border,
        backgroundColor: marcada ? c.primary : c.surface,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {marcada ? <Icon name="hecho" size={tipografia.small} color="#fff" /> : null}
    </Pressable>
  );
}

function BotonOrden({ header, orden, onPress }: { header: string; orden: Orden; onPress: () => void }) {
  const { c } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Ordenar por ${header}`}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        borderWidth: 1,
        borderColor: orden ? c.primary : c.border,
        backgroundColor: c.surface,
        borderRadius: radius.md,
        paddingVertical: 7,
        paddingHorizontal: 12,
      }}
    >
      <Text style={{ fontSize: tipografia.small, fontWeight: '700', color: orden ? c.primary : c.text }}>
        Ordenar por {header.toLowerCase()}
      </Text>
      <Icon name={orden ? (orden.desc ? 'bajar' : 'subir') : 'abajo'} size={tipografia.body} color={orden ? c.primary : c.textFaint} />
    </Pressable>
  );
}

function ShowMore({ more, onPress }: { more: number; onPress: () => void }) {
  const { c } = useTheme();
  if (more <= 0) return null;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        marginTop: space.sm,
        alignSelf: 'center',
        borderWidth: 1,
        borderColor: c.border,
        backgroundColor: pressed ? c.surfaceAlt : c.surface,
        borderRadius: radius.md,
        paddingVertical: 9,
        paddingHorizontal: 16,
      })}
    >
      <Text style={{ fontSize: tipografia.small, fontWeight: '700', color: c.text }}>
        Mostrar {Math.min(more, 40)} más · quedan {more}
      </Text>
    </Pressable>
  );
}

function ResultCount({ shown, total }: { shown: number; total: number }) {
  const { c } = useTheme();
  if (total === 0) return null;
  return (
    <Text style={{ fontSize: tipografia.micro, color: c.textFaint, marginTop: space.sm, textAlign: 'center' }}>
      {shown === total ? `${total} registros` : `${shown} de ${total} registros`}
    </Text>
  );
}

function MobileFilters<T>({
  columns,
  filters,
  setFilter,
}: {
  columns: Column<T>[];
  filters: Record<string, string>;
  setFilter: (k: string, v: string) => void;
}) {
  const { c } = useTheme();
  const [open, setOpen] = useState(false);
  const filterCols = columns.filter((col) => col.filter);
  const activeCount = filterCols.filter((col) => filters[col.key] && filters[col.key] !== '__all__').length;

  return (
    <View style={{ marginBottom: space.sm }}>
      <Pressable
        onPress={() => setOpen((o) => !o)}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderWidth: 1,
          borderColor: c.border,
          backgroundColor: c.surface,
          borderRadius: radius.md,
          paddingVertical: 9,
          paddingHorizontal: 12,
        }}
      >
        <Text style={{ fontSize: tipografia.small, fontWeight: '700', color: c.text }}>
          Filtros por columna{activeCount ? ` · ${activeCount} activos` : ''}
        </Text>
        <Icon name={open ? 'arriba' : 'abajo'} size={tipografia.body} color={c.textFaint} />
      </Pressable>

      {open ? (
        <View
          style={{
            borderWidth: 1,
            borderColor: c.border,
            borderTopWidth: 0,
            backgroundColor: c.surface,
            borderBottomLeftRadius: radius.md,
            borderBottomRightRadius: radius.md,
            padding: 12,
            gap: 10,
          }}
        >
          {filterCols.map((col) => (
            <View key={col.key}>
              <Label>{col.header}</Label>
              <View style={{ marginTop: 4 }}>
                {col.filter!.type === 'text' ? (
                  <Input
                    small
                    value={filters[col.key] ?? ''}
                    onChangeText={(v) => setFilter(col.key, v)}
                    placeholder="Filtrar"
                    autoCapitalize="none"
                  />
                ) : (
                  <Select
                    small
                    full
                    value={filters[col.key] ?? '__all__'}
                    options={[{ value: '__all__', label: 'Todos' }, ...(col.filter as { options: Option[] }).options]}
                    onChange={(v) => setFilter(col.key, v)}
                    title={col.header}
                  />
                )}
              </View>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}
