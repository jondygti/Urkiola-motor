/**
 * Entrega de los avisos push.
 *
 * Las reglas ya se evalúan dentro de `applyCommand` (la misma función que
 * usa la app): cuando pasa algo que alguien quería saber, aparece un aviso
 * nuevo en la bandeja. Aquí solo se mira qué avisos son nuevos, a quién le
 * tocan y se mandan a Expo.
 */
import type { AppState, Id, NotificationEvent, User } from '../../src/data/types';
import type { Almacen } from './almacen/tipos';

const EXPO = 'https://exp.host/--/api/v2/push/send';

/**
 * A qué usuarios va un aviso.
 *
 * El destinatario de una regla se elige en la app de una lista con nombres
 * de persona y también con grupos ("Logística", "Responsable de sede"), así
 * que aquí hay que traducirlo. Lo que no se sepa a quién va, no se manda a
 * nadie: mejor un aviso que no llega que un aviso a quien no toca.
 */
export function destinatarios(s: AppState, aviso: NotificationEvent): User[] {
  const etiqueta = (aviso.title.split(' · ')[0] ?? '').trim();
  if (!etiqueta) return [];

  const activos = s.users.filter((u) => u.active);

  // "Comercial asignado · Juan Bilbao" llega como el nombre detrás del punto.
  const nombre = etiqueta.startsWith('Comercial asignado')
    ? (aviso.title.split(' · ')[1] ?? '').trim()
    : etiqueta;

  const porNombre = activos.filter((u) => u.name.toLowerCase() === nombre.toLowerCase());
  if (porNombre.length) return porNombre;

  const rol = s.config.roles.find((r) => r.label.toLowerCase() === etiqueta.toLowerCase());
  if (rol) return activos.filter((u) => u.role === rol.id);

  if (etiqueta.toLowerCase() === 'responsable de sede') {
    const vehiculo = aviso.vehicleId ? s.vehicles.find((v) => v.id === aviso.vehicleId) : undefined;
    const sede = vehiculo?.location?.siteId ?? vehiculo?.targetSiteId ?? null;
    return activos.filter(
      (u) =>
        (u.role === 'logistica' || u.role === 'admin') &&
        (u.siteIds.length === 0 || (sede !== null && u.siteIds.includes(sede)))
    );
  }

  return [];
}

/** Avisos que ha generado este comando (los que antes no estaban). */
export function avisosNuevos(antes: AppState, despues: AppState): NotificationEvent[] {
  const ya = new Set(antes.inbox.map((n) => n.id));
  return despues.inbox.filter((n) => !ya.has(n.id));
}

interface RespuestaExpo {
  data?: { status: string; details?: { error?: string } }[];
}

/**
 * Manda los avisos y limpia los tokens que Expo dé por muertos.
 *
 * No lanza nunca: que falle el aviso no puede tumbar el comando, que es lo
 * que de verdad importa guardar.
 */
export async function enviarAvisos(
  almacen: Almacen,
  estado: AppState,
  avisos: NotificationEvent[],
  fetchImpl: typeof fetch = fetch
): Promise<number> {
  if (avisos.length === 0) return 0;

  const mensajes: { to: string; title: string; body: string; channelId: string }[] = [];
  for (const aviso of avisos) {
    const usuarios = destinatarios(estado, aviso);
    if (usuarios.length === 0) continue;
    const tokens = await almacen.tokensPushDe(usuarios.map((u) => u.id));
    for (const t of tokens) {
      mensajes.push({
        to: t.token,
        title: aviso.title,
        body: aviso.body,
        channelId: 'urkiola-operativa',
      });
    }
  }
  if (mensajes.length === 0) return 0;

  try {
    const res = await fetchImpl(EXPO, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(mensajes),
    });
    const json = (await res.json()) as RespuestaExpo;
    const datos = json.data ?? [];
    for (let i = 0; i < datos.length; i++) {
      // Un móvil desinstalado o reinstalado deja el token muerto: si no se
      // borra, cada aviso a partir de ahora falla contra Expo para siempre.
      if (datos[i]?.details?.error === 'DeviceNotRegistered') {
        const token = mensajes[i]?.to;
        if (token) await almacen.borrarTokenPush(token);
      }
    }
    return mensajes.length;
  } catch (e) {
    console.warn('No se han podido enviar los avisos push:', e);
    return 0;
  }
}

/** Ids de los usuarios a los que iría un aviso (para poder comprobarlo). */
export function idsDestinatarios(s: AppState, aviso: NotificationEvent): Id[] {
  return destinatarios(s, aviso).map((u) => u.id);
}
