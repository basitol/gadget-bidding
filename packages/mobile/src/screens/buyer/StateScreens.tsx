import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  G,
  GlassScreen,
  GlassHeader,
  GlassCard,
  GadgetImage,
  PrimaryButton,
  CheckList,
  FooterBar,
  SectionLabel,
} from '../../components/glass';
import { fonts } from '../../constants';
import { meService, MissedPayment, StrikeSummary } from '../../services/me.service';
import { useToastStore } from '../../store/toastStore';
import { formatCurrency } from '../../utils';

const SUPPORT_EMAIL = 'support@gadgetbid.ng';
const toast = (m: string) => useToastStore.getState().show(m, 'error');
const dayMonth = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

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
            <Ionicons name="pause" size={36} color={G.orangeInk} />
          </View>
          <Text style={styles.title} accessibilityRole="header">
            {until ? 'Your account is paused' : 'Bidding is back on'}
          </Text>
          <Text style={styles.sub}>
            {until
              ? `You missed ${data.strikes} payment deadline${data.strikes === 1 ? '' : 's'} in ${data.lookback_days} days, so bidding is paused until ${dayMonth(until)}.`
              : 'Your pause has ended. Pay within the deadline on every win to keep bidding.'}
          </Text>
        </View>

        <GlassCard style={styles.card}>
          <Text style={styles.cardTitle}>You can still</Text>
          <CheckList
            style={styles.cardList}
            items={[
              'Browse and watch auctions',
              "Pay for and track orders you've already won",
              'Sell your own gadgets',
            ]}
          />
        </GlassCard>

        {recent.length ? (
          <>
            <View style={styles.section}>
              <SectionLabel>{`Missed in the last ${data.lookback_days} days`}</SectionLabel>
            </View>
            <GlassCard>
              {recent.map((m, i) => (
                <View key={m.id} style={[styles.row, i > 0 && styles.rowLine]}>
                  <GadgetImage uri={m.gadget_image} size={44} style={styles.thumb} />
                  <View style={styles.flex}>
                    <Text style={styles.rowTitle} numberOfLines={1}>
                      {m.gadget_title}
                    </Text>
                    <Text style={styles.rowSub}>
                      {formatCurrency(m.winning_bid)} · {dayMonth(m.auction_ended_at ?? m.created_at)}
                    </Text>
                  </View>
                  <View style={styles.missed}>
                    <Text style={styles.missedText}>Missed</Text>
                  </View>
                </View>
              ))}
            </GlassCard>
          </>
        ) : null}

        <Text style={styles.appeal}>
          Think this is a mistake?{' '}
          <Text style={styles.appealLink} onPress={appeal} accessibilityRole="link">
            Appeal
          </Text>
        </Text>
      </ScrollView>
      <FooterBar>
        <PrimaryButton label="See my orders" onPress={() => navigation.navigate('Orders')} />
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
    backgroundColor: '#FFF4EA',
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
  card: { padding: 16 },
  cardTitle: { color: G.ink, fontSize: 15, fontFamily: fonts.medium },
  cardList: { marginTop: 10 },
  section: { marginTop: 28 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 },
  rowLine: { borderTopWidth: 1, borderTopColor: G.line },
  thumb: { width: 44, height: 44, borderRadius: 10 },
  rowTitle: { color: G.ink, fontSize: 15, fontFamily: fonts.medium },
  rowSub: { color: G.muted, fontSize: 13, fontFamily: fonts.regular, marginTop: 2, fontVariant: ['tabular-nums'] },
  missed: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, backgroundColor: G.redTint },
  missedText: { color: G.red, fontSize: 12, fontFamily: fonts.medium },
  appeal: { color: G.muted, fontSize: 14, fontFamily: fonts.regular, textAlign: 'center', marginTop: 24 },
  appealLink: { color: G.blue600, fontFamily: fonts.medium },
});
