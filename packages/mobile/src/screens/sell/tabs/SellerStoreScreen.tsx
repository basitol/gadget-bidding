import React, { useCallback, useRef, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Alert, RefreshControl } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { G, GlassScreen, GlassHeader, GlassCard, SectionLabel, MenuRow } from '../../../components/glass';
import { fonts } from '../../../constants';
import { useAuthStore } from '../../../store';
import { useReloadOnReconnect } from '../../../store/networkStore';
import { useToastStore } from '../../../store/toastStore';
import { sellerStoreService, SellerStore, monthYear } from '../../../services/sellerStore.service';
import { TINT } from '../onboarding/kit';

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Status chip: tint + dark text, always a word (design guide › Chips). */
const StoreChip: React.FC<{ label: string; tone: { bg: string; text: string } }> = ({ label, tone }) => (
  <View style={[styles.chip, { backgroundColor: tone.bg }]}>
    <Text style={[styles.chipText, { color: tone.text }]}>{label}</Text>
  </View>
);

const Stat: React.FC<{ value: string; label: string }> = ({ value, label }) => (
  <View style={styles.stat} accessible accessibilityLabel={`${value} ${label}`}>
    <Text style={styles.statValue}>{value}</Text>
    <Text style={styles.statLabel}>{label}</Text>
  </View>
);

/** Seller tab: the store card, the store's settings, and the account. */
export const SellerStoreScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const { logout } = useAuthStore();
  const [s, setS] = useState<SellerStore | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const loaded = useRef(false);

  const load = useCallback(async () => {
    try {
      setS(await sellerStoreService.overview());
      loaded.current = true;
    } catch (e) {
      // Once loaded, keep what's shown; the first time, say so (rows fall back to plain subtitles).
      if (!loaded.current) useToastStore.getState().show(e instanceof Error ? e.message : "Couldn't load your store", 'error');
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );
  useReloadOnReconnect(load);

  const confirmLogout = () =>
    Alert.alert('Log out?', "You'll need your business email and password to log back in.", [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log out', style: 'destructive', onPress: () => logout() },
    ]);

  const meta = s ? [s.shop_line, `Since ${monthYear(s.since)}`].filter(Boolean).join(' · ') : null;
  const docs = s?.documents;
  const docsSub = docs
    ? docs.needs_update
      ? `${docs.needs_update} ${docs.needs_update === 1 ? 'needs' : 'need'} updating`
      : docs.missing
        ? `${docs.missing} to upload`
        : docs.in_review
          ? `${docs.in_review} with our team`
          : 'All accepted'
    : null;

  return (
    <GlassScreen>
      <GlassHeader title="Store" />
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor={G.blue}
            onRefresh={async () => {
              setRefreshing(true);
              await load();
              setRefreshing(false);
            }}
          />
        }
      >
        <GlassCard style={styles.card}>
          <LinearGradient
            colors={['rgba(79,123,255,0.30)', 'rgba(155,135,245,0.34)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.banner}
          />
          <View style={styles.body}>
            <View style={styles.tile}>
              <Text style={styles.tileText}>{s?.initials ?? ''}</Text>
            </View>
            <Text style={styles.name} accessibilityRole="header" numberOfLines={2}>
              {s ? s.business_name || 'Your store' : ' '}
            </Text>
            {meta ? <Text style={styles.meta}>{meta}</Text> : null}
            {s && (s.badges.verified_business || s.badges.cac_registered || s.badges.top_seller) ? (
              <View style={styles.chips}>
                {s.badges.verified_business ? <StoreChip label="Verified business" tone={TINT.blue} /> : null}
                {s.badges.cac_registered ? <StoreChip label="CAC registered" tone={TINT.violet} /> : null}
                {s.badges.top_seller ? <StoreChip label="Top seller" tone={TINT.green} /> : null}
              </View>
            ) : null}
            <View style={styles.line} />
            <View style={styles.stats}>
              <Stat value={s ? s.stats.sales.toLocaleString('en-NG') : '–'} label="Sales" />
              <Stat value={s?.stats.rating != null ? s.stats.rating.toFixed(1) : '–'} label="Rating" />
              <Stat
                value={s?.stats.passed_checks_percent != null ? `${s.stats.passed_checks_percent}%` : '–'}
                label="Passed checks"
              />
            </View>
          </View>
        </GlassCard>

        <SectionLabel plain>Store</SectionLabel>
        <GlassCard style={styles.group}>
          <MenuRow
            icon="storefront-outline"
            title="Store details"
            subtitle="Shop, phone, about, hours"
            onPress={() => navigation.navigate('StoreDetails')}
          />
          <MenuRow
            icon="star-outline"
            title="Reviews"
            subtitle={
              s
                ? s.stats.rating_count && s.stats.rating != null
                  ? `${s.stats.rating.toFixed(1)} from ${plural(s.stats.rating_count, 'buyer')}`
                  : 'No reviews yet'
                : null
            }
            onPress={() => navigation.navigate('StoreReviews')}
          />
          <MenuRow
            icon="card-outline"
            title="Payout account"
            subtitle={
              s
                ? s.payout_account
                  ? `${s.payout_account.bank_name} ending ${s.payout_account.account_number_last4}`
                  : 'Add your payout account'
                : null
            }
            onPress={() => navigation.navigate('PayoutAccount')}
          />
          <MenuRow
            icon="people-outline"
            title="Store staff"
            subtitle={
              s
                ? s.staff_count
                  ? `${s.staff_count} ${s.staff_count === 1 ? 'person can' : 'people can'} drop off and collect`
                  : 'Add who can drop off and collect'
                : null
            }
            onPress={() => navigation.navigate('StoreStaff')}
          />
          <MenuRow
            icon="stats-chart-outline"
            title="Sales insights"
            subtitle="Views, bids and earnings"
            onPress={() => navigation.navigate('SalesInsights')}
          />
          <MenuRow
            icon="document-text-outline"
            title="Business documents"
            subtitle={docsSub}
            onPress={() => navigation.navigate('BusinessDocuments')}
            last
          />
        </GlassCard>

        <SectionLabel plain>Account</SectionLabel>
        <GlassCard style={styles.group}>
          <MenuRow
            icon="notifications-outline"
            title="Notifications"
            subtitle="Sales, bids, payouts"
            onPress={() => navigation.navigate('SellerNotificationSettings')}
          />
          <MenuRow
            icon="help-circle-outline"
            title="Help for sellers"
            subtitle="Fees, hub drop-off, disputes"
            onPress={() => navigation.navigate('SellerHelp')}
          />
          <MenuRow
            icon="document-outline"
            title="Seller agreement & privacy"
            onPress={() => navigation.navigate('SellerAgreement')}
          />
          <MenuRow
            icon="close-circle-outline"
            title="Close my store"
            subtitle="Stop selling on Gadgets Bidding"
            onPress={() => navigation.navigate('CloseStore')}
          />
          <MenuRow icon="log-out-outline" title="Log out" danger onPress={confirmLogout} last />
        </GlassCard>

        <Text style={styles.footnote}>
          Seller accounts can't bid or buy. To shop, sign up for a separate buyer account.
        </Text>
      </ScrollView>
    </GlassScreen>
  );
};

const styles = StyleSheet.create({
  // Room for the floating tab bar.
  content: { paddingHorizontal: 20, paddingTop: 4, paddingBottom: 120 },
  card: { overflow: 'hidden', marginBottom: 24 },
  banner: { height: 84 },
  body: { paddingHorizontal: 16, paddingBottom: 16 },
  tile: {
    width: 64,
    height: 64,
    borderRadius: 16,
    marginTop: -32,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(28,31,42,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#141C3C',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  tileText: { color: G.blue, fontSize: 22, fontFamily: fonts.medium },
  name: { color: G.ink, fontSize: 19, letterSpacing: -0.2, fontFamily: fonts.medium, marginTop: 12 },
  meta: { color: G.muted, fontSize: 13, lineHeight: 18, fontFamily: fonts.regular, marginTop: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  chip: { height: 30, paddingHorizontal: 10, borderRadius: 9, justifyContent: 'center' },
  chipText: { fontSize: 13, fontFamily: fonts.medium },
  line: { height: 1, backgroundColor: 'rgba(28,31,42,0.06)', marginTop: 16 },
  stats: { flexDirection: 'row', marginTop: 12 },
  stat: { flex: 1 },
  statValue: { color: G.ink, fontSize: 19, fontFamily: fonts.medium, fontVariant: ['tabular-nums'] },
  statLabel: { color: G.muted, fontSize: 13, fontFamily: fonts.regular, marginTop: 2 },
  group: { marginBottom: 24, overflow: 'hidden' },
  footnote: { color: G.muted, fontSize: 13, lineHeight: 18, fontFamily: fonts.regular, textAlign: 'center', paddingHorizontal: 12 },
});
