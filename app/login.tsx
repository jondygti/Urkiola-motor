import { Redirect } from 'expo-router';
import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useStore } from '@/data/store';
import { roleLabel } from '@/data/selectors';
import { Btn, Field, Input, Muted, Notice, Panel, Spacer, radius, space, useTheme, tipografia } from '@/ui';
import { api } from '@/data/api';

export default function LoginScreen() {
  const { c } = useTheme();
  const { state, user, login, mode, ready, sync } = useStore();
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
          <Text style={{ color: '#fff', fontSize: tipografia.display, fontWeight: '900', lineHeight: 30 }}>
            EASO{'\n'}LOGISTICS
          </Text>
          <Text style={{ color: c.navBrandSub, fontSize: tipografia.small, marginTop: 6, marginBottom: space.xl }}>
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

            {error || sync.error ? (
              <View style={{ backgroundColor: c.noticeDangerBg, borderRadius: radius.md, padding: 10, marginBottom: space.sm }}>
                <Text style={{ color: c.redFg, fontSize: tipografia.small }}>{error ?? sync.error}</Text>
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
                    try {
                      const respuesta = await api.olvidada(email.trim());
                      setOlvidada(respuesta.mensaje);
                    } catch {
                      setError('No se ha podido pedir el enlace. Comprueba la conexión y vuelve a intentarlo.');
                    }
                  }}
                >
                  Primer acceso o nueva contraseña
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
                        <Text style={{ fontSize: tipografia.body, fontWeight: '700', color: c.text }}>{u.name}</Text>
                        <Text style={{ fontSize: tipografia.micro, color: c.textMuted }}>{u.email}</Text>
                      </View>
                      <Text style={{ fontSize: tipografia.micro, color: c.primary, fontWeight: '800' }}>
                        {roleLabel(state, u.role)}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            ) : null}
          </Panel>

          <Text style={{ color: c.navBrandSub, fontSize: tipografia.label, textAlign: 'center', marginTop: space.lg }}>
            {mode === 'demo'
              ? 'Sin servidor configurado · los cambios se guardan en este dispositivo'
              : 'Conectado al servidor de Easo Logistics'}
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
