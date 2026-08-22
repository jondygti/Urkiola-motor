import React, { useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { radius, space, useTheme } from './theme';
import { EmptyState, Label } from './primitives';
import { Input, Option, Select } from './controls';

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
};

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
}: {
  columns: Column<T>[];
  rows: T[];
  keyExtractor: (row: T) => string;
  onRowPress?: (row: T) => void;
  emptyText?: string;
  showFilters?: boolean;
  /** Nº de filas visibles antes de pulsar «Mostrar más». */
  pageSize?: number;
}) {
  const { c, isDesktop } = useTheme();
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [limit, setLimit] = useState(pageSize);

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

  const setFilter = (key: string, v: string) => {
    setLimit(pageSize);
    setFilters((f) => ({ ...f, [key]: v }));
  };

  const visible = filtered.slice(0, limit);
  const more = filtered.length - visible.length;

  /* ------------------------------------------------------------ móvil */
  if (!isDesktop) {
    return (
      <View>
        {hasFilters ? (
          <MobileFilters columns={columns} filters={filters} setFilter={setFilter} />
        ) : null}
        {filtered.length === 0 ? (
          <EmptyState text={emptyText} />
        ) : (
          visible.map((row) => {
            const primary = columns.find((x) => x.primary) ?? columns[0];
            const rest = columns.filter((x) => x !== primary && !x.secondary);
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
                <View style={{ marginBottom: 6 }}>{primary.render(row)}</View>
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
  const totalWidth = columns.reduce((acc, col) => acc + (col.width ?? 150), 0);

  return (
    <View>
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
            {columns.map((col) => (
              <View key={col.key} style={{ width: col.width ?? 150, paddingHorizontal: 8 }}>
                <Text style={{ fontSize: 11, fontWeight: '800', color: c.textFaint }}>{col.header}</Text>
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
      <Text style={{ fontSize: 12, fontWeight: '700', color: c.text }}>
        Mostrar {Math.min(more, 40)} más · quedan {more}
      </Text>
    </Pressable>
  );
}

function ResultCount({ shown, total }: { shown: number; total: number }) {
  const { c } = useTheme();
  if (total === 0) return null;
  return (
    <Text style={{ fontSize: 11, color: c.textFaint, marginTop: space.sm, textAlign: 'center' }}>
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
        <Text style={{ fontSize: 12, fontWeight: '700', color: c.text }}>
          Filtros por columna{activeCount ? ` · ${activeCount} activos` : ''}
        </Text>
        <Text style={{ color: c.textFaint, fontSize: 11 }}>{open ? '▲' : '▼'}</Text>
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
