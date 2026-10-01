import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import React from 'react';
import type { StyleProp, TextStyle } from 'react-native';
import { tipografia } from './theme';

/**
 * Los iconos de la aplicación, con nombres de la aplicación.
 *
 * Las pantallas piden «flota» o «llaves», nunca «car-multiple»: así, si un
 * icono no se entiende en la campa, se cambia aquí una vez y cambia en todas
 * las pantallas a la vez. Antes eran emojis, que cada teléfono dibuja a su
 * manera —el mismo 🧽 salía amarillo en uno y gris en otro— y se repetían:
 * Flota y Mis coches llevaban el mismo coche y no había forma de distinguir
 * las dos entradas del menú de un vistazo.
 *
 * Se importa solo la familia que se usa: el índice de `@expo/vector-icons`
 * arrastra los mapas de todas las familias al programa.
 */
const ICONOS = {
  // Secciones del menú: una distinta para cada una.
  panel: 'view-dashboard-outline',
  flota: 'car-multiple',
  misCoches: 'car-key',
  entregas: 'calendar-check',
  descargar: 'package-down',
  campa: 'parking',
  solicitudes: 'clipboard-text-outline',
  preparacion: 'spray-bottle',
  miPreparacion: 'car-wash',
  traslados: 'truck-check-outline',
  misTraslados: 'truck-fast-outline',
  movimientos: 'swap-horizontal',
  recuentos: 'format-list-checks',
  incidencias: 'alert-outline',
  avisos: 'bell-outline',
  admin: 'cog-outline',
  mover: 'car-arrow-right',

  // Acciones y datos.
  menu: 'menu',
  cerrar: 'close',
  mas: 'plus',
  hecho: 'check',
  comprobado: 'check-circle-outline',
  pendiente: 'checkbox-blank-outline',
  casillaMarcada: 'checkbox-marked',
  casillaVacia: 'checkbox-blank-outline',
  abajo: 'chevron-down',
  arriba: 'chevron-up',
  subir: 'arrow-up',
  bajar: 'arrow-down',
  volver: 'arrow-left',
  deshacer: 'undo',
  empezar: 'play',
  pausa: 'pause',
  tiempo: 'timer-outline',
  alarma: 'alarm',
  esperando: 'timer-sand',
  historial: 'history',
  aviso: 'alert-outline',
  foto: 'camera-outline',
  galeria: 'image-outline',
  documento: 'file-document-outline',
  llaves: 'key-variant',
  meta: 'flag-checkered',
  ubicacion: 'map-marker-outline',
  camion: 'truck-outline',
  calendario: 'calendar-outline',
  etiqueta: 'tag-outline',
  persona: 'account-outline',
  personas: 'account-group-outline',
  sede: 'domain',
  buscar: 'magnify',
  nube: 'cloud-outline',
  seguridad: 'shield-check-outline',
  candado: 'lock-outline',
  copias: 'database-outline',
  auditoria: 'chart-box-outline',
  pruebas: 'flask-outline',
  rapido: 'lightning-bolt',
  activacion: 'brain',
  subiendo: 'cloud-upload-outline',
  sinCobertura: 'wifi-off',
  sincronizar: 'sync',
  punto: 'circle-medium',
} as const;

export type IconName = keyof typeof ICONOS;

export function Icon({
  name,
  size = tipografia.strong,
  color,
  style,
}: {
  name: IconName;
  size?: number;
  color?: string;
  style?: StyleProp<TextStyle>;
}) {
  return (
    <MaterialCommunityIcons
      name={ICONOS[name]}
      size={size}
      color={color}
      style={style}
      // Es decoración: quien usa un lector de pantalla ya oye el texto de al lado.
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    />
  );
}
