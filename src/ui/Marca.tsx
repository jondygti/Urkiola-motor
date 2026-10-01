import React from 'react';
import { Image, Text, View } from 'react-native';
import { tipografia } from './theme';

/**
 * La marca de la aplicación: el símbolo EM del Grupo Easo Motor y, al lado,
 * «Easo Logistics» escrito.
 *
 * El símbolo viene del logotipo del grupo (`assets/marca/em.png`, el mismo
 * recortado sin las letras). Las letras del logotipo son blancas y solo se
 * leen sobre fondo oscuro; el nombre de la aplicación se escribe como texto
 * para que se lea igual en claro y en oscuro y no dependa de una imagen.
 *
 * Va incrustado aquí y no con `require('…png')` porque la demostración es un
 * único HTML que se abre con doble clic: una imagen pedida por su dirección
 * saldría rota. Si cambia el logotipo, se regenera con
 * `base64 -w0 assets/marca/em.png`.
 */
const SIMBOLO_EM = 'data:image/png;base64,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';

/** Proporción del símbolo recortado (228 × 214). */
const PROPORCION = 228 / 214;

export function Marca({
  alto = 34,
  enDosLineas = true,
  tamanoTexto = tipografia.title,
  colorTexto = '#fff',
  interlineado,
}: {
  /** Alto del símbolo, en puntos. */
  alto?: number;
  enDosLineas?: boolean;
  tamanoTexto?: number;
  colorTexto?: string;
  interlineado?: number;
}) {
  return (
    <View
      style={{ flexDirection: 'row', alignItems: 'center', gap: Math.round(alto / 3) }}
      accessibilityRole="header"
      accessibilityLabel="Easo Logistics"
    >
      <Image
        source={{ uri: SIMBOLO_EM }}
        style={{ width: Math.round(alto * PROPORCION), height: alto }}
        resizeMode="contain"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      />
      <Text
        style={{ color: colorTexto, fontSize: tamanoTexto, fontWeight: '900', lineHeight: interlineado ?? Math.round(tamanoTexto * 1.1) }}
      >
        {enDosLineas ? 'EASO\nLOGISTICS' : 'EASO LOGISTICS'}
      </Text>
    </View>
  );
}
