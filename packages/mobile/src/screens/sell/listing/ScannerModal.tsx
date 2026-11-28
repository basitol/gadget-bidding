import React, { useEffect, useRef, useState } from 'react';
import { Modal, View, Text, Pressable, StyleSheet, ActivityIndicator, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { requireOptionalNativeModule } from 'expo';
import { isValidImei } from '@gadget-bidding/shared';
import { fonts } from '../../../constants';

/**
 * expo-camera's native module only exists in builds made after it was added. Older dev builds
 * skip the scanner (the seller types the number) instead of crashing on import.
 */
type CameraModule = typeof import('expo-camera');
const camera: CameraModule | null = requireOptionalNativeModule('ExpoCamera')
  ? // eslint-disable-next-line @typescript-eslint/no-var-requires
    (require('expo-camera') as CameraModule)
  : null;

export const scannerAvailable = !!camera;

/** IMEI: the first valid 15-digit run. Serial: letters and digits, without Apple's "(S)" prefix. */
const readValue = (raw: string, kind: 'imei' | 'serial'): string | null => {
  if (kind === 'imei') {
    for (const run of raw.match(/\d{15,}/g) ?? []) {
      for (let i = 0; i + 15 <= run.length; i++) {
        const c = run.slice(i, i + 15);
        if (isValidImei(c)) return c;
      }
    }
    return null;
  }
  const v = raw.replace(/^\s*\(S\)\s*/i, '').replace(/[^0-9a-z]/gi, '').toUpperCase();
  return v.length >= 5 && v.length <= 30 ? v : null;
};

const SERIAL_TYPES = ['code128', 'code39', 'code93', 'datamatrix', 'qr', 'pdf417'] as const;
const IMEI_TYPES = ['code128', 'code39', 'ean13', 'datamatrix', 'qr', 'pdf417'] as const;

export const ScannerModal: React.FC<{
  visible: boolean;
  kind: 'imei' | 'serial';
  onScanned: (value: string) => void;
  onClose: () => void;
}> = ({ visible, kind, onScanned, onClose }) => {
  const [perm, setPerm] = useState<'asking' | 'granted' | 'denied'>('asking');
  const done = useRef(false);

  useEffect(() => {
    if (!visible || !camera) return;
    done.current = false;
    setPerm('asking');
    camera.Camera.requestCameraPermissionsAsync()
      .then(r => setPerm(r.granted ? 'granted' : 'denied'))
      .catch(() => setPerm('denied'));
  }, [visible]);

  if (!camera) return null;
  const { CameraView } = camera;
  const name = kind === 'imei' ? 'IMEI' : 'serial number';

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <StatusBar style="light" />
      <View style={s.root}>
        {perm === 'granted' ? (
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: [...(kind === 'imei' ? IMEI_TYPES : SERIAL_TYPES)] }}
            onBarcodeScanned={({ data }) => {
              if (done.current) return;
              const v = readValue(String(data ?? ''), kind);
              if (!v) return;
              done.current = true;
              onScanned(v);
            }}
          />
        ) : null}
        <SafeAreaView style={s.overlay} edges={['top', 'bottom']}>
          <View style={s.top}>
            <Pressable onPress={onClose} style={s.close} hitSlop={8} accessibilityRole="button" accessibilityLabel="Close scanner">
              <Ionicons name="close" size={22} color="#FFFFFF" />
            </Pressable>
          </View>
          <View style={s.middle}>
            {perm === 'granted' ? <View style={s.frame} /> : null}
            {perm === 'asking' ? <ActivityIndicator color="#FFFFFF" /> : null}
            {perm === 'denied' ? (
              <View style={s.denied}>
                <Text style={s.title}>Camera is off for Gadgets Bidding</Text>
                <Text style={s.sub}>Turn it on in Settings to scan, or close this and type the {name}.</Text>
                <Pressable onPress={() => Linking.openSettings()} style={s.settings} accessibilityRole="button">
                  <Text style={s.settingsText}>Open Settings</Text>
                </Pressable>
              </View>
            ) : null}
          </View>
          {perm === 'granted' ? (
            <View style={s.bottom}>
              <Text style={s.title}>Scan the {name} barcode</Text>
              <Text style={s.sub}>
                {kind === 'imei'
                  ? "It's on the box label, next to \"IMEI\". Hold the phone steady about 15 cm away."
                  : "It's on the box label or the sticker on the device. Hold the phone steady about 15 cm away."}
              </Text>
            </View>
          ) : null}
        </SafeAreaView>
      </View>
    </Modal>
  );
};

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000000' },
  overlay: { flex: 1 },
  top: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: 20, paddingTop: 8 },
  close: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  middle: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 },
  frame: { width: '86%', height: 150, borderRadius: 18, borderWidth: 2, borderColor: '#FFFFFF' },
  bottom: { paddingHorizontal: 20, paddingBottom: 24, gap: 8 },
  title: { color: '#FFFFFF', fontSize: 19, fontFamily: fonts.medium, textAlign: 'center' },
  sub: { color: 'rgba(255,255,255,0.8)', fontSize: 14, lineHeight: 20, fontFamily: fonts.regular, textAlign: 'center' },
  denied: { alignItems: 'center', gap: 8 },
  settings: { marginTop: 16, height: 52, paddingHorizontal: 24, borderRadius: 14, backgroundColor: '#FFFFFF', justifyContent: 'center' },
  settingsText: { color: '#1C1F2A', fontSize: 16, fontFamily: fonts.medium },
});
