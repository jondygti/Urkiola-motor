import { Redirect, Slot, usePathname } from 'expo-router';
import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { AppShell } from '@/features/shell/AppShell';
import { useStore } from '@/data/store';
import { isSimpleRole, mobileSections } from '@/data/selectors';
import { mobileHome } from '@/features/shell/nav';
import { useTheme } from '@/ui/theme';

export default function ShellLayout() {
  const { ready, state, user } = useStore();
  const { c } = useTheme();
  const pathname = usePathname();

  if (!ready) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: c.bg }}>
        <ActivityIndicator color={c.primary} />
      </View>
    );
  }

  if (!user) return <Redirect href="/login" />;

  // Un rol externo no puede salirse de sus pantallas ni escribiendo la
  // dirección: siempre vuelve a su trabajo asignado.
  if (isSimpleRole(state, user) && !mobileSections(state, user).includes(pathname)) {
    return <Redirect href={mobileHome(state, user) as never} />;
  }

  return (
    <AppShell>
      <Slot />
    </AppShell>
  );
}
