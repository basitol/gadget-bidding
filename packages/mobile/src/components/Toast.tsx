import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../hooks';
import { ThemeColors, fonts, spacing, borderRadius } from '../constants';
import { useToastStore } from '../store/toastStore';

const ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  error: 'alert-circle',
  success: 'checkmark-circle',
  info: 'information-circle',
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

  const tone =
    type === 'success'
      ? colors.success
      : type === 'info'
        ? colors.primary
        : colors.error;

  return (
    <SafeAreaView
      pointerEvents={visible ? 'box-none' : 'none'}
      style={styles.wrapper}
    >
      <Animated.View
        style={[
          styles.toast,
          {
            borderColor: tone + '55',
            backgroundColor: colors.surface,
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
          <Ionicons name={ICONS[type]} size={20} color={tone} />
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
      borderRadius: borderRadius.lg,
      borderWidth: 1,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.25,
      shadowRadius: 10,
      elevation: 8,
    },
    content: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.lg,
    },
    text: {
      flex: 1,
      color: colors.text,
      fontSize: fonts.sizes.sm,
      fontFamily: fonts.medium,
      lineHeight: 18,
    },
  });
