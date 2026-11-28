import React, { useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { PLATFORM_FEE_TIERS } from '@gadget-bidding/shared';
import { G, GlassScreen, GlassHeader, GlassCard, PrimaryButton, FooterBar } from '../../../components/glass';
import { fonts } from '../../../constants';
import { Overline, s as shared } from './shared';

/**
 * Short answers for sellers. They match the backend: platform fee by price band (PLATFORM_FEE_TIERS), drop-off by
 * 6 pm the next hub working day (DROPOFF_RULE; the hub is open Mon–Sat), the 7 hub checks
 * (HUB_INSPECTION_CHECKS), payouts at 6 pm Lagos, CASE_REPLY_HOURS (48), up to 5 store staff.
 */
const TOPICS: { key: string; title: string; body: string[] }[] = [
  {
    key: 'fees',
    title: 'What fees do I pay?',
    body: [
      "Listing is free. We take a fee only when an item sells, and it depends on the price. You see what you'll get before you list.",
      ...PLATFORM_FEE_TIERS.map(t => `${t.label}.`),
      'Delivery is paid by the buyer, not you.',
    ],
  },
  {
    key: 'dropoff',
    title: 'When do I drop off a sold item?',
    body: [
      'Once the buyer pays, bring it to our Computer Village hub by 6 pm the next working day. The hub is open Monday to Saturday.',
      'Show the drop-off code from your Orders tab at the counter. Anyone on your store staff list can drop off for you.',
    ],
  },
  {
    key: 'inspection',
    title: 'What does the hub check?',
    body: [
      "We check every item against your listing: IMEI or serial, that it isn't reported stolen, that the iCloud or Google account is removed, the screen, battery health, cameras, speakers and mics, and the body and grade.",
      "If it doesn't match your listing, the buyer is refunded and it counts against your rating and passed checks.",
    ],
  },
  {
    key: 'payouts',
    title: 'When do I get paid?',
    body: [
      "When the buyer confirms it arrived okay, or 48 hours after delivery if they don't reply. We send what's ready at 6 pm each day, in one transfer to your business account.",
      'Your payout account must be in your registered business name. Add or change it under Store › Payout account.',
    ],
  },
  {
    key: 'cases',
    title: 'What if a buyer reports a problem?',
    body: [
      'We open a case and hold the payout for that order. Give your side within 48 hours, with photos if you can. Our team looks at both sides and decides.',
    ],
  },
  {
    key: 'staff',
    title: 'Can someone else drop off or collect?',
    body: [
      'Yes. Add up to 5 people under Store › Store staff, with their full name and phone number. Our hub team sees the list.',
    ],
  },
];

/** Help for sellers: short topics that open in place, and a way to reach our team. */
export const SellerHelpScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const [open, setOpen] = useState<string | null>(null);

  return (
    <GlassScreen>
      <GlassHeader title="Help for sellers" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={shared.content}>
        <Overline style={styles.first}>Selling with us</Overline>
        <GlassCard style={shared.group}>
          {TOPICS.map((t, i) => {
            const on = open === t.key;
            return (
              <View key={t.key} style={i < TOPICS.length - 1 && shared.divider}>
                <Pressable
                  onPress={() => setOpen(on ? null : t.key)}
                  style={({ pressed }) => [styles.row, pressed && styles.pressed]}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: on }}
                >
                  <Text style={styles.title}>{t.title}</Text>
                  <Ionicons name={on ? 'chevron-up' : 'chevron-down'} size={18} color={G.faint} />
                </Pressable>
                {on ? (
                  <View style={styles.body}>
                    {t.body.map(p => (
                      <Text key={p} style={styles.para}>
                        {p}
                      </Text>
                    ))}
                  </View>
                ) : null}
              </View>
            );
          })}
        </GlassCard>
        <Text style={shared.help}>Can't find it? Chat with our seller team. We reply within 1 working day.</Text>
      </ScrollView>
      <FooterBar>
        <PrimaryButton label="Chat with us" onPress={() => navigation.navigate('SupportChat')} />
      </FooterBar>
    </GlassScreen>
  );
};

const styles = StyleSheet.create({
  first: { marginTop: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, minHeight: 56, paddingVertical: 14 },
  pressed: { backgroundColor: 'rgba(255,255,255,0.6)' },
  title: { flex: 1, color: G.ink, fontSize: 15, fontFamily: fonts.medium },
  body: { paddingHorizontal: 16, paddingBottom: 16, gap: 8 },
  para: { color: G.slate, fontSize: 15, lineHeight: 22, fontFamily: fonts.regular },
});
