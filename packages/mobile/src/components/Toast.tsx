import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../hooks';
import { ThemeColors, fonts, spacing, borderRadius } from '../constants';
import { useToastStore } from '../store/toastStore';

/** Toast design: white card, soft shadow, icon on a pale round badge, dark medium text. */
const TONES: Record<string, { icon: keyof typeof Ionicons.glyphMap; fg: string; bg: string }> = {
  success: { icon: 'checkmark', fg: '#2E9E5E', bg: '#EEF9F2' },
  error: { icon: 'alert', fg: '#D9536A', bg: '#FDF0F2' },
  info: { icon: 'information', fg: '#4F7BFF', bg: '#EEF2FF' },
};

/**
 * Mounted once at the app root so it survives navigation between screens —
 * unlike a banner tied to a screen or global store field, it auto-dismisses
 * on its own and never lingers after you move on.
 */
export const Toast: React.FC = () => {
  const { colors } = useTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const { visible, message, type, hide } = useToastStore();
  const translateY = useRef(new Animated.Value(-120)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(translateY, {
        toValue: visible ? 0 : -120,
        useNativeDriver: true,
        speed: 16,
        bounciness: 6,
      }),
      Animated.timing(opacity, {
        toValue: visible ? 1 : 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start();
  }, [visible, translateY, opacity]);

  const tone = TONES[type] ?? TONES.info;

  return (
    <SafeAreaView
      pointerEvents={visible ? 'box-none' : 'none'}
      style={styles.wrapper}
    >
      <Animated.View
        style={[
          styles.toast,
          {
            transform: [{ translateY }],
            opacity,
          },
        ]}
      >
        <TouchableOpacity
          style={styles.content}
          activeOpacity={0.8}
          onPress={hide}
        >
          <View style={[styles.badge, { backgroundColor: tone.bg }]}>
            <Ionicons name={tone.icon} size={16} color={tone.fg} />
          </View>
          <Text style={styles.text} numberOfLines={3}>
            {message}
          </Text>
        </TouchableOpacity>
      </Animated.View>
    </SafeAreaView>
  );
};

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    wrapper: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      zIndex: 999,
    },
    toast: {
      marginHorizontal: spacing.lg,
      marginTop: spacing.sm,
      borderRadius: 18,
      backgroundColor: '#FFFFFF',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.9)',
      shadowColor: '#141C3C',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.1,
      shadowRadius: 20,
      elevation: 8,
    },
    content: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 12,
      paddingLeft: 12,
      paddingRight: 18,
    },
    badge: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
    },
    text: {
      flex: 1,
      color: '#1C1F2A',
      fontSize: 15,
      fontFamily: fonts.medium,
      lineHeight: 20,
    },
  });
