import React from 'react';
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  ActivityIndicator,
  ViewStyle,
  TextStyle,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, fonts, borderRadius, spacing } from '../constants';

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
  const isDisabled = disabled || loading;

  const getSizeStyles = () => {
    switch (size) {
      case 'sm':
        return { paddingVertical: spacing.sm, paddingHorizontal: spacing.md };
      case 'lg':
        return { paddingVertical: spacing.lg, paddingHorizontal: spacing.xxl };
      default:
        return { paddingVertical: spacing.md, paddingHorizontal: spacing.xl };
    }
  };

  const getTextSize = () => {
    switch (size) {
      case 'sm':
        return fonts.sizes.sm;
      case 'lg':
        return fonts.sizes.lg;
      default:
        return fonts.sizes.md;
    }
  };

  const renderContent = () => (
    <>
      {loading ? (
        <ActivityIndicator
          color={
            variant === 'outline' || variant === 'ghost'
              ? colors.primary
              : colors.text
          }
          size="small"
        />
      ) : (
        <>
          {icon}
          <Text
            style={[
              styles.text,
              { fontSize: getTextSize() },
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
      )}
    </>
  );

  if (variant === 'primary') {
    return (
      <TouchableOpacity
        onPress={onPress}
        disabled={isDisabled}
        activeOpacity={0.8}
        style={[fullWidth ? styles.fullWidth : undefined, style]}
      >
        <LinearGradient
          colors={
            isDisabled
              ? [colors.surfaceLight, colors.surface]
              : [colors.primary, colors.primaryLight]
          }
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={[
            styles.button,
            getSizeStyles(),
            isDisabled ? styles.disabled : undefined,
          ]}
        >
          {renderContent()}
        </LinearGradient>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={isDisabled}
      activeOpacity={0.7}
      style={[
        styles.button,
        getSizeStyles(),
        variant === 'secondary' ? styles.secondaryButton : undefined,
        variant === 'outline' ? styles.outlineButton : undefined,
        variant === 'ghost' ? styles.ghostButton : undefined,
        isDisabled ? styles.disabled : undefined,
        fullWidth ? styles.fullWidth : undefined,
        style,
      ]}
    >
      {renderContent()}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: borderRadius.lg,
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
    color: colors.text,
    fontWeight: '600',
  },
  secondaryText: {
    color: colors.background,
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
