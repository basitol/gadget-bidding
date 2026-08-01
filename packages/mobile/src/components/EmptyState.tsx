import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ThemeColors, fonts, spacing, borderRadius } from '../constants';
import { useTheme } from '../hooks';
import { Button } from './Button';
import { FadeInView } from './FadeInView';

interface EmptyStateProps {
  icon?: string;
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon = 'cube-outline',
  title,
  message,
  actionLabel,
  onAction,
}) => {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <FadeInView style={styles.container}>
      <View style={styles.iconContainer}>
        <Ionicons name={icon as any} size={40} color={colors.primary} />
      </View>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.message}>{message}</Text>
      {actionLabel && onAction && (
        <Button
          title={actionLabel}
          onPress={onAction}
          variant="primary"
          style={styles.button}
        />
      )}
    </FadeInView>
  );
};

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: spacing.xxl,
    },
    iconContainer: {
      width: 88,
      height: 88,
      borderRadius: borderRadius.full,
      backgroundColor: colors.primary + '14',
      borderWidth: 1,
      borderColor: colors.primary + '26',
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: spacing.lg,
    },
    title: {
      color: colors.text,
      fontSize: fonts.sizes.xl,
      fontFamily: fonts.bold,
      textAlign: 'center',
      marginBottom: spacing.sm,
    },
    message: {
      color: colors.textSecondary,
      fontSize: fonts.sizes.md,
      fontFamily: fonts.regular,
      textAlign: 'center',
      lineHeight: 22,
    },
    button: {
      marginTop: spacing.xl,
    },
  });
