import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../hooks';
import { ThemeColors, fonts, spacing, borderRadius, shadows } from '../../constants';

export interface QuickAction {
  id: string;
  title: string;
  subtitle: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  badge?: string | number;
  live?: boolean;
  onPress: () => void;
}

interface QuickActionGridProps {
  actions: QuickAction[];
}

export const QuickActionGrid: React.FC<QuickActionGridProps> = ({ actions }) => {
  const { colors, mode } = useTheme();
  const styles = useMemo(() => createStyles(colors, mode), [colors, mode]);

  return (
    <View style={styles.grid}>
      {actions.map(action => (
        <TouchableOpacity
          key={action.id}
          style={styles.card}
          activeOpacity={0.85}
          onPress={action.onPress}
        >
          <View style={styles.cardTop}>
            <View style={[styles.iconWrap, { backgroundColor: action.color + '22' }]}>
              <Ionicons name={action.icon} size={22} color={action.color} />
            </View>
            {action.live && (
              <View style={styles.livePill}>
                <Text style={styles.livePillText}>LIVE</Text>
              </View>
            )}
            {action.badge != null && (
              <View style={styles.countBadge}>
                <Text style={styles.countBadgeText}>{action.badge}</Text>
              </View>
            )}
          </View>
          <Text style={styles.title}>{action.title}</Text>
          <Text style={styles.subtitle}>{action.subtitle}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
};

const createStyles = (colors: ThemeColors, mode: 'light' | 'dark') =>
  StyleSheet.create({
    grid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.md,
    },
    card: {
      width: '47%',
      flexGrow: 1,
      minHeight: 118,
      backgroundColor: mode === 'dark' ? colors.surface : colors.backgroundLight,
      borderRadius: borderRadius.xl,
      padding: spacing.md,
      borderWidth: 1,
      borderColor: colors.border,
      ...shadows.sm,
    },
    cardTop: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginBottom: spacing.sm,
    },
    iconWrap: {
      width: 44,
      height: 44,
      borderRadius: borderRadius.lg,
      justifyContent: 'center',
      alignItems: 'center',
    },
    livePill: {
      backgroundColor: colors.error,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: borderRadius.full,
    },
    livePillText: {
      color: '#FFFFFF',
      fontSize: 9,
      fontFamily: fonts.bold,
    },
    countBadge: {
      minWidth: 22,
      height: 22,
      borderRadius: 11,
      backgroundColor: colors.primary,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 6,
    },
    countBadgeText: {
      color: '#FFFFFF',
      fontSize: 11,
      fontFamily: fonts.bold,
    },
    title: {
      color: colors.text,
      fontSize: fonts.sizes.md,
      fontFamily: fonts.bold,
      marginBottom: 4,
    },
    subtitle: {
      color: colors.textSecondary,
      fontSize: fonts.sizes.xs,
      fontFamily: fonts.medium,
      lineHeight: 16,
    },
  });
