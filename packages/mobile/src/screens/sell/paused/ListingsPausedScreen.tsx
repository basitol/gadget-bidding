import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { G, GlassScreen, GlassHeader, GlassCard, FooterBar, PrimaryButton, TextButton } from '../../../components/glass';
import { fonts } from '../../../constants';
import { listingPauseService, type ListingPause } from '../../../services/listingPause.service';
import { TINT } from '../onboarding/kit';
import { CaseLoading, Row, dayLabel, toast, errText, cs } from '../case/shared';

/** "iPhone 15 Pro · 256 GB" → "iPhone 15 Pro": the storage doesn't help here. */
const shortTitle = (t: string) => t.replace(/\s*·\s*\d+\s?(GB|TB)$/i, '');

/** "Asked 2 hours ago" / "Asked today" — when the seller last asked for a review. */
const askedLabel = (iso: string) => {
  const mins = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (mins < 60) return `You asked ${mins} min ago. Our team will be in touch.`;
  const h = Math.round(mins / 60);
  if (h < 24) return `You asked ${h} hour${h === 1 ? '' : 's'} ago. Our team will be in touch.`;
  return `You asked ${dayLabel(iso).toLowerCase() === 'yesterday' ? 'yesterday' : `on ${dayLabel(iso)}`}. Our team will be in touch.`;
};

type Line = { text: string; ok: boolean };

/** What carries on while new listings are paused (it differs when our team paused them). */
const stillHappens = (p: ListingPause): Line[] =>
  p.code === 'PAUSED_BY_TEAM'
    ? [
        { text: 'Items you’ve already sold must still go to the hub', ok: true },
        { text: 'Your live auctions are paused, and keep their time', ok: false },
        { text: 'Payouts are held until our team restores your listings', ok: false },
      ]
    : [
        { text: 'Items you’ve already sold must still go to the hub', ok: true },
        { text: 'Payouts for good orders keep coming', ok: true },
        { text: 'Your live auctions run to the end', ok: true },
      ];

/**
 * New listings are paused (seller app › Account): too many items failed the hub check or were
 * refunded in 90 days, or our team paused listings. Shows what still happens, the sales that
 * counted, and lets the seller ask our team to review it.
 */
export const ListingsPausedScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const [p, setP] = useState<ListingPause | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      setP(await listingPauseService.get());
    } catch (e) {
      setError(errText(e, 'We couldn’t load this. Check your connection.'));
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const toListings = () => navigation.navigate('MainTabs', { screen: 'Listings' });

  if (!p) return <CaseLoading title="Account" error={error} onRetry={load} />;

  if (!p.paused) {
    return (
      <GlassScreen>
        <GlassHeader title="Account" />
        <ScrollView contentContainerStyle={[cs.content, styles.content]}>
          <View style={styles.hero}>
            <View style={[styles.tile, { backgroundColor: TINT.green.bg }]}>
              <Ionicons name="checkmark-circle-outline" size={40} color={G.green} />
            </View>
            <Text style={styles.title} accessibilityRole="header">
              You can list again
            </Text>
            <Text style={styles.sub}>New listings aren’t paused. List a gadget whenever you’re ready.</Text>
          </View>
        </ScrollView>
        <FooterBar>
          <PrimaryButton label="List a gadget" onPress={() => navigation.replace('CreateGadget')} />
          <TextButton label="Go to my listings" onPress={toListings} />
        </FooterBar>
      </GlassScreen>
    );
  }

  const request = async () => {
    setBusy(true);
    try {
      const next = await listingPauseService.requestReview();
      setP(next);
      toast('We’ve asked our team to review it.', 'success');
    } catch (e) {
      toast(errText(e, 'That didn’t go through. Try again.'));
    } finally {
      setBusy(false);
    }
  };

  const asked = !!p.review_requested_at && Date.now() - new Date(p.review_requested_at).getTime() < 86_400_000;
  const until = p.team?.until ? `Until ${dayLabel(p.team.until)}` : null;

  return (
    <GlassScreen>
      <GlassHeader title="Account" />
      <ScrollView contentContainerStyle={[cs.content, styles.content]}>
        <View style={styles.hero}>
          <View style={[styles.tile, { backgroundColor: TINT.amber.bg }]}>
            <Ionicons name="lock-closed-outline" size={38} color={TINT.amber.text} />
          </View>
          <Text style={styles.title} accessibilityRole="header">
            New listings are paused
          </Text>
          {p.message ? <Text style={styles.sub}>{p.message}</Text> : null}
          {until ? <Text style={[styles.sub, styles.until]}>{until}</Text> : null}
        </View>

        <View style={styles.cards}>
          <GlassCard style={cs.card}>
            <Text style={cs.cardTitle}>{p.code === 'PAUSED_BY_TEAM' ? 'What happens now' : 'What still happens'}</Text>
            <View style={styles.lines}>
              {stillHappens(p).map(l => (
                <View key={l.text} style={styles.line}>
                  <Ionicons
                    name={l.ok ? 'checkmark' : 'pause'}
                    size={16}
                    color={l.ok ? G.green : TINT.amber.text}
                    style={styles.lineIcon}
                  />
                  <Text style={styles.lineText}>{l.text}</Text>
                </View>
              ))}
            </View>
          </GlassCard>

          {p.failed.length ? (
            <GlassCard style={cs.rows}>
              {p.failed.map((f, i) => (
                <Row
                  key={f.order_id}
                  k={`${shortTitle(f.title)} · ${dayLabel(f.at)}`}
                  v={f.reason}
                  last={i === p.failed.length - 1}
                />
              ))}
            </GlassCard>
          ) : null}

          {asked ? <Text style={cs.centerCaption}>{askedLabel(p.review_requested_at!)}</Text> : null}
        </View>
      </ScrollView>
      <FooterBar>
        <PrimaryButton
          label={busy ? 'Sending…' : asked ? 'Review requested' : 'Request a review'}
          onPress={request}
          disabled={busy || asked}
        />
        <TextButton label="Go to my listings" onPress={toListings} />
      </FooterBar>
    </GlassScreen>
  );
};

const styles = StyleSheet.create({
  content: { flexGrow: 1, justifyContent: 'space-between' },
  hero: { alignItems: 'center', paddingHorizontal: 12, paddingTop: 48 },
  tile: { width: 88, height: 88, borderRadius: 24, alignItems: 'center', justifyContent: 'center', marginBottom: 18 },
  title: { color: G.ink, fontSize: 24, lineHeight: 30, letterSpacing: -0.4, fontFamily: fonts.medium, textAlign: 'center' },
  sub: { color: G.muted, fontSize: 15, lineHeight: 22, fontFamily: fonts.regular, textAlign: 'center', marginTop: 8 },
  until: { color: TINT.amber.text, marginTop: 6 },
  cards: { gap: 14, marginTop: 40 },
  lines: { gap: 8 },
  line: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  lineIcon: { marginTop: 2 },
  lineText: { flex: 1, color: G.slate, fontSize: 14, lineHeight: 20, fontFamily: fonts.regular },
});
