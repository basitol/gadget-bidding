import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator, Linking, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  G,
  GlassScreen,
  GlassHeader,
  GlassCard,
  PrimaryButton,
  CheckList,
  FooterBar,
} from '../../components/glass';
import { fonts } from '../../constants';
import { meService, MissedPayment, StrikeSummary } from '../../services/me.service';
import { useToastStore } from '../../store/toastStore';

const SUPPORT_EMAIL = 'help@gadgetsbidding.com';
/** Failed · Outbid status pair from the design guide. */
const RED = '#D9536A';
const RED_TINT = '#FDF0F2';
const toast = (m: string) => useToastStore.getState().show(m, 'error');
const dayMonth = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
/** "Dec 26, 2026" */
const fullDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

/** Bidding is paused after too many missed payments: why, until when, and what still works. */
export const AccountPausedScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const [data, setData] = useState<(StrikeSummary & { items: MissedPayment[] }) | null>(null);

  useEffect(() => {
    meService
      .missedPayments()
      .then(setData)
      .catch(e => toast(e instanceof Error && e.message ? e.message : "Couldn't load your account"));
  }, []);

  if (!data) {
    return (
      <GlassScreen>
        <GlassHeader title="Account" onBack={() => navigation.goBack()} />
        <ActivityIndicator color={G.blue} style={styles.loader} />
      </GlassScreen>
    );
  }

  const until = data.bidding_paused_until;
  const since = Date.now() - data.lookback_days * 24 * 3_600_000;
  const recent = data.items.filter(m => new Date(m.created_at).getTime() >= since);

  const appeal = () =>
    Linking.openURL(
      `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('Appeal: bidding paused on my account')}`
    ).catch(() => {});

  return (
    <GlassScreen>
      <GlassHeader title="Account" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.hero}>
          <View style={styles.tile}>
            <Ionicons name="lock-closed-outline" size={36} color={RED} />
          </View>
          <Text style={styles.title} accessibilityRole="header">
            {until ? 'Your account is paused' : 'Bidding is back on'}
          </Text>
          <Text style={styles.sub}>
            {until ? (
              <>
                {`You missed ${data.strikes} payment deadline${data.strikes === 1 ? '' : 's'} in ${data.lookback_days} days, so bidding is paused until `}
                <Text style={styles.subStrong}>{fullDate(until)}</Text>.
              </>
            ) : (
              'Your pause has ended. Pay within the deadline on every win to keep bidding.'
            )}
          </Text>
        </View>

        <GlassCard style={styles.card}>
          <Text style={styles.cardTitle}>You can still</Text>
          <CheckList
            style={styles.cardList}
            items={['See your orders and track deliveries', 'Pay for anything already won', 'Report a problem with an order']}
          />
        </GlassCard>

        {recent.length ? (
          <GlassCard style={styles.missedCard}>
            {recent.map((m, i) => (
              <View key={m.id} style={[styles.row, i > 0 && styles.rowLine]}>
                <View style={styles.flex}>
                  <View style={styles.rowHead}>
                    <Text style={[styles.rowTitle, styles.shrink]} numberOfLines={1}>
                      {m.gadget_title}
                    </Text>
                    {m.order_number ? <Text style={styles.rowTitle}>{` · ${m.order_number}`}</Text> : null}
                  </View>
                  <Text style={styles.rowSub}>{dayMonth(m.auction_ended_at ?? m.created_at)}</Text>
                </View>
                <View style={styles.missed}>
                  <Text style={styles.missedText}>Missed</Text>
                </View>
              </View>
            ))}
          </GlassCard>
        ) : null}
      </ScrollView>
      <FooterBar>
        <PrimaryButton label="See my orders" onPress={() => navigation.navigate('Orders')} />
        <Pressable
          onPress={appeal}
          style={styles.appealButton}
          hitSlop={6}
          accessibilityRole="link"
          accessibilityLabel="Think this is a mistake? Appeal"
        >
          <Text style={styles.appeal}>
            Think this is a mistake? <Text style={styles.appealLink}>Appeal</Text>
          </Text>
        </Pressable>
      </FooterBar>
    </GlassScreen>
  );
};

const styles = StyleSheet.create({
  flex: { flex: 1 },
  loader: { marginTop: 80 },
  scroll: { paddingHorizontal: 20, paddingTop: 24, paddingBottom: 32 },
  hero: { alignItems: 'center', marginBottom: 28 },
  tile: {
    width: 96,
    height: 96,
    borderRadius: 26,
    backgroundColor: RED_TINT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { color: G.ink, fontSize: 24, fontFamily: fonts.medium, marginTop: 20, textAlign: 'center' },
  sub: {
    color: G.muted,
    fontSize: 15,
    lineHeight: 22,
    fontFamily: fonts.regular,
    marginTop: 8,
    textAlign: 'center',
    paddingHorizontal: 8,
  },
  subStrong: { color: G.ink, fontFamily: fonts.medium },
  card: { padding: 16 },
  cardTitle: { color: G.ink, fontSize: 15, fontFamily: fonts.medium },
  cardList: { marginTop: 10 },
  missedCard: { marginTop: 16 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
  rowLine: { borderTopWidth: 1, borderTopColor: G.line },
  rowHead: { flexDirection: 'row', alignItems: 'center' },
  shrink: { flexShrink: 1 },
  rowTitle: { color: G.ink, fontSize: 15, fontFamily: fonts.medium, fontVariant: ['tabular-nums'] },
  rowSub: { color: G.muted, fontSize: 13, fontFamily: fonts.regular, marginTop: 2, fontVariant: ['tabular-nums'] },
  missed: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, backgroundColor: RED_TINT },
  missedText: { color: RED, fontSize: 13, fontFamily: fonts.medium },
  appealButton: { minHeight: 44, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  appeal: { color: G.slate, fontSize: 14, fontFamily: fonts.regular, textAlign: 'center' },
  appealLink: { color: G.blue600, fontFamily: fonts.medium },
});
