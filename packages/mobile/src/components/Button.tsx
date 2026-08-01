import React, { useRef } from 'react';
import {
  Pressable,
  Text,
  StyleSheet,
  ActivityIndicator,
  Animated,
  ViewStyle,
  TextStyle,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../hooks';
import { ThemeColors, fonts, borderRadius, spacing, glow } from '../constants';

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  disabled?: boolean;
  icon?: React.ReactNode;
  style?: ViewStyle;
  textStyle?: TextStyle;
  fullWidth?: boolean;
}

export const Button: React.FC<ButtonProps> = ({
  title,
  onPress,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  icon,
  style,
  textStyle,
  fullWidth = false,
}) => {
  const { colors } = useTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const isDisabled = disabled || loading;
  const scale = useRef(new Animated.Value(1)).current;

  const animateTo = (value: number) =>
    Animated.spring(scale, {
      toValue: value,
      useNativeDriver: true,
      speed: 40,
      bounciness: 0,
    }).start();

  const sizeStyle =
    size === 'sm'
      ? { paddingVertical: spacing.sm, paddingHorizontal: spacing.md }
      : size === 'lg'
        ? { paddingVertical: spacing.lg, paddingHorizontal: spacing.xxl }
        : { paddingVertical: spacing.md, paddingHorizontal: spacing.xl };

  const textSize =
    size === 'sm' ? fonts.sizes.sm : size === 'lg' ? fonts.sizes.lg : fonts.sizes.md;

  const content = loading ? (
    <ActivityIndicator
      color={variant === 'outline' || variant === 'ghost' ? colors.primary : '#FFFFFF'}
      size="small"
    />
  ) : (
    <>
      {icon}
      <Text
        style={[
          styles.text,
          { fontSize: textSize },
          variant === 'outline' ? styles.outlineText : undefined,
          variant === 'ghost' ? styles.ghostText : undefined,
          variant === 'secondary' ? styles.secondaryText : undefined,
          isDisabled ? styles.disabledText : undefined,
          textStyle,
        ]}
      >
        {title}
      </Text>
    </>
  );

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      onPressIn={() => animateTo(0.97)}
      onPressOut={() => animateTo(1)}
      style={fullWidth ? styles.fullWidth : undefined}
    >
      <Animated.View
        style={[
          { transform: [{ scale }] },
          fullWidth ? styles.fullWidth : undefined,
          variant === 'primary' && !isDisabled ? glow(colors.primary) : undefined,
          style,
        ]}
      >
        {variant === 'primary' ? (
          <LinearGradient
            colors={
              isDisabled
                ? [colors.surfaceLight, colors.surface]
                : [colors.primaryLight, colors.primary]
            }
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.button, sizeStyle, isDisabled ? styles.disabled : undefined]}
          >
            {content}
          </LinearGradient>
        ) : (
          <Animated.View
            style={[
              styles.button,
              sizeStyle,
              variant === 'secondary' ? styles.secondaryButton : undefined,
              variant === 'outline' ? styles.outlineButton : undefined,
              variant === 'ghost' ? styles.ghostButton : undefined,
              isDisabled ? styles.disabled : undefined,
            ]}
          >
            {content}
          </Animated.View>
        )}
      </Animated.View>
    </Pressable>
  );
};

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    button: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: borderRadius.full,
      gap: spacing.sm,
    },
    fullWidth: {
      width: '100%',
    },
    secondaryButton: {
      backgroundColor: colors.secondary,
    },
    outlineButton: {
      backgroundColor: 'transparent',
      borderWidth: 1.5,
      borderColor: colors.primary,
    },
    ghostButton: {
      backgroundColor: 'transparent',
    },
    disabled: {
      opacity: 0.5,
    },
    text: {
      color: '#FFFFFF',
      fontFamily: fonts.bold,
    },
    secondaryText: {
      color: '#FFFFFF',
    },
    outlineText: {
      color: colors.primary,
    },
    ghostText: {
      color: colors.primary,
    },
    disabledText: {
      color: colors.textMuted,
    },
  });
