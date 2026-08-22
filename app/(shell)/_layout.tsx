import { Redirect, Slot } from 'expo-router';
import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { AppShell } from '@/features/shell/AppShell';
import { useStore } from '@/data/store';
import { useTheme } from '@/ui/theme';

export default function ShellLayout() {
  const { ready, user } = useStore();
  const { c } = useTheme();

  if (!ready) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: c.bg }}>
        <ActivityIndicator color={c.primary} />
      </View>
    );
  }

  if (!user) return <Redirect href="/login" />;

  return (
    <AppShell>
      <Slot />
    </AppShell>
  );
}
