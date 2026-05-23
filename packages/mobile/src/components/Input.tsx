import React, { useState, useMemo } from 'react';
import {
  View,
  TextInput,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInputProps,
  ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../hooks';
import { ThemeColors, fonts, borderRadius, spacing } from '../constants';

interface InputProps extends TextInputProps {
  label?: string;
  error?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  containerStyle?: ViewStyle;
  showPasswordToggle?: boolean;
  iconName?: keyof typeof Ionicons.glyphMap;
}

export const Input: React.FC<InputProps> = ({
  label,
  error,
  leftIcon,
  rightIcon,
  containerStyle,
  showPasswordToggle,
  secureTextEntry,
  iconName,
  ...props
}) => {
  const { mode, colors } = useTheme();
  const styles = useMemo(() => createStyles(colors, mode), [colors, mode]);
  const [isFocused, setIsFocused] = useState(false);
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);

  const renderLeftIcon = () => {
    if (leftIcon) return <View style={styles.iconLeft}>{leftIcon}</View>;
    if (iconName) {
      return (
        <View style={styles.iconLeft}>
          <Ionicons
            name={iconName}
            size={18}
            color={isFocused ? colors.primary : colors.textMuted}
          />
        </View>
      );
    }
    return null;
  };

  return (
    <View style={[styles.container, containerStyle]}>
      {label && <Text style={styles.label}>{label}</Text>}
      <View
        style={[
          styles.inputContainer,
          isFocused ? styles.focused : undefined,
          error ? styles.errorBorder : undefined,
        ]}
      >
        {renderLeftIcon()}
        <TextInput
          style={[
            styles.input,
            leftIcon || iconName ? styles.inputWithLeftIcon : undefined,
            rightIcon || showPasswordToggle
              ? styles.inputWithRightIcon
              : undefined,
          ]}
          placeholderTextColor={colors.textMuted}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          secureTextEntry={
            showPasswordToggle ? !isPasswordVisible : secureTextEntry
          }
          {...props}
        />
        {showPasswordToggle && (
          <TouchableOpacity
            onPress={() => setIsPasswordVisible(!isPasswordVisible)}
            style={styles.iconRight}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons
              name={isPasswordVisible ? 'eye-off-outline' : 'eye-outline'}
              size={20}
              color={colors.textMuted}
            />
          </TouchableOpacity>
        )}
        {rightIcon && !showPasswordToggle && (
          <View style={styles.iconRight}>{rightIcon}</View>
        )}
      </View>
      {error && <Text style={styles.errorText}>{error}</Text>}
    </View>
  );
};

const createStyles = (colors: ThemeColors, mode: 'light' | 'dark') =>
  StyleSheet.create({
    container: {
      marginBottom: spacing.lg,
    },
    label: {
      color: colors.text,
      fontSize: fonts.sizes.sm,
      fontWeight: '600',
      marginBottom: spacing.sm,
      letterSpacing: 0.2,
    },
    inputContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor:
        mode === 'dark' ? colors.backgroundLight : colors.surfaceLight,
      borderRadius: borderRadius.lg,
      borderWidth: 1.5,
      borderColor: colors.border,
    },
    focused: {
      borderColor: colors.primary,
      backgroundColor:
        mode === 'dark' ? colors.surface : colors.backgroundLight,
    },
    errorBorder: {
      borderColor: colors.error,
    },
    input: {
      flex: 1,
      color: colors.text,
      fontSize: fonts.sizes.md,
      paddingVertical: spacing.md + 2,
      paddingHorizontal: spacing.lg,
    },
    inputWithLeftIcon: {
      paddingLeft: spacing.sm,
    },
    inputWithRightIcon: {
      paddingRight: spacing.sm,
    },
    iconLeft: {
      paddingLeft: spacing.lg,
    },
    iconRight: {
      paddingRight: spacing.lg,
    },
    errorText: {
      color: colors.error,
      fontSize: fonts.sizes.sm,
      marginTop: spacing.xs,
    },
  });
