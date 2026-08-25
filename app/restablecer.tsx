import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Btn, Field, Input, Muted, Notice, Panel, space, useTheme } from '@/ui';
import { ApiError, api, apiEnabled } from '@/data/api';

/**
 * Poner una contraseña nueva con el enlace del correo.
 *
 * Se llega aquí desde el enlace, con el código en la dirección. No hace
 * falta estar dentro de la aplicación: es justo para cuando no puedes.
 */
export default function RestablecerScreen() {
  const { c } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { codigo } = useLocalSearchParams<{ codigo?: string }>();

  const [nueva, setNueva] = useState('');
  const [repetida, setRepetida] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [hecho, setHecho] = useState(false);
  const [enviando, setEnviando] = useState(false);

  const guardar = async () => {
    if (nueva !== repetida) {
      setError('Las dos contraseñas no coinciden.');
      return;
    }
    if (nueva.trim().length < 12) {
      setError('Tiene que tener al menos 12 caracteres. Una frase corta vale y se recuerda mejor.');
      return;
    }
    setEnviando(true);
    setError(null);
    try {
      await api.restablecer(String(codigo ?? ''), nueva);
      setHecho(true);
    } catch (err) {
      const apiErr = err instanceof ApiError ? err : null;
      setError(
        !apiErr || apiErr.status === 0
          ? 'No hay conexión con el servidor.'
          : apiErr.status === 410
            ? 'Ese enlace ya se ha usado o ha caducado. Pide otro desde la pantalla de acceso.'
            : apiErr.message.replace(/^\d+ [^·]*· /, '')
      );
    }
    setEnviando(false);
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: c.navBg }}
      contentContainerStyle={{
        flexGrow: 1,
        justifyContent: 'center',
        padding: space.lg,
        paddingTop: insets.top + space.xl,
      }}
    >
      <View style={{ width: '100%', maxWidth: 460, alignSelf: 'center' }}>
        <Text style={{ color: '#fff', fontSize: 26, fontWeight: '900', lineHeight: 30 }}>
          URKIOLA{'\n'}CAR SERVICE
        </Text>
        <Text style={{ color: c.navBrandSub, fontSize: 12, marginTop: 6, marginBottom: space.xl }}>
          Poner una contraseña nueva
        </Text>

        <Panel>
          {!apiEnabled ? (
            <Muted>
              Esta pantalla solo funciona con el servidor configurado. En modo demostración se entra
              eligiendo un perfil.
            </Muted>
          ) : hecho ? (
            <>
              <Notice>Contraseña cambiada. Ya puedes entrar con la nueva.</Notice>
              <View style={{ height: space.md }} />
              <Btn variant="primary" full onPress={() => router.replace('/login')}>
                Ir a entrar
              </Btn>
            </>
          ) : !codigo ? (
            <>
              <Notice tone="warn">
                A este enlace le falta el código. Ábrelo tal cual viene en el correo, sin recortarlo.
              </Notice>
              <View style={{ height: space.md }} />
              <Btn full onPress={() => router.replace('/login')}>
                Volver
              </Btn>
            </>
          ) : (
            <>
              <Muted>
                Elige algo largo y que recuerdes: una frase corta es mejor contraseña que una palabra con
                símbolos.
              </Muted>
              <View style={{ height: space.md }} />

              <Field label="Contraseña nueva">
                <Input value={nueva} onChangeText={setNueva} placeholder="Al menos 12 caracteres" secureTextEntry />
              </Field>
              <Field label="Repítela">
                <Input value={repetida} onChangeText={setRepetida} placeholder="La misma otra vez" secureTextEntry />
              </Field>

              {error ? <Notice tone="danger">{error}</Notice> : null}

              <Btn variant="primary" full onPress={() => void guardar()} disabled={enviando}>
                {enviando ? 'Guardando…' : 'Guardar la contraseña'}
              </Btn>
            </>
          )}
        </Panel>
      </View>
    </ScrollView>
  );
}
