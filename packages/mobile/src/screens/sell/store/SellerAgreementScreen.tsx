import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { PLATFORM_FEE_TIERS, SELLER_POLICY } from '@gadget-bidding/shared';
import { G, GlassScreen, GlassHeader } from '../../../components/glass';
import { fonts } from '../../../constants';
import { s as shared } from './shared';

/**
 * The seller agreement. Every number comes from shared/sellerPolicy.ts, the same values the server
 * charges and checks with, so the text can't drift from what the app does. The two clock times
 * (drop-off and payout, both 6:00 pm Lagos) are the backend's DROPOFF_CUTOFF_HOUR (order.service)
 * and PAYOUT_HOUR (payouts.service). Plain text on the background: no glass on legal pages.
 */

const P = SELLER_POLICY;
const naira = (n: number) => `₦${Math.round(n).toLocaleString('en-NG')}`;

/** "2026-11-01" → "Nov 1, 2026" (read as a calendar date, not UTC midnight). */
const updatedLabel = (() => {
  const [y, m, d] = P.agreementUpdated.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
})();

/** "8%, 6% or 5%" */
const percents = (() => {
  const list = PLATFORM_FEE_TIERS.filter(t => t.percent != null).map(t => `${t.percent}%`);
  return list.length > 1 ? `${list.slice(0, -1).join(', ')} or ${list[list.length - 1]}` : list.join('');
})();

/** The most a sale can cost in fees (the flat top band, or the top of a percentage band). */
const feeCap = Math.max(
  ...PLATFORM_FEE_TIERS.map(t => (t.flat != null ? t.flat : t.upTo != null ? (t.upTo * (t.percent ?? 0)) / 100 : 0))
);

const DROP_OFF = 'by 6:00 pm on the next working day the hub is open (Monday–Saturday)';

const IN_SHORT = [
  'Only CAC-registered businesses in Computer Village can sell.',
  `Fees come off each sale: ${percents}, capped at ${naira(feeCap)}.`,
  `Drop the gadget at the hub ${DROP_OFF} after the buyer pays.`,
  "You're paid after the buyer confirms, in the next 6:00 pm run.",
];

const SECTIONS: { title: string; body: string[] }[] = [
  {
    title: 'Who can sell',
    body: [
      'Businesses registered with the CAC (RC or BN number) with a shop in Computer Village, Ikeja. We check your certificate, the owner’s ID and your shop address before you can list.',
      'A seller account can’t buy. Use a separate buyer account for that.',
    ],
  },
  {
    title: 'Listings',
    body: [
      'Describe every gadget honestly — condition, battery health, faults, what’s in the box. Photos must be of the actual item.',
      'We review each listing before it goes live, usually within 2 hours.',
      'You can change the price or end a listing until the first bid. After that it runs to the end. If something’s wrong, contact us.',
    ],
  },
  {
    title: 'Fees',
    body: [
      `${PLATFORM_FEE_TIERS.map(t => t.label).join(' · ')}.`,
      'Fees are only charged on completed sales. We pay Paystack’s transfer costs.',
    ],
  },
  {
    title: 'After a sale',
    body: [
      `Drop the gadget at our hub, ${P.hubAddress}, ${DROP_OFF} after the buyer pays, or book a rider for ${naira(P.riderPickupFee)}.`,
      'Sign out of iCloud or Google and reset the device first. Pack everything you listed.',
    ],
  },
  {
    title: 'Inspection',
    body: [
      `Hub staff check the gadget against your listing. If it fails, the buyer is refunded and you collect it or we return it for ${naira(P.returnDeliveryFee)}.`,
      `Uncollected items: free for ${P.freeCollectionDays} days, then ${naira(P.storageFeePerDay)} a day. After ${P.disposeAfterDays} days we may dispose of them.`,
      `${P.failedSaleLimit} refunded sales in ${P.failedSaleWindowDays} days pause new listings.`,
    ],
  },
  {
    title: 'Payouts',
    body: [
      `Money is released when the buyer confirms, or ${P.confirmWindowHours} hours after delivery with no complaint. Payouts go out every day at 6:00 pm, Sundays included.`,
      `We only pay into a bank account in the same name as your CAC registration. Changing it pauses payouts for ${P.payoutHoldDaysAfterAccountChange} days for safety.`,
    ],
  },
  {
    title: 'Disputes',
    body: [
      `If a buyer reports a problem, you get ${P.caseReplyHours} hours to reply with evidence. You can ask for one second review of a refund decision; after that, our decision is final. Refunds come from that order’s held payout.`,
    ],
  },
  {
    title: 'Privacy',
    body: [
      'Buyers see you as “Verified seller CV-xxxx”, never your business name. You never see the buyer’s name, phone or address.',
    ],
  },
  {
    title: 'Not allowed',
    body: [
      'Bidding on your own listings, or asking anyone to. Selling stolen, blacklisted or fake gadgets. Contacting buyers outside the app.',
      'Breaking these rules can mean paused listings, held payouts or a closed account, and we report stolen goods to the police.',
    ],
  },
  {
    title: 'Law',
    body: ['This agreement follows Nigerian law. Disputes go to the courts in Lagos State.'],
  },
];

export const SellerAgreementScreen: React.FC<{ navigation: any }> = ({ navigation }) => (
  <GlassScreen>
    <GlassHeader title="Seller agreement" onBack={() => navigation.goBack()} />
    <ScrollView contentContainerStyle={[shared.content, styles.content]}>
      <View style={styles.updated}>
        <Text style={styles.updatedText}>Updated {updatedLabel}</Text>
      </View>
      <Text style={styles.title} accessibilityRole="header">
        Seller agreement
      </Text>
      <Text style={styles.sub}>What you agree to when your business sells on Gadgets Bidding.</Text>

      <View style={styles.short}>
        <Text style={styles.shortLabel}>In short</Text>
        {IN_SHORT.map(line => (
          <View key={line} style={styles.bullet}>
            <View style={styles.dot} />
            <Text style={styles.bulletText}>{line}</Text>
          </View>
        ))}
      </View>

      {SECTIONS.map((sec, i) => (
        <View key={sec.title} style={styles.section}>
          <Text style={styles.sectionTitle} accessibilityRole="header">
            {i + 1}. {sec.title}
          </Text>
          {sec.body.map(p => (
            <Text key={p} style={styles.body}>
              {p}
            </Text>
          ))}
        </View>
      ))}
    </ScrollView>
  </GlassScreen>
);

const styles = StyleSheet.create({
  content: { paddingTop: 8, paddingBottom: 48 },
  updated: {
    alignSelf: 'flex-start',
    height: 30,
    paddingHorizontal: 10,
    borderRadius: 9,
    backgroundColor: '#F5F6F9',
    justifyContent: 'center',
  },
  updatedText: { color: G.ink, fontSize: 13, fontFamily: fonts.medium },
  title: { color: G.ink, fontSize: 26, lineHeight: 32, letterSpacing: -0.5, fontFamily: fonts.medium, marginTop: 12 },
  sub: { color: G.muted, fontSize: 15, lineHeight: 22, fontFamily: fonts.regular, marginTop: 6 },

  short: { backgroundColor: '#F1F5FF', borderRadius: 18, padding: 16, marginTop: 20, gap: 10 },
  shortLabel: { color: G.blue600, fontSize: 15, fontFamily: fonts.medium },
  bullet: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: G.blue, marginTop: 9 },
  bulletText: { flex: 1, color: G.ink, fontSize: 15, lineHeight: 22, fontFamily: fonts.regular },

  section: {
    marginTop: 20,
    paddingTop: 20,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(28,31,42,0.12)',
    gap: 8,
  },
  sectionTitle: { color: G.ink, fontSize: 19, letterSpacing: -0.2, fontFamily: fonts.medium },
  body: { color: G.slate, fontSize: 15, lineHeight: 22, fontFamily: fonts.regular },
});
