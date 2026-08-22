import { Redirect } from 'expo-router';
import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useStore } from '@/data/store';
import { ROLE_LABEL } from '@/data/types';
import { Btn, Field, Input, Muted, Panel, radius, space, useTheme } from '@/ui';

export default function LoginScreen() {
  const { c } = useTheme();
  const { state, user, login, mode, ready } = useStore();
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (ready && user) return <Redirect href="/" />;

  const submit = () => {
    const found = state.users.find((u) => u.email.toLowerCase() === email.trim().toLowerCase());
    if (!found) {
      setError('No encontramos ese usuario. Revisa el correo.');
      return;
    }
    if (mode === 'api' && password.length < 4) {
      setError('Introduce tu contraseña.');
      return;
    }
    setError(null);
    login(found.id);
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1, backgroundColor: c.navBg }}
    >
      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: 'center',
          padding: space.lg,
          paddingTop: insets.top + space.xl,
          paddingBottom: insets.bottom + space.xl,
        }}
      >
        <View style={{ width: '100%', maxWidth: 460, alignSelf: 'center' }}>
          <Text style={{ color: '#fff', fontSize: 26, fontWeight: '900', lineHeight: 30 }}>
            URKIOLA{'\n'}CAR SERVICE
          </Text>
          <Text style={{ color: c.navBrandSub, fontSize: 12, marginTop: 6, marginBottom: space.xl }}>
            Gestión logística de flota · Sondika · Leioa · Galdakao · Anoeta · Irun
          </Text>

          <Panel>
            <Field label="Correo">
              <Input
                value={email}
                onChangeText={setEmail}
                placeholder="nombre@urkiolacarservice.com"
                autoCapitalize="none"
                keyboardType="email-address"
              />
            </Field>
            {mode === 'api' ? (
              <Field label="Contraseña">
                <Input value={password} onChangeText={setPassword} placeholder="••••••••" secureTextEntry />
              </Field>
            ) : null}

            {error ? (
              <View style={{ backgroundColor: c.noticeDangerBg, borderRadius: radius.md, padding: 10, marginBottom: space.sm }}>
                <Text style={{ color: c.redFg, fontSize: 12 }}>{error}</Text>
              </View>
            ) : null}

            <Btn variant="primary" full onPress={submit}>
              Entrar
            </Btn>

            {mode === 'demo' ? (
              <View style={{ marginTop: space.lg }}>
                <Muted>
                  Modo demostración: elige un perfil para entrar sin contraseña. Cada rol ve un menú y unas
                  tareas distintas.
                </Muted>
                <View style={{ gap: 6, marginTop: space.sm }}>
                  {state.users.map((u) => (
                    <Pressable
                      key={u.id}
                      onPress={() => login(u.id)}
                      style={({ pressed }) => ({
                        borderWidth: 1,
                        borderColor: c.border,
                        backgroundColor: pressed ? c.surfaceAlt : c.surface,
                        borderRadius: radius.md,
                        paddingVertical: 10,
                        paddingHorizontal: 12,
                        flexDirection: 'row',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      })}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 13, fontWeight: '700', color: c.text }}>{u.name}</Text>
                        <Text style={{ fontSize: 11, color: c.textMuted }}>{u.email}</Text>
                      </View>
                      <Text style={{ fontSize: 11, color: c.primary, fontWeight: '800' }}>
                        {ROLE_LABEL[u.role]}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            ) : null}
          </Panel>

          <Text style={{ color: c.navBrandSub, fontSize: 10, textAlign: 'center', marginTop: space.lg }}>
            {mode === 'demo'
              ? 'Sin servidor configurado · los cambios se guardan en este dispositivo'
              : 'Conectado al servidor de Urkiola Car Service'}
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
