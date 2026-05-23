import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../hooks';
import { ThemeColors, fonts, spacing, borderRadius } from '../../constants';

interface PasswordRequirementsProps {
  password: string;
}

const RULES = [
  { key: 'length', label: '8+ characters', test: (p: string) => p.length >= 8 },
  { key: 'upper', label: 'Uppercase', test: (p: string) => /[A-Z]/.test(p) },
  { key: 'lower', label: 'Lowercase', test: (p: string) => /[a-z]/.test(p) },
  { key: 'number', label: 'Number', test: (p: string) => /[0-9]/.test(p) },
] as const;

export const PasswordRequirements: React.FC<PasswordRequirementsProps> = ({
  password,
}) => {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Password strength</Text>
      <View style={styles.rules}>
        {RULES.map(rule => {
          const met = rule.test(password);
          return (
            <View
              key={rule.key}
              style={[styles.chip, met ? styles.chipMet : undefined]}
            >
              <Ionicons
                name={met ? 'checkmark-circle' : 'ellipse-outline'}
                size={14}
                color={met ? colors.success : colors.textMuted}
              />
              <Text style={[styles.chipText, met ? styles.chipTextMet : undefined]}>
                {rule.label}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
};

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: {
      backgroundColor: colors.surfaceLight,
      borderRadius: borderRadius.lg,
      padding: spacing.md,
      marginBottom: spacing.lg,
      borderWidth: 1,
      borderColor: colors.border,
    },
    title: {
      color: colors.textSecondary,
      fontSize: fonts.sizes.sm,
      fontWeight: '600',
      marginBottom: spacing.sm,
      textAlign: 'center',
    },
    rules: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'center',
      gap: spacing.sm,
    },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      paddingVertical: spacing.xs,
      paddingHorizontal: spacing.sm,
      borderRadius: borderRadius.full,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    chipMet: {
      borderColor: colors.success + '55',
      backgroundColor: colors.success + '12',
    },
    chipText: {
      color: colors.textMuted,
      fontSize: fonts.sizes.xs,
      fontWeight: '500',
    },
    chipTextMet: {
      color: colors.success,
    },
  });
