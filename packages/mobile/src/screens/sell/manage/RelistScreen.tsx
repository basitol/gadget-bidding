import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, TextInput, StyleSheet } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { platformFeeFor, platformFeeLabel } from '@gadget-bidding/shared';
import {
  G,
  GlassScreen,
  GlassHeader,
  GlassCard,
  GlassKeyboardView,
  FooterBar,
  PrimaryButton,
  Chip,
} from '../../../components/glass';
import { fonts } from '../../../constants';
import { listingManageService, RelistView, daysLabel } from '../../../services/listingManage.service';
import { CaseLoading, RadioCard } from '../case/shared';
import { Label, Note } from '../onboarding/kit';
import { ItemCard, MoneyRow, errText, goToListings, k, naira, plural, shortDay, toast, weekdayTime } from './kit';

type PriceChoice = 'tip' | 'same' | 'own';
const digits = (v: string) => v.replace(/\D/g, '');

/** "6% · ₦27,000+" (the fee grows with the price) or "flat ₦50,000". */
const feeLine = (price: number) => {
  const label = platformFeeLabel(price);
  return label.startsWith('flat') ? label : `${label} · ${naira(platformFeeFor(price))}+`;
};

/** Relist ('Relist', { auctionId }): put an unsold gadget up again, with our tip from real sales. */
export const RelistScreen: React.FC<{ navigation: any; route: any }> = ({ navigation, route }) => {
  const auctionId: string = route.params?.auctionId;
  const [v, setV] = useState<RelistView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [choice, setChoice] = useState<PriceChoice | null>(null);
  const [own, setOwn] = useState('');
  const [hours, setHours] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());

  const load = useCallback(async () => {
    try {
      setV(await listingManageService.relistView(auctionId));
      setError(null);
    } catch (e) {
      setError(errText(e, "We couldn't load this listing. Try again."));
    }
  }, [auctionId]);
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );
  // Keep "Ends Sun, 9:00 pm" current while the screen is open.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (v && choice === null) {
      setChoice(v.tip_price ? 'tip' : 'same');
      setHours(v.last_run_hours ?? 72);
    }
  }, [v, choice]);

  if (!v) return <CaseLoading title="Relist" onBack={() => navigation.goBack()} error={error} onRetry={load} />;

  const price =
    choice === 'tip' && v.tip_price ? v.tip_price : choice === 'own' ? Number(digits(own)) || 0 : v.last_starting_price;
  const endsAt = hours ? new Date(now + hours * 3_600_000) : null;
  const problem =
    price < v.min_start_price
      ? `The starting price has to be at least ${naira(v.min_start_price)}.`
      : v.buy_now_price != null && price >= v.buy_now_price
        ? `Your buy-now price is ${naira(v.buy_now_price)}, so start below that.`
        : null;

  const relist = async () => {
    if (problem) return toast(problem);
    if (!hours) return toast('Pick how long it runs.');
    setBusy(true);
    try {
      await listingManageService.relist(auctionId, { starting_price: price, duration_hours: hours });
      toast("It's back up for auction", 'success');
      goToListings(navigation, 'live');
    } catch (e: any) {
      // The listing gate (paused, closed, away, documents): show why on its own screen when it's a pause.
      if (e?.code === 'LISTINGS_PAUSED' || e?.code === 'PAUSED_BY_TEAM') {
        navigation.navigate('ListingsPaused');
      } else toast(errText(e));
    } finally {
      setBusy(false);
    }
  };

  const s = v.similar_sold;
  const above = !!s && v.last_starting_price > s.high;
  const ended = `${v.ended_by_seller ? 'Ended by you' : 'Ended'} ${shortDay(v.ended_at)} · ${v.bids ? plural(v.bids, 'bid') : 'no bids'}`;
  const tellsPeople = v.watched > 0 || v.bids > 0;

  return (
    <GlassScreen>
      <GlassHeader title="Relist" onBack={() => navigation.goBack()} />
      <GlassKeyboardView>
        <ScrollView
          contentContainerStyle={k.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <ItemCard
            image={v.image}
            title={v.title}
            lines={[ended, v.watched ? `${plural(v.watched, 'person', 'people')} watched it` : '']}
          />
          <Text style={k.h1}>Relist it</Text>
          <Text style={k.lead}>
            Relisting is free.{tellsPeople ? ' Everyone who watched or bid on it gets a notification.' : ''}
          </Text>

          {s ? (
            <Note tone={above ? 'amber' : 'neutral'} style={styles.gap}>
              {`Similar ${s.model} sold for ${naira(s.low)}–${naira(s.high)} in the last 30 days.`}
              {above ? ` Your ${naira(v.last_starting_price)} start was above that.` : ''}
            </Note>
          ) : null}

          <Text style={k.label}>Starting price</Text>
          <View style={k.options} accessibilityRole="radiogroup">
            {v.tip_price ? (
              <RadioCard
                on={choice === 'tip'}
                title={naira(v.tip_price)}
                sub="Our tip · more bidders early"
                onPress={() => setChoice('tip')}
              />
            ) : null}
            <RadioCard
              on={choice === 'same'}
              title={naira(v.last_starting_price)}
              sub="Same as before"
              onPress={() => setChoice('same')}
            />
            <RadioCard
              on={choice === 'own'}
              title="Set my own"
              sub="Type the starting price you want"
              onPress={() => setChoice('own')}
            />
          </View>
          {choice === 'own' ? (
            <>
              <View style={[styles.priceBox, styles.gapSmall]}>
                <Text style={styles.currency}>₦</Text>
                <TextInput
                  value={own ? Number(digits(own)).toLocaleString('en-NG') : ''}
                  onChangeText={setOwn}
                  keyboardType="number-pad"
                  style={styles.priceInput}
                  placeholder="0"
                  placeholderTextColor={G.faint}
                  accessibilityLabel="Your starting price"
                  autoFocus
                />
              </View>
              {problem && own ? <Text style={[k.caption, { color: G.red }]}>{problem}</Text> : null}
            </>
          ) : null}

          <Label style={styles.sectionLabel}>How long</Label>
          <View style={styles.chips}>
            {v.durations_hours.map(h => (
              <Chip key={h} label={daysLabel(h)} selected={hours === h} onPress={() => setHours(h)} />
            ))}
          </View>

          <GlassCard style={[k.card, styles.gap]}>
            <MoneyRow k="Starts" v={price ? naira(price) : '—'} />
            <MoneyRow k="Ends" v={endsAt ? weekdayTime(endsAt) : '—'} />
            <MoneyRow k="Fee if it sells" v={price ? feeLine(price) : '—'} last />
          </GlassCard>
          <Text style={[k.caption, styles.center]}>
            You can change the price, description and photos once it's live, until the first bid.
          </Text>
        </ScrollView>
        <FooterBar>
          <PrimaryButton
            label={busy ? 'Relisting…' : 'Relist now'}
            onPress={relist}
            disabled={busy || !!problem || !hours || !v.can_relist}
          />
        </FooterBar>
      </GlassKeyboardView>
    </GlassScreen>
  );
};

const styles = StyleSheet.create({
  gap: { marginTop: 16 },
  gapSmall: { marginTop: 10 },
  sectionLabel: { marginTop: 22, marginBottom: 10 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  center: { textAlign: 'center', marginTop: 12 },
  priceBox: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 56,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    gap: 8,
  },
  currency: { color: G.slate, fontSize: 18, fontFamily: fonts.medium },
  priceInput: { flex: 1, color: G.ink, fontSize: 20, fontFamily: fonts.medium, fontVariant: ['tabular-nums'] },
});
