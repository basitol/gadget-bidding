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

// NOTE: Draft privacy copy mapped to actual data flows. Must be reviewed by
// legal/PM and the company details + effective date confirmed before launch.
// This file is not legal advice.

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

const PRIVACY_SECTIONS = [
  {
    title: 'Introduction',
    body: 'This Privacy Policy explains how GadgetBid (we, us, or our) collects, uses, and protects your personal data when you use our marketplace app and website to browse, bid, buy, and sell gadgets. We process personal data in line with the Nigeria Data Protection Act 2023 and the Nigeria Data Protection Regulation (NDPR) 2019.',
  },
  {
    title: 'Information we collect',
    body: 'When you create an account we collect your name, email address, phone number, and a securely hashed password. You may add an avatar and delivery or shipping addresses. Sellers provide bank account details so we can send payouts. As you use the app we collect information about your bids, auction listings, orders, wallet transactions, and disputes. When you pay, Paystack processes the payment and we receive transaction references, amounts, status, and limited payment metadata — we never store your card details. We also collect technical data such as IP address, device and app version, and service logs needed to run and secure the platform.',
  },
  {
    title: 'How we use your information',
    body: 'We use your data to operate auctions and process bids, payments, refunds, and payouts; to verify identity and prevent fraud, including bid commitment holds and account suspensions; to send you service messages by SMS and in-app notifications; to resolve disputes and provide support; and to meet legal, tax, and payment requirements.',
  },
  {
    title: 'Legal bases for processing',
    body: 'We rely on performance of our contract with you (bidding, buying, selling, and payout services); our legal obligations (payments, tax, and regulatory record-keeping); our legitimate interests (fraud prevention, platform security, and improving our service); and your consent where required, for example optional marketing messages, which you can withdraw at any time.',
  },
  {
    title: 'Sharing with third parties',
    body: 'We share only the data needed to operate the service. Paystack processes card payments and bank payouts and receives your name, email, phone, bank details, and transaction references. Cloudinary stores images you upload (gadget photos, avatars, dispute evidence). Termii delivers SMS, including one-time passwords, and receives your phone number. Infrastructure providers (hosting, database, and caching services) process data on our behalf. We do not sell your personal data.',
  },
  {
    title: 'Payments and your wallet',
    body: 'Your wallet balance reflects real money you have funded. Card details are handled by Paystack under their privacy policy and are never stored by us. Bank details are used only to credit payouts to you. Each payment and payout uses a unique reference to keep transactions traceable and secure.',
  },
  {
    title: 'Security',
    body: 'We protect your data with encryption in transit, hashed passwords, access controls, rate limiting, and redacted logs. We review access to personal data on a need-to-know basis and respond to security incidents in line with the 72-hour breach notification requirement of the Nigeria Data Protection Regulation.',
  },
  {
    title: 'Data retention',
    body: 'We keep your account data while your account is active. Financial and transaction records are kept as long as required by law and by our payment providers\u2019 requirements. Bid holds, penalties, and dispute records are kept while relevant and then deleted. When you close your account we delete or anonymise your personal data unless we are legally required to keep it.',
  },
  {
    title: 'Your rights',
    body: 'You may request access to your personal data, correct inaccurate information, request deletion, restrict or object to processing, and ask for a copy of your data in a portable format. You can withdraw consent at any time. To exercise any right, contact us using the details below. If you are not satisfied, you may complain to the Nigeria Data Protection Commission (NDPC).',
  },
  {
    title: 'Cross-border transfers',
    body: 'Some of our service providers store data outside Nigeria. Where personal data is transferred internationally, we rely on appropriate safeguards to keep it protected.',
  },
  {
    title: 'Children',
    body: 'GadgetBid is intended for people aged 18 and over. We do not knowingly collect personal data from children.',
  },
  {
    title: 'Cookies and analytics',
    body: 'Our web services use cookies and similar technologies for sessions and basic analytics to keep you signed in and improve performance. You can clear or block cookies in your browser; this may affect sign-in.',
  },
  {
    title: 'Changes to this policy',
    body: 'We may update this policy from time to time. We will post the updated version here with a new effective date and notify you of material changes.',
  },
  {
    title: 'Contact us',
    body: 'Questions, requests, or complaints about your data can be sent to support@gadgetbid.ng or through in-app support. Our Data Protection Officer can be reached at the same address.',
  },
];

const PRIVACY_EFFECTIVE_DATE = '1 September 2026';

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
        <Text style={styles.headerTitle}>Terms & privacy</Text>
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

        <Text style={styles.sectionHeader}>Privacy policy</Text>
        <Text style={styles.effectiveDate}>
          Effective date: {PRIVACY_EFFECTIVE_DATE}
        </Text>

        {PRIVACY_SECTIONS.map(section => (
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
    sectionHeader: {
      color: colors.text,
      fontSize: fonts.sizes.xxl,
      fontFamily: fonts.bold,
      marginTop: spacing.lg,
    },
    effectiveDate: {
      color: colors.textSecondary,
      fontSize: fonts.sizes.sm,
      fontFamily: fonts.regular,
    },
  });
