import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Linking, ScrollView, TextInput, Dimensions } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { G, GlassScreen, GlassHeader, GlassCard, PrimaryButton, TextButton, CheckList, FooterBar, GadgetImage, SectionLabel } from '../glass';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fonts } from '../../constants';
import { useNetworkStore } from '../../store/networkStore';
import { useAuthStore } from '../../store/authStore';
import { navigationRef } from '../../navigation/navigationRef';
import { formatCurrency } from '../../utils';
import api from '../../services/api';

const SUPPORT_EMAIL = 'help@gadgetsbidding.com';

/** Icon on a soft tile, title and one line under it. */
const StateHero: React.FC<{ icon: React.ReactNode; tint: string; title: string; sub: React.ReactNode }> = ({
  icon,
  tint,
  title,
  sub,
}) => (
  <View style={styles.hero}>
    <View style={[styles.tile, { backgroundColor: tint }]}>{icon}</View>
    <Text style={styles.title} accessibilityRole="header">
      {title}
    </Text>
    <Text style={styles.sub}>{sub}</Text>
  </View>
);

/* ================= Offline ================= */

/** Height the buyer tab bar takes at the bottom (GlassTabBar: 64 bar + safe-area padding). */
const tabBarSpace = (bottomInset: number) => 64 + Math.max(bottomInset, 12);

/**
 * Covers the app while we can't reach the server; checks again on its own every few seconds.
 * On the buyer tabs it's drawn under the tab bar (`inTabs`) so people can still switch tabs;
 * the full-screen copy steps aside then.
 */
export const OfflineOverlay: React.FC<{ inTabs?: boolean }> = ({ inTabs = false }) => {
  const offline = useNetworkStore(s => s.offline);
  const checking = useNetworkStore(s => s.checking);
  const check = useNetworkStore(s => s.check);
  const tabsShowOffline = useNetworkStore(s => s.tabsShowOffline);
  const insets = useSafeAreaInsets();
  if (!offline) return null;
  if (!inTabs && tabsShowOffline) return null;
  const retry = <PrimaryButton label={checking ? 'Checking…' : 'Try again'} onPress={check} disabled={checking} />;
  return (
    <View style={StyleSheet.absoluteFill} accessibilityViewIsModal={!inTabs}>
      <GlassScreen edges={inTabs ? ['top'] : ['top', 'bottom']}>
        <View style={styles.center}>
          <StateHero
            icon={<MaterialCommunityIcons name="wifi-off" size={40} color={G.slate} />}
            tint="#FFFFFF"
            title="You're offline"
            sub="Check your Wi-Fi or mobile data. Auctions keep running while you're away."
          />
        </View>
        <View style={styles.pad}>
          <GlassCard style={styles.card}>
            <Text style={styles.cardTitle}>Good to know</Text>
            <CheckList
              style={styles.cardList}
              items={[
                "Bids and payments only go through when you're back online",
                'Auto-bids keep working — they run on our side',
                "We'll show any outbids as soon as you reconnect",
              ]}
            />
          </GlassCard>
        </View>
        {inTabs ? (
          <View style={[styles.pad, { paddingBottom: tabBarSpace(insets.bottom) + 16 }]}>{retry}</View>
        ) : (
          <FooterBar>{retry}</FooterBar>
        )}
      </GlassScreen>
    </View>
  );
};

/* ================= Something went wrong ================= */

/** "GB-7F3A": short code from the crash report so support can find it. */
export const errorCodeFrom = (eventId?: string | null) =>
  `GB-${(eventId || Math.random().toString(16).slice(2)).replace(/-/g, '').slice(0, 4).toUpperCase()}`;

/**
 * "Contact support" on the error screen: the in-app support chat when signed in (with the error
 * code already typed), else an email. The error screen may have replaced the whole app, so we
 * clear it first and wait for navigation to come back before opening the chat.
 */
const contactSupport = (code: string, onRetry: () => void) => {
  const email = () =>
    Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(`App error ${code}`)}`).catch(() => {});
  if (!useAuthStore.getState().isAuthenticated) return email();
  onRetry();
  let tries = 0;
  const open = () => {
    if (navigationRef.isReady()) {
      navigationRef.navigate('SupportChat', { draft: `App error ${code}: ` });
    } else if (++tries < 20) {
      setTimeout(open, 100);
    } else {
      email();
    }
  };
  setTimeout(open, 50);
};

export const ErrorState: React.FC<{ code: string; onRetry: () => void; onBack?: () => void }> = ({ code, onRetry, onBack }) => (
  <GlassScreen edges={['top', 'bottom']}>
    <GlassHeader title="Error" onBack={onBack} />
    <View style={styles.center}>
      <StateHero
        icon={<Ionicons name="warning-outline" size={40} color="#D9536A" />}
        tint="#FDF0F2"
        title="Something went wrong"
        sub="That's on us, not you. Your bids and money are safe — nothing was lost."
      />
      <View style={styles.code}>
        <Text style={styles.codeText} selectable>
          Error code {code} · share this with support
        </Text>
      </View>
    </View>
    <FooterBar>
      <PrimaryButton label="Try again" onPress={onRetry} />
      <TextButton label="Contact support" onPress={() => contactSupport(code, onRetry)} />
    </FooterBar>
  </GlassScreen>
);

/* ================= Auction not found ================= */

export const AuctionNotFound: React.FC<{ navigation: any }> = ({ navigation }) => {
  const [query, setQuery] = useState('');
  const [picks, setPicks] = useState<any[]>([]);

  useEffect(() => {
    api
      .get('/auctions', { params: { status: 'active', sort_by: 'bid_count', page: 1, limit: 2 } })
      .then(r => setPicks(r.data?.data ?? []))
      .catch(() => {});
  }, []);

  const search = () =>
    navigation.navigate('MainTabs', { screen: 'Explore', params: { query: query.trim() || undefined, focusSearch: !query.trim() } });

  return (
    <GlassScreen>
      <GlassHeader title="Not found" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <StateHero
          icon={<MaterialCommunityIcons name="magnify-close" size={40} color={G.blue600} />}
          tint="#FFFFFF"
          title="We can't find that auction"
          sub="It may have ended, or the seller took it down. The link could also be wrong."
        />
        <View style={styles.search}>
          <Ionicons name="search" size={18} color={G.muted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={search}
            returnKeyType="search"
            placeholder="Search for something similar"
            placeholderTextColor={G.faint}
            style={styles.searchInput}
            accessibilityLabel="Search for something similar"
          />
        </View>
        {picks.length ? (
          <>
            <View style={styles.section}>
              <SectionLabel>You might like</SectionLabel>
            </View>
            <View style={styles.picks}>
              {picks.map(a => (
                <Pressable
                  key={a.id}
                  onPress={() => navigation.replace('AuctionDetail', { auctionId: a.id })}
                  style={({ pressed }) => [styles.pick, pressed && styles.pressed]}
                  accessibilityRole="button"
                  accessibilityLabel={a.gadget?.title}
                >
                  <GadgetImage uri={a.gadget?.images?.[0]} size={72} style={styles.pickImage} />
                  <Text style={styles.pickTitle} numberOfLines={1}>
                    {a.gadget?.title}
                  </Text>
                  <Text style={styles.pickPrice}>{formatCurrency(a.current_price)}</Text>
                </Pressable>
              ))}
            </View>
          </>
        ) : null}
      </ScrollView>
      <FooterBar>
        <PrimaryButton label="Explore auctions" onPress={() => navigation.navigate('MainTabs', { screen: 'Explore' })} />
      </FooterBar>
    </GlassScreen>
  );
};

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', paddingHorizontal: 20 },
  pad: { paddingHorizontal: 20, paddingBottom: 16 },
  scroll: { paddingHorizontal: 20, paddingBottom: 32, paddingTop: 40 },
  pressed: { opacity: 0.75 },
  hero: { alignItems: 'center' },
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
  title: { color: G.ink, fontSize: 24, fontFamily: fonts.medium, marginTop: 20, textAlign: 'center' },
  sub: { color: G.muted, fontSize: 15, lineHeight: 22, fontFamily: fonts.regular, marginTop: 8, textAlign: 'center', paddingHorizontal: 8 },
  card: { padding: 16 },
  cardTitle: { color: G.ink, fontSize: 15, fontFamily: fonts.medium },
  cardList: { marginTop: 10 },
  code: { alignSelf: 'center', marginTop: 20, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.7)' },
  codeText: { color: G.slate, fontSize: 13, fontFamily: fonts.regular },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    height: 52,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    marginTop: 28,
  },
  searchInput: { flex: 1, fontSize: 15, fontFamily: fonts.regular, color: G.ink },
  section: { marginTop: 32 },
  picks: { flexDirection: 'row', gap: 12 },
  pick: {
    // Two across, even when only one live auction comes back.
    width: (Dimensions.get('window').width - 40 - 12) / 2,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.56)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.75)',
    overflow: 'hidden',
    paddingBottom: 12,
  },
  // Photo sits on its own inset tile inside the card.
  pickImage: { height: 88, margin: 12, marginBottom: 0, borderRadius: 12 },
  pickTitle: { color: G.ink, fontSize: 13, fontFamily: fonts.medium, marginTop: 10, paddingHorizontal: 12 },
  pickPrice: { color: G.ink, fontSize: 15, fontFamily: fonts.medium, marginTop: 4, paddingHorizontal: 12, fontVariant: ['tabular-nums'] },
});
