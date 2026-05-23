import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, borderRadius, spacing, shadows } from '../constants';
import { formatCurrency } from '../utils';

interface WalletCardProps {
  balance: number;
  heldBalance?: number;
  onFund?: () => void;
  onWithdraw?: () => void;
}

export const WalletCard: React.FC<WalletCardProps> = ({
  balance,
  heldBalance = 0,
  onFund,
  onWithdraw,
}) => {
  const availableBalance = balance - heldBalance;

  return (
    <LinearGradient
      colors={[colors.primary, colors.primaryDark]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.container}
    >
      {/* Decorative circles */}
      <View style={styles.decorCircle1} />
      <View style={styles.decorCircle2} />

      <View style={styles.content}>
        <View style={styles.header}>
          <Text style={styles.label}>Available Balance</Text>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>NGN</Text>
          </View>
        </View>

        <Text style={styles.balance}>{formatCurrency(availableBalance)}</Text>

        {heldBalance > 0 && (
          <View style={styles.heldContainer}>
            <Ionicons name="lock-closed-outline" size={14} color="#FFFFFF" />
            <Text style={styles.heldLabel}>
              {formatCurrency(heldBalance)} held in bids
            </Text>
          </View>
        )}

        <View style={styles.actions}>
          {onFund && (
            <TouchableOpacity
              onPress={onFund}
              style={styles.actionButton}
              activeOpacity={0.8}
            >
              <Ionicons name="add" size={18} color="#FFFFFF" />
              <Text style={styles.actionText}>Fund</Text>
            </TouchableOpacity>
          )}
          {onWithdraw && (
            <TouchableOpacity
              onPress={onWithdraw}
              style={styles.actionButton}
              activeOpacity={0.8}
            >
              <Ionicons name="cash-outline" size={18} color="#FFFFFF" />
              <Text style={styles.actionText}>Withdraw</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  container: {
    borderRadius: borderRadius.xl,
    padding: spacing.xl,
    overflow: 'hidden',
    ...shadows.lg,
  },
  decorCircle1: {
    position: 'absolute',
    top: -50,
    right: -50,
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  decorCircle2: {
    position: 'absolute',
    bottom: -30,
    left: -30,
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  content: {
    zIndex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  label: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: fonts.sizes.sm,
  },
  badge: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.sm,
  },
  badgeText: {
    color: colors.text,
    fontSize: fonts.sizes.xs,
    fontWeight: '600',
  },
  balance: {
    color: colors.text,
    fontSize: fonts.sizes.display,
    fontWeight: '700',
    marginBottom: spacing.sm,
  },
  heldContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: 'rgba(0,0,0,0.2)',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    marginBottom: spacing.lg,
    alignSelf: 'flex-start',
  },
  heldLabel: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: fonts.sizes.sm,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.lg,
    gap: spacing.sm,
  },
  actionText: {
    color: colors.text,
    fontSize: fonts.sizes.md,
    fontWeight: '600',
  },
});
