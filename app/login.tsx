import { Redirect } from 'expo-router';
import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useStore } from '@/data/store';
import { roleLabel } from '@/data/selectors';
import { Btn, Field, Input, Muted, Notice, Panel, Spacer, radius, space, useTheme } from '@/ui';
import { api } from '@/data/api';

export default function LoginScreen() {
  const { c } = useTheme();
  const { state, user, login, mode, ready } = useStore();
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [entrando, setEntrando] = useState(false);
  const [olvidada, setOlvidada] = useState<string | null>(null);

  if (ready && user) return <Redirect href="/" />;

  const entrar = async (correo: string, clave: string) => {
    setEntrando(true);
    setError(null);
    // Quien decide si el correo y la contraseña valen es el servidor: aquí
    // solo se enseña lo que conteste.
    const fallo = await login(correo, clave);
    setEntrando(false);
    if (fallo) setError(fallo);
  };

  const submit = () => {
    if (entrando) return;
    if (mode === 'api' && password.length < 4) {
      setError('Introduce tu contraseña.');
      return;
    }
    void entrar(email, password);
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

            <Btn variant="primary" full onPress={submit} disabled={entrando}>
              {entrando ? 'Entrando…' : 'Entrar'}
            </Btn>

            {mode === 'api' ? (
              <>
                <Spacer h={space.sm} />
                <Btn
                  full
                  onPress={async () => {
                    if (!email.trim()) {
                      setError('Escribe tu correo y vuelve a pulsar.');
                      return;
                    }
                    setError(null);
                    // La respuesta es la misma exista el correo o no: decir
                    // cuáles existen sería regalar la lista del personal.
                    await api.olvidada(email.trim()).catch(() => undefined);
                    setOlvidada(
                      'Si ese correo está dado de alta, en un momento llega un enlace para poner una contraseña nueva. Vale una hora.'
                    );
                  }}
                >
                  He olvidado mi contraseña
                </Btn>
                {olvidada ? (
                  <>
                    <Spacer h={space.sm} />
                    <Notice>{olvidada}</Notice>
                  </>
                ) : null}
              </>
            ) : null}

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
                      onPress={() => void entrar(u.email, '')}
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
                        {roleLabel(state, u.role)}
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
