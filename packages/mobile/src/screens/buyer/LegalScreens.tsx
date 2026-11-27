import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Alert,
  ActivityIndicator,
  LayoutAnimation,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import {
  G,
  GlassScreen,
  GlassHeader,
  GlassCard,
  PrimaryButton,
  SecondaryButton,
} from '../../components/glass';
import { useReducedMotion } from '../../components/motion';
import { fonts } from '../../constants';
import { meService } from '../../services';
import type { PrivacySettings, PrivacySwitch } from '../../services';
import { useAuthStore } from '../../store';
import { useToastStore } from '../../store/toastStore';
import { setUsageStatsEnabled } from '../../config/sentry';

const toast = (msg: string, type: 'success' | 'error' = 'success') => useToastStore.getState().show(msg, type);
const errText = (e: unknown, fallback: string) => (e instanceof Error && e.message ? e.message : fallback);

export const LEGAL_UPDATED = 'Nov 1, 2026';

/** "Dec 4, 2026" */
const longDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

/* ================= Long legal pages (no glass: text-heavy) ================= */

/** A run of text: plain, Medium-weight, or a link to another screen. */
type Seg = string | { b: string } | { link: string; to: string };
type Para = Seg | Seg[];
interface LegalSection {
  title: string;
  paras: Para[];
}
interface LegalDoc {
  title: string;
  intro: string;
  inShort: string[];
  sections: LegalSection[];
}

const TERMS_OF_USE: LegalDoc = {
  title: 'Terms of use',
  intro: 'The agreement between you and Gadgets Bidding when you buy on the app.',
  inShort: [
    "A bid is a promise to buy. It can't be cancelled.",
    'Win it, pay within 24 hours.',
    'Your money sits in escrow until you confirm the gadget is right.',
    'Something wrong? Tell us within 48 hours of delivery.',
  ],
  sections: [
    {
      title: '1. About these terms',
      paras: [
        [
          'These terms are between you and Gadgets Bidding Ltd (RC 1952217), 14 Ola-Ayeni Street, Computer Village, Ikeja, Lagos. By creating an account you agree to them, our ',
          { link: 'Privacy policy', to: 'PrivacyPolicy' },
          ' and the auction rules.',
        ],
      ],
    },
    {
      title: '2. Your account',
      paras: [
        'You must be 18 or older and use your real details. One buyer account per person.',
        "A buyer account can't sell. Businesses that want to sell apply for a separate seller account.",
        "Keep your password safe. You're responsible for bids made from your account.",
      ],
    },
    {
      title: '3. Bidding',
      paras: [
        'Bids are binding. Each bid must beat the current one by at least the bid step shown.',
        'Auto-bid bids for you, one step at a time, up to the maximum you set.',
        'If a bid comes in during the last 2 minutes, the clock gets 2 more minutes so everyone has a fair chance.',
      ],
    },
    {
      title: '4. Winning and paying',
      paras: [
        'If you win, pay within 24 hours by card, bank transfer or USSD through Paystack.',
        "If you don't pay in time, the item goes to the next bidder and it counts as a missed payment. 3 missed payments in 90 days and your account is suspended.",
      ],
    },
    {
      title: '5. Fees',
      paras: [
        'Buyers pay no platform fee. Delivery within Lagos is ₦3,500, or free if you collect from the hub. You see the full total before you pay.',
      ],
    },
    {
      title: '6. Escrow and inspection',
      paras: [
        'Your payment is held in escrow, not paid to the seller.',
        "Every gadget is checked at our Computer Village hub against the listing before it's sent to you. If it fails, you get a full refund.",
      ],
    },
    {
      title: '7. Delivery and confirming',
      paras: [
        'We deliver within Lagos in 1–2 days after the hub check.',
        "Confirm the gadget is right in the app. If you don't confirm or report a problem within 48 hours, the order completes and the seller is paid.",
      ],
    },
    {
      title: '8. Problems and refunds',
      paras: [
        'Report a problem within 48 hours of delivery with photos or a video. We decide within 5 working days.',
        'Refunds go back the way you paid. Card refunds usually take 5–10 working days to show.',
      ],
    },
    {
      title: '9. Not allowed',
      paras: [
        "Bidding on your own items or a friend's to push the price up.",
        'Selling stolen, blacklisted or fake gadgets.',
        'Trying to pay or meet outside the app to avoid fees or protection.',
      ],
    },
    {
      title: '10. Suspension',
      paras: ["We can pause or close accounts that break these terms. We'll tell you why, and you can appeal through Help."],
    },
    {
      title: '11. Our responsibility',
      paras: [
        "We check gadgets carefully, but we aren't the maker and don't give a manufacturer's warranty. Nothing here limits your rights under the Federal Competition and Consumer Protection Act.",
      ],
    },
    {
      title: '12. Law',
      paras: ['These terms follow the laws of the Federal Republic of Nigeria. Disputes go to the courts in Lagos State.'],
    },
    {
      title: '13. Contact',
      paras: [['help@gadgetsbidding.com · ', { link: 'in-app Help', to: 'Help' }, ' · Mon–Sat, 9 am – 6 pm.']],
    },
  ],
};

const PRIVACY_POLICY: LegalDoc = {
  title: 'Privacy policy',
  intro: 'How we collect, use and protect your information under the Nigeria Data Protection Act 2023.',
  inShort: [
    'We never sell your data.',
    'Sellers never see your name — only an order number. Riders only see what they need to deliver.',
    'Paystack handles your card. We never see the full number.',
    'You can download or delete your data at any time from Privacy & your data.',
  ],
  sections: [
    {
      title: '1. Who we are',
      paras: [
        [
          'Gadgets Bidding Ltd (RC 1952217), 14 Ola-Ayeni Street, Computer Village, Ikeja, Lagos, is responsible for your data. Our Data Protection Officer is at ',
          { b: 'privacy@gadgetsbidding.com' },
          '.',
        ],
      ],
    },
    {
      title: '2. What we collect',
      paras: [
        [{ b: 'Account:' }, ' name, username, email, phone number and password (stored scrambled, never readable).'],
        [{ b: 'Buying:' }, ' bids, watchlist, orders, delivery addresses and messages with support.'],
        [
          { b: 'Payments:' },
          ' Paystack gives us the card type, last 4 digits and payment reference. Card numbers and PINs stay with Paystack.',
        ],
        [
          { b: 'Sellers also:' },
          " CAC certificate, owner's ID (NIN slip, passport or driver's licence), shop address and payout bank account.",
        ],
        [{ b: 'Device:' }, ' phone model, app version, IP address and crash reports, to keep the app working and spot fraud.'],
      ],
    },
    {
      title: '3. Why we use it',
      paras: [
        'To run auctions, take payment, hold money in escrow, inspect and deliver gadgets, and pay sellers.',
        'To stop fraud — for example shill bidding, stolen phones and fake accounts.',
        'To send account and order messages. Marketing messages only if you say yes, and you can stop them any time.',
      ],
    },
    {
      title: '4. Who we share it with',
      paras: [
        [{ b: 'Paystack' }, ' — to take payments, refunds and payouts.'],
        [{ b: 'Delivery riders' }, ' — your first name, phone number and address for that one delivery.'],
        [{ b: 'Identity and business checks' }, " — to confirm a seller's CAC and ID details."],
        [{ b: 'Police or regulators' }, ' — only when Nigerian law requires it, such as a stolen-device report.'],
        'Sellers never get your name, email or phone. Buyers only see a seller\'s ID, like "Verified seller CV-1042".',
      ],
    },
    {
      title: '5. How long we keep it',
      paras: [
        'Orders and payment records: 6 years, because tax law requires it.',
        'Seller documents: while the store is open, then 6 years.',
        'Everything else is deleted or anonymised within 90 days of closing your account.',
      ],
    },
    {
      title: '6. Your rights',
      paras: [
        'You can ask to see, correct, download or delete your data, object to how we use it, or withdraw consent. We reply within 30 days.',
        'Unhappy with our answer? You can complain to the Nigeria Data Protection Commission (NDPC).',
      ],
    },
    {
      title: '7. Keeping it safe',
      paras: [
        'Data is encrypted in transit and at rest. Staff need 2-step sign-in, see only what their role allows, and every admin action is logged.',
      ],
    },
    {
      title: '8. Changes',
      paras: ["If we change this policy in a way that matters, we'll tell you in the app and by email before it takes effect."],
    },
  ],
};

const Rich: React.FC<{ para: Para; navigation: any }> = ({ para, navigation }) => {
  const segs = Array.isArray(para) ? para : [para];
  return (
    <Text style={styles.legalText}>
      {segs.map((s, i) =>
        typeof s === 'string' ? (
          s
        ) : 'b' in s ? (
          <Text key={i} style={styles.legalStrong}>
            {s.b}
          </Text>
        ) : (
          <Text
            key={i}
            style={styles.inlineLink}
            onPress={() => navigation.navigate(s.to)}
            accessibilityRole="link"
          >
            {s.link}
          </Text>
        )
      )}
    </Text>
  );
};

const LegalPage: React.FC<{ doc: LegalDoc; navigation: any; footer?: React.ReactNode }> = ({ doc, navigation, footer }) => (
  <GlassScreen>
    <GlassHeader title={doc.title} onBack={() => navigation.goBack()} />
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.pill}>
        <Text style={styles.pillText}>Updated {LEGAL_UPDATED}</Text>
      </View>
      <Text style={styles.title} accessibilityRole="header">
        {doc.title}
      </Text>
      <Text style={styles.lead}>{doc.intro}</Text>

      <View style={styles.inShort}>
        <Text style={styles.inShortLabel}>In short</Text>
        {doc.inShort.map(item => (
          <View key={item} style={styles.bullet}>
            <View style={styles.bulletDot} />
            <Text style={styles.bulletText}>{item}</Text>
          </View>
        ))}
      </View>

      {doc.sections.map(section => (
        <View key={section.title} style={styles.legalSection}>
          <Text style={styles.legalHeading} accessibilityRole="header">
            {section.title}
          </Text>
          {section.paras.map((p, i) => (
            <Rich key={i} para={p} navigation={navigation} />
          ))}
        </View>
      ))}

      {footer}
    </ScrollView>
  </GlassScreen>
);

export const TermsOfUseScreen: React.FC<{ navigation: any }> = ({ navigation }) => (
  <LegalPage doc={TERMS_OF_USE} navigation={navigation} />
);

export const PrivacyPolicyScreen: React.FC<{ navigation: any }> = ({ navigation }) => (
  <LegalPage
    doc={PRIVACY_POLICY}
    navigation={navigation}
    footer={<PrimaryButton label="Manage my data" onPress={() => navigation.navigate('PrivacyData')} style={styles.footerButton} />}
  />
);

/* ================= Terms & buyer protection (short version) ================= */

/**
 * The short version. Facts follow the backend: 24h to pay (ORDER_PAYMENT_EXPIRY_HOURS),
 * 3 misses in 90 days pause bidding for 30 days, 48h to confirm or report (CONFIRM_WINDOW_HOURS),
 * disputes usually decided in 2 working days, returns within 5 days (RETURN_WINDOW_DAYS),
 * sellers are businesses approved through KYB (business name + CAC number).
 */
const SUMMARY: { key: string; title: string; body: string }[] = [
  {
    key: 'binding',
    title: 'Bids are binding',
    body: "A bid is a promise to buy. You can't cancel a bid, so check the listing first.",
  },
  {
    key: 'pay',
    title: '24 hours to pay',
    body:
      "Win it, pay within 24 hours by card, bank transfer or USSD. If time runs out, it goes to the next bidder and counts as a missed payment. 3 missed payments in 90 days pauses bidding for 30 days.",
  },
  {
    key: 'protection',
    title: 'Buyer protection',
    body:
      "Your money sits in escrow, not with the seller. We check every gadget at our hub against the listing before it's sent to you. The seller is paid once you confirm it's right.",
  },
  {
    key: 'problems',
    title: 'Problems and refunds',
    body:
      "Something wrong? Report it within 48 hours of delivery, with photos. We usually decide within 2 working days. If it's a refund, send it back to the hub within 5 days and we refund you once it arrives.",
  },
  {
    key: 'sellers',
    title: 'Who can sell',
    body:
      "Only businesses with a separate seller account, after our team checks their business and CAC details. A buyer account can't sell.",
  },
];

export const TermsSummaryScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const reduced = useReducedMotion();
  const [open, setOpen] = useState<Record<string, boolean>>({ binding: true });

  const toggle = (key: string) => {
    if (!reduced) LayoutAnimation.configureNext(LayoutAnimation.create(150, 'easeOut', 'opacity'));
    setOpen(o => ({ ...o, [key]: !o[key] }));
  };

  return (
    <GlassScreen>
      <GlassHeader title="Terms" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title} accessibilityRole="header">
          Terms & buyer protection
        </Text>
        <Text style={styles.lead}>The short version. Tap a section for details.</Text>

        <GlassCard style={styles.accordion}>
          {SUMMARY.map((s, i) => {
            const on = !!open[s.key];
            return (
              <View key={s.key} style={i < SUMMARY.length - 1 && styles.divider}>
                <Pressable
                  onPress={() => toggle(s.key)}
                  style={({ pressed }) => [styles.accordionHead, pressed && styles.rowPressed]}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: on }}
                >
                  <Text style={styles.accordionTitle}>{s.title}</Text>
                  <Ionicons name={on ? 'remove' : 'add'} size={18} color={G.faint} />
                </Pressable>
                {on ? <Text style={styles.accordionBody}>{s.body}</Text> : null}
              </View>
            );
          })}
        </GlassCard>

        <Text style={styles.summaryFooter}>
          <Text style={styles.inlineLink} onPress={() => navigation.navigate('TermsOfUse')} accessibilityRole="link">
            Full terms of use
          </Text>
          {' · '}
          <Text style={styles.inlineLink} onPress={() => navigation.navigate('PrivacyPolicy')} accessibilityRole="link">
            Privacy policy
          </Text>
          {` · Updated ${LEGAL_UPDATED}`}
        </Text>
      </ScrollView>
    </GlassScreen>
  );
};

/* ================= Privacy & your data ================= */

const SWITCHES: { key: PrivacySwitch; title: string; sub: string }[] = [
  { key: 'marketing_emails', title: 'Deals and new auctions by email', sub: 'Account and order emails always come' },
  { key: 'personalised_picks', title: 'Personalised picks', sub: 'Uses your bids and watchlist to suggest auctions' },
  { key: 'usage_stats', title: 'Help improve the app', sub: 'Anonymous usage stats and crash reports' },
];

export const PrivacyDataScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const { logout } = useAuthStore();
  const [p, setP] = useState<PrivacySettings | null>(null);
  const [failed, setFailed] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await meService.privacy();
      setP(res);
      setFailed(false);
      // This phone follows the account's choice for crash reports.
      setUsageStatsEnabled(res.usage_stats).catch(() => {});
    } catch {
      setFailed(true);
    }
  }, []);
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  /** Save straight away; put it back if the server says no. */
  const change = async (key: PrivacySwitch, value: boolean) => {
    if (!p) return;
    const before = p;
    setP({ ...p, [key]: value });
    try {
      const saved = await meService.updatePrivacy({ [key]: value });
      setP(saved);
      if (key === 'usage_stats') setUsageStatsEnabled(saved.usage_stats).catch(() => {});
    } catch (e) {
      setP(before);
      toast(errText(e, "We couldn't save that. Try again."), 'error');
    }
  };

  const requestData = async () => {
    setRequesting(true);
    try {
      const res = await meService.requestData();
      setP(cur => (cur ? { ...cur, data_request: res } : cur));
      toast(res.message);
    } catch (e) {
      toast(errText(e, "We couldn't send your request. Try again."), 'error');
    } finally {
      setRequesting(false);
    }
  };

  const deleteAccount = () =>
    Alert.alert(
      'Delete your account?',
      "We remove your name, contact details, saved cards, alerts and addresses, then sign you out. Past orders stay on record without your name. This can't be undone.",
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete my account',
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            try {
              await meService.deleteAccount();
              toast('Your account is deleted.');
              await logout();
            } catch (e) {
              Alert.alert("We can't delete your account yet", errText(e, 'Try again in a minute.'));
            } finally {
              setDeleting(false);
            }
          },
        },
      ]
    );

  if (!p) {
    return (
      <GlassScreen>
        <GlassHeader title="Privacy & your data" onBack={() => navigation.goBack()} />
        {failed ? (
          <View style={styles.content}>
            <GlassCard style={styles.card}>
              <Text style={styles.cardTitle}>We couldn't load your privacy settings</Text>
              <Text style={styles.cardText}>Check your connection, then try again.</Text>
              <SecondaryButton label="Try again" onPress={load} style={styles.cardButton} />
            </GlassCard>
          </View>
        ) : (
          <ActivityIndicator color={G.blue} style={styles.loader} />
        )}
      </GlassScreen>
    );
  }

  const open = p.data_request?.status === 'open' ? p.data_request : null;
  const dataText = open
    ? `Requested ${longDate(open.requested_at)}. We'll email a link to ${open.email} by ${longDate(open.due_at)}.`
    : p.email
    ? `Your profile, bids, orders and messages as a file. We email a link to ${p.email} within ${p.data_request_days} days.`
    : "Your profile, bids, orders and messages as a file. We need an email address to send it to, so contact support and we'll add one.";

  return (
    <GlassScreen>
      <GlassHeader title="Privacy & your data" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title} accessibilityRole="header">
          Privacy & your data
        </Text>
        <Text style={styles.lead}>Choose what we use, get a copy of your data, or close your account.</Text>

        <Text style={styles.overline}>WHAT WE USE</Text>
        <GlassCard style={styles.group}>
          {SWITCHES.map((s, i) => (
            <View key={s.key} style={[styles.toggleRow, i < SWITCHES.length - 1 && styles.divider]}>
              <View style={styles.flex}>
                <Text style={styles.rowTitle}>{s.title}</Text>
                <Text style={styles.rowSub}>{s.sub}</Text>
              </View>
              <Switch
                value={p[s.key]}
                onValueChange={v => change(s.key, v)}
                trackColor={{ false: '#EDEFF4', true: G.blue }}
                thumbColor="#FFFFFF"
                ios_backgroundColor="#EDEFF4"
                accessibilityLabel={s.title}
                accessibilityHint={s.sub}
              />
            </View>
          ))}
        </GlassCard>

        <Text style={styles.overline}>YOUR DATA</Text>
        <GlassCard style={styles.card}>
          <Text style={styles.cardTitle}>Download my data</Text>
          <Text style={styles.cardText}>{dataText}</Text>
          {p.email || open ? (
            <SecondaryButton
              label={open ? 'Requested' : requesting ? 'Sending request…' : 'Request my data'}
              onPress={requestData}
              disabled={!!open || requesting}
              style={styles.cardButton}
            />
          ) : (
            <SecondaryButton label="Contact support" onPress={() => navigation.navigate('ContactSupport', { topic: 'account' })} style={styles.cardButton} />
          )}
        </GlassCard>

        <Text style={styles.overline}>CLOSE ACCOUNT</Text>
        <GlassCard style={styles.card}>
          <Text style={[styles.cardTitle, styles.danger]}>Delete my account</Text>
          <Text style={styles.cardText}>
            You can't delete while you're winning an auction or have an order in progress.
          </Text>
          <SecondaryButton
            label={deleting ? 'Deleting…' : 'Delete account'}
            danger
            onPress={deleteAccount}
            disabled={deleting}
            style={[styles.cardButton, styles.dangerButton]}
          />
        </GlassCard>

        <Pressable
          onPress={() => navigation.navigate('PrivacyPolicy')}
          style={styles.policyLink}
          hitSlop={8}
          accessibilityRole="link"
        >
          <Text style={styles.link}>Read the privacy policy</Text>
        </Pressable>
      </ScrollView>
    </GlassScreen>
  );
};

const styles = StyleSheet.create({
  flex: { flex: 1 },
  loader: { marginVertical: 30 },
  content: { paddingHorizontal: 20, paddingTop: 4, paddingBottom: 40 },
  rowPressed: { backgroundColor: 'rgba(255,255,255,0.6)' },
  divider: { borderBottomWidth: 1, borderBottomColor: 'rgba(28,31,42,0.05)' },

  title: { color: G.ink, fontSize: 26, lineHeight: 32, letterSpacing: -0.52, fontFamily: fonts.medium },
  lead: { color: G.slate, fontSize: 16, lineHeight: 24, fontFamily: fonts.regular, marginTop: 6 },
  overline: {
    color: G.muted,
    fontSize: 13,
    letterSpacing: 0.52,
    fontFamily: fonts.medium,
    marginTop: 24,
    marginBottom: 8,
  },
  link: { color: G.blue600, fontSize: 14, fontFamily: fonts.medium },
  inlineLink: { color: G.blue600, textDecorationLine: 'underline' },

  // Long legal pages
  pill: {
    alignSelf: 'flex-start',
    height: 26,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    marginBottom: 12,
  },
  pillText: { color: G.ink, fontSize: 13, fontFamily: fonts.medium },
  inShort: {
    marginTop: 20,
    padding: 16,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    gap: 10,
    shadowColor: '#141C3C',
    shadowOpacity: 0.05,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
  },
  inShortLabel: { color: G.blue600, fontSize: 13, fontFamily: fonts.medium },
  bullet: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  bulletDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: G.blue, marginTop: 9 },
  bulletText: { flex: 1, color: G.ink, fontSize: 14, lineHeight: 21, fontFamily: fonts.regular },
  legalSection: { borderTopWidth: 1, borderTopColor: 'rgba(28,31,42,0.06)', paddingTop: 16, marginTop: 20, gap: 8 },
  legalHeading: { color: G.ink, fontSize: 16, lineHeight: 22, fontFamily: fonts.medium },
  legalText: { color: G.slate, fontSize: 14, lineHeight: 21, fontFamily: fonts.regular },
  legalStrong: { color: G.ink, fontFamily: fonts.medium },
  footerButton: { marginTop: 28, height: 52 },

  // Terms summary
  accordion: { marginTop: 20, overflow: 'hidden' },
  accordionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    minHeight: 54,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  accordionTitle: { flex: 1, color: G.ink, fontSize: 16, fontFamily: fonts.medium },
  accordionBody: {
    color: G.slate,
    fontSize: 14,
    lineHeight: 21,
    fontFamily: fonts.regular,
    paddingHorizontal: 16,
    paddingBottom: 16,
    marginTop: -4,
  },
  summaryFooter: { color: G.muted, fontSize: 13, lineHeight: 19, fontFamily: fonts.regular, textAlign: 'center', marginTop: 20 },

  // Privacy & your data
  group: { overflow: 'hidden' },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14, minHeight: 64 },
  rowTitle: { color: G.ink, fontSize: 16, fontFamily: fonts.medium },
  rowSub: { color: G.muted, fontSize: 13, fontFamily: fonts.regular, marginTop: 2, lineHeight: 18 },
  card: { padding: 16 },
  cardTitle: { color: G.ink, fontSize: 16, fontFamily: fonts.medium },
  cardText: { color: G.muted, fontSize: 13, lineHeight: 19, fontFamily: fonts.regular, marginTop: 4 },
  cardButton: { marginTop: 12 },
  danger: { color: '#D9536A' },
  dangerButton: { borderWidth: 1, borderColor: '#F5C9D1' },
  policyLink: { alignSelf: 'center', minHeight: 44, justifyContent: 'center', marginTop: 12 },
});
