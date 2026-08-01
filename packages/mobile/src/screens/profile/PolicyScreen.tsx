import React, { useMemo } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import {
  BID_COMMITMENT_AMOUNT,
  BID_DEFAULT_PENALTY_AMOUNT,
  BID_PAYMENT_DEADLINE_HOURS,
  PLATFORM_FEE_PERCENTAGE,
} from '@gadget-bidding/shared';
import { useTheme } from '../../hooks';
import { ThemeColors, fonts, spacing, borderRadius } from '../../constants';
import { formatCurrency } from '../../utils';

type PolicyScreenProps = {
  navigation: any;
};

const POLICY_SECTIONS = [
  {
    title: 'Bid commitment',
    body: `You need at least ${formatCurrency(BID_COMMITMENT_AMOUNT)} available in your wallet to place a bid. When you are the current winning bidder, this amount is held as a commitment deposit. It is released if you are outbid or when you complete payment.`,
  },
  {
    title: 'Winning bid payment',
    body: `If you win an auction, pay within ${BID_PAYMENT_DEADLINE_HOURS} hours. If payment is missed, the ${formatCurrency(BID_COMMITMENT_AMOUNT)} commitment is forfeited, your account is suspended, and reactivation requires a ${formatCurrency(BID_DEFAULT_PENALTY_AMOUNT)} penalty.`,
  },
  {
    title: 'Second-place buyer',
    body: 'If the winning bidder misses payment, GadgetBid may offer the item to the next eligible bidder at their last bid amount.',
  },
  {
    title: 'Seller fees',
    body: `Sellers are charged a ${PLATFORM_FEE_PERCENTAGE}% platform fee on successful sales. The app shows estimated payout before a seller lists an auction.`,
  },
  {
    title: 'Backoffice delivery',
    body: 'Sellers send sold items to GadgetBid backoffice first. Backoffice confirms receipt, handles buyer delivery, and updates tracking where available.',
  },
  {
    title: 'Refunds and disputes',
    body: 'Refunds and payout holds are reviewed by backoffice. Opening a dispute can hold seller payout until the issue is resolved.',
  },
];

export const PolicyScreen: React.FC<PolicyScreenProps> = ({ navigation }) => {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
          activeOpacity={0.8}
        >
          <Ionicons name="arrow-back" size={20} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Terms & policies</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
      >
        <View style={styles.heroCard}>
          <View style={styles.heroIcon}>
            <Ionicons
              name="shield-checkmark-outline"
              size={24}
              color={colors.primary}
            />
          </View>
          <Text style={styles.heroTitle}>Clear auction rules</Text>
          <Text style={styles.heroText}>
            These policies protect buyers, sellers, and backoffice operations
            before money or gadgets move.
          </Text>
        </View>

        {POLICY_SECTIONS.map(section => (
          <View key={section.title} style={styles.card}>
            <Text style={styles.cardTitle}>{section.title}</Text>
            <Text style={styles.cardText}>{section.body}</Text>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
};

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
    },
    backButton: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerTitle: {
      flex: 1,
      textAlign: 'center',
      color: colors.text,
      fontSize: fonts.sizes.xl,
      fontFamily: fonts.bold,
    },
    headerSpacer: {
      width: 40,
    },
    content: {
      padding: spacing.lg,
      paddingBottom: 120,
      gap: spacing.md,
    },
    heroCard: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.primary + '24',
      borderRadius: borderRadius.xxl,
      padding: spacing.lg,
      gap: spacing.sm,
    },
    heroIcon: {
      width: 48,
      height: 48,
      borderRadius: 24,
      backgroundColor: colors.primary + '14',
      alignItems: 'center',
      justifyContent: 'center',
    },
    heroTitle: {
      color: colors.text,
      fontSize: fonts.sizes.xxl,
      fontFamily: fonts.bold,
    },
    heroText: {
      color: colors.textSecondary,
      fontSize: fonts.sizes.md,
      lineHeight: 22,
      fontFamily: fonts.regular,
    },
    card: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: borderRadius.xl,
      padding: spacing.lg,
      gap: spacing.xs,
    },
    cardTitle: {
      color: colors.text,
      fontSize: fonts.sizes.lg,
      fontFamily: fonts.bold,
    },
    cardText: {
      color: colors.textSecondary,
      fontSize: fonts.sizes.md,
      lineHeight: 23,
      fontFamily: fonts.regular,
    },
  });
