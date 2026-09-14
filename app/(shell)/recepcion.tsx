import React from 'react';
import { Redirect } from 'expo-router';

// Conserva los enlaces antiguos y reúne toda la descarga en una pantalla.
export default function ReceptionScreen() {
  return <Redirect href="/mi-recepcion" />;
}
