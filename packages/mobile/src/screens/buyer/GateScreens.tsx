import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  Image,
  ScrollView,
  StyleSheet,
  Linking,
  Platform,
  AppState,
  BackHandler,
  Pressable,
  ImageSourcePropType,
} from 'react-native';
import {
  G,
  GlassScreen,
  GlassHeader,
  GlassCard,
  PrimaryButton,
  SecondaryButton,
  CheckList,
  FooterBar,
} from '../../components/glass';
import { fonts } from '../../constants';
import { useAuthStore } from '../../store/authStore';
import { useToastStore } from '../../store/toastStore';
import { AppConfig, INSTALLED_VERSION, Maintenance, useAppGateStore } from '../../store/appGateStore';
import { isSellerRole } from '../../utils/roles';

/**
 * Full-screen states that cover the whole app:
 * - "Time to update" when this build is below the minimum version (every interface, signed in or not);
 * - "We're doing some maintenance" while bidding is paused (the buyer app).
 */

const X_HANDLE = 'gadgetsbidding';
const X_URL = `https://x.com/${X_HANDLE}`;
/** Used when no store link is set for this platform yet. */
const WEBSITE_URL = 'https://gadgetsbidding.com';

/* ---------------- Lagos time (UTC+1, no daylight saving) ---------------- */

const LAGOS_OFFSET_MS = 3_600_000;
const DAY_MS = 86_400_000;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const lagosDayIndex = (ms: number) => Math.floor((ms + LAGOS_OFFSET_MS) / DAY_MS);

/** "1:00 am" */
const lagosClock = (iso: string) => {
  const d = new Date(new Date(iso).getTime() + LAGOS_OFFSET_MS);
  const h = d.getUTCHours();
  return `${h % 12 || 12}:${String(d.getUTCMinutes()).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
};

/** 0 = today in Lagos, 1 = tomorrow, -1 = yesterday. */
const lagosDaysFromToday = (iso: string, now = Date.now()) => lagosDayIndex(new Date(iso).getTime()) - lagosDayIndex(now);

const lagosDate = (iso: string) => {
  const d = new Date(new Date(iso).getTime() + LAGOS_OFFSET_MS);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
};

/** "1:00 am", "Yesterday · 11:00 pm", "Nov 24 · 6:00 pm". */
const startedLabel = (iso: string) => {
  const days = lagosDaysFromToday(iso);
  if (days === 0) return lagosClock(iso);
  if (days === -1) return `Yesterday · ${lagosClock(iso)}`;
  return `${lagosDate(iso)} · ${lagosClock(iso)}`;
};

/** "about 3:00 am", "about 3:00 am tomorrow", "about 3:00 am on Nov 29". */
const backByPhrase = (iso: string) => {
  const days = lagosDaysFromToday(iso);
  if (days === 0) return `about ${lagosClock(iso)}`;
  if (days === 1) return `about ${lagosClock(iso)} tomorrow`;
  return `about ${lagosClock(iso)} on ${lagosDate(iso)}`;
};

/** "2.4.0" → "2.4"; "2.4.1" stays. */
const shortVersion = (v: string) => v.replace(/^(\d+\.\d+)\.0$/, '$1');

/* ---------------- Shared hero ---------------- */

const Hero: React.FC<{ icon: ImageSourcePropType; tint: string; title: string; sub: string }> = ({ icon, tint, title, sub }) => (
  <View style={styles.hero}>
    <View style={[styles.tile, { backgroundColor: tint }]}>
      <Image source={icon} style={styles.tileIcon} accessibilityIgnoresInvertColors />
    </View>
    <Text style={styles.title} accessibilityRole="header">
      {title}
    </Text>
    <Text style={styles.sub}>{sub}</Text>
  </View>
);

/* ================= Time to update ================= */

export const UpdateRequiredScreen: React.FC<{ config: AppConfig; installed?: string }> = ({
  config,
  installed = INSTALLED_VERSION,
}) => {
  const storeUrl = (Platform.OS === 'ios' ? config.store_urls.ios : config.store_urls.android) || WEBSITE_URL;
  const lines = config.whats_new ?? [];

  const update = () =>
    Linking.openURL(storeUrl).catch(() =>
      useToastStore.getState().show(`We couldn't open the ${Platform.OS === 'ios' ? 'App Store' : 'Play Store'}. Search for Gadgets Bidding there.`, 'error')
    );

  return (
    <GlassScreen>
      <GlassHeader title="Update" />
      <ScrollView contentContainerStyle={styles.scroll}>
        <Hero
          icon={require('../../../assets/icons/autobid.png')}
          tint="rgba(255,255,255,0.72)"
          title="Time to update"
          sub="This version of Gadgets Bidding is too old to bid safely. Updating takes about a minute — your bids and watchlist stay put."
        />
        {lines.length ? (
          <GlassCard style={styles.card}>
            <Text style={styles.cardTitle}>What's new in {shortVersion(config.latest_version)}</Text>
            <CheckList style={styles.cardList} items={lines} />
          </GlassCard>
        ) : null}
      </ScrollView>
      <FooterBar>
        <PrimaryButton label="Update now" onPress={update} />
        <Text style={styles.footnote}>
          Version {installed} · minimum is {config.min_version}
        </Text>
      </FooterBar>
    </GlassScreen>
  );
};

/* ================= Maintenance ================= */

export const MaintenanceScreen: React.FC<{
  maintenance: Maintenance;
  checking: boolean;
  onTryAgain: () => void;
}> = ({ maintenance, checking, onTryAgain }) => {
  const { started_at, back_by, message } = maintenance;
  const overdue = !!back_by && new Date(back_by).getTime() <= Date.now();
  const lead = !back_by
    ? 'Bidding is paused for now.'
    : overdue
      ? "Bidding is paused. It's taking a little longer than we planned."
      : `Bidding is paused until ${backByPhrase(back_by)}.`;

  const rows: [string, string][] = [];
  if (started_at) rows.push(['Started', startedLabel(started_at)]);
  rows.push([
    'Back by',
    back_by && !overdue
      ? (() => {
          const phrase = backByPhrase(back_by);
          return phrase.charAt(0).toUpperCase() + phrase.slice(1);
        })()
      : 'Soon',
  ]);
  rows.push(['Auctions', 'Paused · time added back']);

  return (
    <GlassScreen>
      <GlassHeader title="Maintenance" />
      <ScrollView contentContainerStyle={styles.scroll}>
        <Hero
          icon={require('../../../assets/icons/bell.png')}
          tint="#FFF6EE"
          title="We're doing some maintenance"
          sub={`${lead} Every auction that was running gets its lost time added back, so nobody misses out.`}
        />
        <GlassCard>
          {rows.map(([k, v], i) => (
            <View key={k} style={[styles.row, i > 0 && styles.rowLine]}>
              <Text style={styles.rowLabel}>{k}</Text>
              <Text style={styles.rowValue}>{v}</Text>
            </View>
          ))}
        </GlassCard>
        {message ? (
          <View style={[styles.note, styles.noteInfo]}>
            <Text style={styles.noteInfoText}>{message}</Text>
          </View>
        ) : null}
        <View style={[styles.note, styles.noteGreen]}>
          <Text style={styles.noteGreenText}>
            Your money in escrow is safe. Payments, payouts and deliveries carry on as normal.
          </Text>
        </View>
      </ScrollView>
      <FooterBar>
        <SecondaryButton label={checking ? 'Checking…' : 'Try again'} onPress={onTryAgain} disabled={checking} />
        <Pressable
          onPress={() => Linking.openURL(X_URL).catch(() => {})}
          style={styles.link}
          hitSlop={6}
          accessibilityRole="link"
          accessibilityLabel={`Updates on X: @${X_HANDLE}`}
        >
          <Text style={styles.linkText}>Updates on X: @{X_HANDLE}</Text>
        </Pressable>
      </FooterBar>
    </GlassScreen>
  );
};

/* ================= Gate at the app root ================= */

/** While open, check again this often (sooner while the maintenance screen is up). */
const POLL_MS = 120_000;
const POLL_MAINTENANCE_MS = 30_000;

/**
 * Mounted once in App.tsx over the navigator. Checks /app-config at launch, whenever the app
 * comes back to the foreground, and on a timer; bid errors flip the gates too (services/api.ts).
 */
export const AppGates: React.FC = () => {
  const config = useAppGateStore(s => s.config);
  const updateRequired = useAppGateStore(s => s.updateRequired);
  const maintenance = useAppGateStore(s => s.maintenance);
  const refresh = useAppGateStore(s => s.refresh);
  const { isAuthenticated, interfaceType, user } = useAuthStore();

  const resolvedInterface = interfaceType ?? (user && isSellerRole(user.role) ? 'seller' : 'buyer');
  const showUpdate = updateRequired && !!config;
  const showMaintenance = !showUpdate && !!maintenance && isAuthenticated && resolvedInterface === 'buyer';
  const gated = showUpdate || showMaintenance;

  // Launch + every return to the foreground.
  useEffect(() => {
    refresh();
    const sub = AppState.addEventListener('change', state => {
      if (state === 'active') refresh();
    });
    return () => sub.remove();
  }, [refresh]);

  // Now and then while open, so maintenance starting or ending shows up without a restart.
  useEffect(() => {
    const t = setInterval(() => {
      if (AppState.currentState === 'active') refresh();
    }, maintenance ? POLL_MAINTENANCE_MS : POLL_MS);
    return () => clearInterval(t);
  }, [maintenance, refresh]);

  // Android back button can't reach the screens underneath.
  useEffect(() => {
    if (!gated) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => sub.remove();
  }, [gated]);

  const [retrying, setRetrying] = useState(false);
  const tryAgain = useCallback(async () => {
    setRetrying(true);
    const ok = await refresh({ fresh: true });
    setRetrying(false);
    const stillOn = !!useAppGateStore.getState().maintenance;
    if (!ok) useToastStore.getState().show("We couldn't check just now. Try again in a moment.", 'error');
    else if (stillOn) useToastStore.getState().show("Still paused. We'll keep checking and open bidding as soon as it's back.", 'info');
    else useToastStore.getState().show('Bidding is open again.', 'success');
  }, [refresh]);

  if (showUpdate && config) {
    return (
      <View style={StyleSheet.absoluteFill} accessibilityViewIsModal>
        <UpdateRequiredScreen config={config} />
      </View>
    );
  }
  if (showMaintenance && maintenance) {
    return (
      <View style={StyleSheet.absoluteFill} accessibilityViewIsModal>
        <MaintenanceScreen maintenance={maintenance} checking={retrying} onTryAgain={tryAgain} />
      </View>
    );
  }
  return null;
};

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: 20, paddingTop: 64, paddingBottom: 32 },
  hero: { alignItems: 'center', marginBottom: 28 },
  tile: {
    width: 96,
    height: 96,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#141C3C',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
  },
  tileIcon: { width: 64, height: 64, resizeMode: 'contain' },
  title: { color: G.ink, fontSize: 24, fontFamily: fonts.medium, marginTop: 20, textAlign: 'center', letterSpacing: -0.4 },
  sub: {
    color: G.muted,
    fontSize: 15,
    lineHeight: 22,
    fontFamily: fonts.regular,
    marginTop: 8,
    textAlign: 'center',
    paddingHorizontal: 8,
  },
  card: { padding: 16 },
  cardTitle: { color: G.ink, fontSize: 15, fontFamily: fonts.medium },
  cardList: { marginTop: 10 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingHorizontal: 16, minHeight: 52 },
  rowLine: { borderTopWidth: 1, borderTopColor: G.line },
  rowLabel: { color: G.muted, fontSize: 15, fontFamily: fonts.regular },
  rowValue: { flexShrink: 1, color: G.ink, fontSize: 15, fontFamily: fonts.medium, textAlign: 'right', fontVariant: ['tabular-nums'] },
  note: { padding: 16, borderRadius: 18, marginTop: 16 },
  noteGreen: { backgroundColor: '#EEF9F2' },
  noteGreenText: { color: G.green, fontSize: 15, lineHeight: 22, fontFamily: fonts.regular },
  noteInfo: { backgroundColor: '#F1F5FF' },
  noteInfoText: { color: G.blue600, fontSize: 15, lineHeight: 22, fontFamily: fonts.regular },
  footnote: { color: G.muted, fontSize: 13, fontFamily: fonts.regular, textAlign: 'center', marginTop: 12, fontVariant: ['tabular-nums'] },
  link: { minHeight: 44, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  linkText: { color: G.blue600, fontSize: 15, fontFamily: fonts.medium },
});
