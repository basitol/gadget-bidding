import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { duration, easing } from './tokens';
import { useReducedMotion } from './useReducedMotion';

interface BottomSheetProps {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
  style?: ViewStyle;
}

const SCREEN_H = Dimensions.get('window').height;

/**
 * Sheet that rises from the bottom while the background darkens separately
 * (the scrim fades; it doesn't slide up with the sheet).
 */
export const BottomSheet: React.FC<BottomSheetProps> = ({ visible, onClose, children, style }) => {
  const reduced = useReducedMotion();
  const insets = useSafeAreaInsets();
  const [mounted, setMounted] = useState(visible);
  const scrim = useRef(new Animated.Value(0)).current;
  const y = useRef(new Animated.Value(SCREEN_H)).current;

  useEffect(() => {
    if (visible) {
      setMounted(true);
      y.setValue(reduced ? 0 : SCREEN_H * 0.6);
      Animated.parallel([
        Animated.timing(scrim, { toValue: 1, duration: duration.normal, easing: easing.enter, useNativeDriver: true }),
        reduced
          ? Animated.timing(y, { toValue: 0, duration: 0, useNativeDriver: true })
          : Animated.spring(y, { toValue: 0, useNativeDriver: true, speed: 16, bounciness: 3 }),
      ]).start();
    } else if (mounted) {
      Animated.parallel([
        Animated.timing(scrim, { toValue: 0, duration: duration.normal, easing: easing.exit, useNativeDriver: true }),
        Animated.timing(y, {
          toValue: reduced ? 0 : SCREEN_H * 0.6,
          duration: duration.normal,
          easing: easing.exit,
          useNativeDriver: true,
        }),
      ]).start(() => setMounted(false));
    }
  }, [visible]);

  return (
    <Modal visible={mounted} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <Animated.View style={[styles.scrim, { opacity: scrim }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
      </Animated.View>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.holder}
        pointerEvents="box-none"
      >
        <Animated.View
          style={[
            // Callers that pass no style get the standard sheet panel.
            style ?? [styles.panel, { paddingBottom: 20 + insets.bottom }],
            { transform: [{ translateY: y }], opacity: reduced ? scrim : 1 },
          ]}
        >
          {children}
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  holder: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  // Design guide: sheets radius 28, 20px app edges.
  panel: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 24,
  },
});
