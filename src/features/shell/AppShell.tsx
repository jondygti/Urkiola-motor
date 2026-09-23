import { usePathname, useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { radius, space, tipografia, useTheme } from '@/ui/theme';
import { useStore } from '@/data/store';
import { isSimpleRole, unreadCount } from '@/data/selectors';
import { roleLabel } from '@/data/selectors';
import { mobileNav, mobileTabs, titleForPath, visibleNav } from './nav';
import { SyncBar } from './SyncBar';

const SIDEBAR_WIDTH = 245;
const DRAWER_WIDTH = 285;

export function AppShell({ children }: { children: React.ReactNode }) {
  const { c, isDesktop } = useTheme();
  const { state, user } = useStore();
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const insets = useSafeAreaInsets();
  // Solo los suyos: la campana que cuenta avisos de otros no la mira nadie.
  const unread = unreadCount(state, user);

  // Al navegar, el menú deslizante se cierra solo.
  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  // Colaboradores externos: una sola pantalla, sin menú ni pestañas.
  if (isSimpleRole(state, user)) return <SimpleShell>{children}</SimpleShell>;

  if (isDesktop) {
    return (
      <View style={{ flex: 1, flexDirection: 'row', backgroundColor: c.bg }}>
        <View style={{ width: SIDEBAR_WIDTH }}>
          <SideMenu unread={unread} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <SyncBar />
          <View style={{ flex: 1 }}>{children}</View>
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <MobileBar
        title={titleForPath(pathname)}
        unread={unread}
        onMenu={() => setDrawerOpen(true)}
        topInset={insets.top}
      />
      <SyncBar />
      <View style={{ flex: 1 }}>{children}</View>
      <BottomTabs bottomInset={insets.bottom} onMore={() => setDrawerOpen(true)} />
      <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)} unread={unread} />
    </View>
  );
}

/* ---------------------------------------------- interfaz de colaborador */

/**
 * Armazón mínimo para roles externos (transportistas). Sin menú lateral,
 * sin pestañas y sin navegación: solo su trabajo y cerrar sesión.
 */
function SimpleShell({ children }: { children: React.ReactNode }) {
  const { c } = useTheme();
  const { state, user, logout } = useStore();
  const insets = useSafeAreaInsets();

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <View
        style={{
          backgroundColor: c.navBg,
          paddingTop: insets.top + 10,
          paddingBottom: 12,
          paddingHorizontal: 16,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <View style={{ flex: 1 }}>
          <Text style={{ color: '#fff', fontSize: tipografia.strong, fontWeight: '900' }}>EASO LOGISTICS</Text>
          <Text style={{ color: c.navBrandSub, fontSize: tipografia.micro, marginTop: 2 }}>
            {user?.name} · {roleLabel(state, user?.role)}
          </Text>
        </View>
        <Pressable
          onPress={logout}
          style={{
            borderWidth: 1,
            borderColor: 'rgba(255,255,255,0.25)',
            borderRadius: radius.sm,
            paddingVertical: 7,
            paddingHorizontal: 12,
          }}
        >
          <Text style={{ color: '#fff', fontSize: tipografia.small, fontWeight: '700' }}>Salir</Text>
        </Pressable>
      </View>
      <SyncBar />
      <View style={{ flex: 1 }}>{children}</View>
    </View>
  );
}

/* ------------------------------------------------------------- lateral */

function SideMenu({
  unread,
  onNavigate,
  compact,
}: {
  unread: number;
  onNavigate?: () => void;
  compact?: boolean;
}) {
  const { c } = useTheme();
  const { state, user, logout } = useStore();
  const pathname = usePathname();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  // En el teléfono el menú es el corto que el rol tenga configurado.
  const groups = compact
    ? [{ title: 'MI TRABAJO', items: mobileNav(state, user) }]
    : visibleNav(state, user);

  return (
    <View style={{ flex: 1, backgroundColor: c.navBg, paddingTop: insets.top + 14 }}>
      <View style={{ paddingHorizontal: 12, paddingBottom: 18 }}>
        <Text style={{ color: '#fff', fontSize: tipografia.title, fontWeight: '900', lineHeight: 22 }}>
          EASO{'\n'}LOGISTICS
        </Text>
        <Text style={{ color: c.navBrandSub, fontSize: tipografia.label, marginTop: 5 }}>
          {compact ? roleLabel(state, user?.role) : 'Gestión logística de flota'}
        </Text>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 24 }}>
        {groups.map((group) => (
          <View key={group.title}>
            <Text
              style={{
                fontSize: tipografia.label,
                color: c.navGroup,
                fontWeight: '900',
                letterSpacing: 1,
                paddingTop: 14,
                paddingBottom: 4,
                paddingHorizontal: 10,
              }}
            >
              {group.title}
            </Text>
            {group.items.map((item) => {
              const active = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
              const badge = item.href === '/notificaciones' ? unread : 0;
              return (
                <Pressable
                  key={item.href}
                  accessibilityRole="link"
                  onPress={() => {
                    onNavigate?.();
                    router.push(item.href as never);
                  }}
                  style={({ pressed }) => ({
                    backgroundColor: active || pressed ? c.navActiveBg : 'transparent',
                    borderRadius: 8,
                    paddingVertical: 10,
                    paddingHorizontal: 12,
                    marginVertical: 1,
                    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as object) : null),
                  })}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
                    <Text style={{ fontSize: tipografia.body }}>{item.icon}</Text>
                    <Text
                      style={{
                        color: active ? c.navTextActive : c.navText,
                        fontSize: tipografia.body,
                        fontWeight: active ? '800' : '500',
                        flex: 1,
                      }}
                    >
                      {item.label}
                    </Text>
                    {badge > 0 ? <Badge count={badge} /> : null}
                  </View>
                </Pressable>
              );
            })}
          </View>
        ))}
      </ScrollView>

      {user ? (
        <Pressable
          onPress={logout}
          style={{
            borderTopWidth: 1,
            borderTopColor: 'rgba(255,255,255,0.08)',
            padding: 14,
            paddingBottom: 14 + insets.bottom,
          }}
        >
          <Text style={{ color: '#fff', fontSize: tipografia.small, fontWeight: '800' }}>{user.name}</Text>
          <Text style={{ color: c.navBrandSub, fontSize: tipografia.label, marginTop: 2 }}>
            {roleLabel(state, user.role)} · Cerrar sesión
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function Badge({ count }: { count: number }) {
  const { c } = useTheme();
  return (
    <View
      style={{
        backgroundColor: c.accent,
        minWidth: 18,
        height: 18,
        borderRadius: 9,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 5,
      }}
    >
      <Text style={{ color: '#06231d', fontSize: tipografia.label, fontWeight: '900' }}>{count > 99 ? '99+' : count}</Text>
    </View>
  );
}

/* -------------------------------------------------------------- móvil */

function MobileBar({
  title,
  unread,
  onMenu,
  topInset,
}: {
  title: string;
  unread: number;
  onMenu: () => void;
  topInset: number;
}) {
  const { c } = useTheme();
  const router = useRouter();
  return (
    <View
      style={{
        backgroundColor: c.navBg,
        paddingTop: topInset,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingHorizontal: 12,
        paddingBottom: 10,
      }}
    >
      <Pressable
        onPress={onMenu}
        accessibilityLabel="Abrir menú"
        style={{
          backgroundColor: c.navActiveBg,
          width: 40,
          height: 38,
          borderRadius: 8,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text style={{ color: '#fff', fontSize: tipografia.title }}>☰</Text>
      </Pressable>
      <View style={{ flex: 1 }}>
        <Text numberOfLines={1} style={{ color: '#fff', fontSize: tipografia.body, fontWeight: '900' }}>
          {title}
        </Text>
        <Text style={{ color: c.navBrandSub, fontSize: tipografia.label }}>EASO LOGISTICS</Text>
      </View>
      <Pressable
        onPress={() => router.push('/notificaciones')}
        accessibilityLabel="Notificaciones"
        style={{ paddingHorizontal: 6, flexDirection: 'row', alignItems: 'center', gap: 4 }}
      >
        <Text style={{ fontSize: tipografia.heading }}>🔔</Text>
        {unread > 0 ? <Badge count={unread} /> : null}
      </Pressable>
    </View>
  );
}

function BottomTabs({ bottomInset, onMore }: { bottomInset: number; onMore: () => void }) {
  const { c } = useTheme();
  const pathname = usePathname();
  const router = useRouter();
  const { state, user } = useStore();
  const tabs = mobileTabs(state, user);

  return (
    <View
      style={{
        flexDirection: 'row',
        backgroundColor: c.surface,
        borderTopWidth: 1,
        borderTopColor: c.border,
        paddingBottom: bottomInset,
      }}
    >
      {tabs.map((tab) => {
        const active = tab.href === '/' ? pathname === '/' : pathname.startsWith(tab.href);
        return (
          <Pressable
            key={tab.href}
            accessibilityRole="link"
            onPress={() => router.push(tab.href as never)}
            style={{ flex: 1, alignItems: 'center', paddingVertical: 9 }}
          >
            <Text style={{ fontSize: tipografia.strong, opacity: active ? 1 : 0.55 }}>{tab.icon}</Text>
            <Text
              style={{
                fontSize: tipografia.label,
                marginTop: 2,
                color: active ? c.primary : c.textMuted,
                fontWeight: active ? '800' : '600',
              }}
            >
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
      <Pressable onPress={onMore} style={{ flex: 1, alignItems: 'center', paddingVertical: 9 }}>
        <Text style={{ fontSize: tipografia.strong, opacity: 0.55 }}>☰</Text>
        <Text style={{ fontSize: tipografia.label, marginTop: 2, color: c.textMuted, fontWeight: '600' }}>Más</Text>
      </Pressable>
    </View>
  );
}

function Drawer({ open, onClose, unread }: { open: boolean; onClose: () => void; unread: number }) {
  const { c } = useTheme();
  const anim = useRef(new Animated.Value(0)).current;
  const [mounted, setMounted] = useState(open);

  useEffect(() => {
    if (open) setMounted(true);
    Animated.timing(anim, {
      toValue: open ? 1 : 0,
      duration: 220,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished && !open) setMounted(false);
    });
  }, [open, anim]);

  if (!mounted) return null;

  const translateX = anim.interpolate({ inputRange: [0, 1], outputRange: [-DRAWER_WIDTH - 10, 0] });

  return (
    <View style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, zIndex: 50 }}>
      <Animated.View style={{ flex: 1, backgroundColor: c.overlay, opacity: anim }}>
        <Pressable style={{ flex: 1 }} onPress={onClose} accessibilityLabel="Cerrar menú" />
      </Animated.View>
      <Animated.View
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          left: 0,
          width: DRAWER_WIDTH,
          maxWidth: '86%',
          transform: [{ translateX }],
        }}
      >
        <SideMenu unread={unread} onNavigate={onClose} compact />
        <Pressable
          onPress={onClose}
          accessibilityLabel="Cerrar menú"
          style={{
            position: 'absolute',
            right: 10,
            top: 44,
            width: 32,
            height: 32,
            borderRadius: radius.sm,
            backgroundColor: c.navActiveBg,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={{ color: '#fff', fontSize: tipografia.title }}>×</Text>
        </Pressable>
      </Animated.View>
    </View>
  );
}

export const SHELL_SPACING = space;
