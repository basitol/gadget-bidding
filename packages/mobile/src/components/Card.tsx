import React from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { borderRadius, shadows, spacing } from '../constants';
import { useTheme } from '../hooks';

type CardProps = {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
};

export function Card({ children, style }: CardProps) {
  const { mode, colors } = useTheme();

  return (
    <View
      style={[
        styles.base,
        {
          backgroundColor: mode === 'dark' ? colors.surface : colors.surface,
          borderColor: colors.border,
          ...(mode === 'light' ? shadows.sm : {}),
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: borderRadius.xxl,
    padding: spacing.lg,
    borderWidth: 1,
  },
});

