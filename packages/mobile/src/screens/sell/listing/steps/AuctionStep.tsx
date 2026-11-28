import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { platformFeeFor, platformFeeLabel } from '@gadget-bidding/shared';
import { AuthTitle } from '../../../../components/auth/GlassAuthKit';
import { G } from '../../../../components/glass';
import { fonts } from '../../../../constants';
import { listingService, type PriceHint, type PriceRange } from '../../../../services/listing.service';
import { Eyebrow, TINT } from '../../onboarding/kit';
import { ChipGroup, MoneyField, Question, SwitchCard, listingStyles as ls, naira } from '../kit';
import { reserveAmount, startAmount } from '../draft';
import { StepProps } from './types';

const range = (r: PriceRange) => `${naira(r.low)}—${naira(r.high)}`;
const durationLabel = (h: number) => (h % 24 === 0 ? `${h / 24} day${h === 24 ? '' : 's'}` : `${h} hours`);

/** Step 7 · Set up your auction: price (with a hint), hidden lowest price, length, what they'd receive. */
export const AuctionStep: React.FC<StepProps & { eyebrow: string }> = ({ d, set, profile, config, eyebrow }) => {
  const [hint, setHint] = useState<PriceHint | null>(null);
  const [startLeft, setStartLeft] = useState(false);
  const [reserveLeft, setReserveLeft] = useState(false);

  const model = (d.found_choice === 'yes' && d.check?.found?.model) || d.model.trim();
  const storage = typeof d.specs.storage === 'string' ? d.specs.storage : undefined;
  useEffect(() => {
    if (!profile || !model) return;
    let alive = true;
    listingService
      .priceHint({ profile: profile.key, model, ...(storage ? { storage } : {}) })
      .then(h => alive && setHint(h))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [profile, model, storage]);

  if (!profile) return null;

  const start = startAmount(d);
  const reserve = reserveAmount(d);
  const startError = startLeft && d.start_price && start < config.min_start_price ? `Start at ${naira(config.min_start_price)} or more.` : null;
  const reserveError =
    reserveLeft && d.reserve_on && d.reserve_price && reserve !== null && start && reserve < start
      ? `Make it at least your starting price (${naira(start)}).`
      : null;

  // "Similar iPhone 15 Pro with a replaced screen sold for …"
  const replaced = d.opened === 'yes' ? Object.keys(d.parts) : [];
  const repairedWords =
    replaced.length === 1
      ? `with a replaced ${(profile.parts.find(p => p.key === replaced[0])?.label ?? 'part').split(' / ')[0].toLowerCase()}`
      : replaced.length > 1
        ? 'with replaced parts'
        : 'with repairs';
  const R = hint?.similar_repaired;
  const O = hint?.all_original;
  const hintText =
    R && O
      ? `Similar ${model} ${repairedWords} sold for ${range(R)} · all-original ones for ${range(O)}`
      : R
        ? `Similar ${model} ${repairedWords} sold for ${range(R)}`
        : O
          ? `Similar all-original ${model} sold for ${range(O)}`
          : null;

  const sellsAt = Math.max(start, reserve ?? 0);
  // Fee by price band (seller agreement): 8% / 6% / 5%, flat ₦50,000 over ₦1,000,000.
  const fee = platformFeeFor(sellsAt);
  const durations = config.durations_hours.length ? config.durations_hours : [24, 72, 120, 168];

  return (
    <>
      <Eyebrow>{eyebrow}</Eyebrow>
      <AuthTitle title="Set up your auction" sub="Buyers bid up from your starting price." />

      <Question>Starting price</Question>
      <MoneyField
        value={d.start_price}
        onChange={v => set({ start_price: v })}
        onBlur={() => setStartLeft(true)}
        placeholder="0"
        invalid={!!startError}
        accessibilityLabel="Starting price in naira"
      />
      {startError ? (
        <Text style={ls.error} accessibilityRole="alert">
          {startError}
        </Text>
      ) : null}
      {hintText ? <Text style={[ls.muted, s.hint]}>{hintText}</Text> : null}

      <View style={ls.gap}>
        <SwitchCard
          title="Lowest price I'll accept"
          sub="Hidden from buyers. No sale if bids stay below it."
          on={d.reserve_on}
          onChange={v => set({ reserve_on: v })}
        >
          {d.reserve_on ? (
            <View style={s.reserve}>
              <MoneyField
                value={d.reserve_price}
                onChange={v => set({ reserve_price: v })}
                onBlur={() => setReserveLeft(true)}
                placeholder={start ? String(start) : '0'}
                invalid={!!reserveError}
                accessibilityLabel="Lowest price in naira"
              />
              {reserveError ? (
                <Text style={ls.error} accessibilityRole="alert">
                  {reserveError}
                </Text>
              ) : null}
            </View>
          ) : null}
        </SwitchCard>
      </View>

      <View style={ls.gap}>
        <Question>How long should it run?</Question>
        <ChipGroup
          options={durations.map(h => ({ key: String(h), label: durationLabel(h) }))}
          value={String(d.duration_hours)}
          onPick={k => set({ duration_hours: Number(k) })}
        />
      </View>

      {sellsAt > 0 ? (
        <View style={s.payout} accessibilityLabel={`If it sells at ${naira(sellsAt)}, you'd receive ${naira(sellsAt - fee)}`}>
          <Text style={s.payoutTop}>If it sells at {naira(sellsAt)}</Text>
          <View style={s.payoutRow}>
            <Text style={s.payoutKey}>Platform fee {platformFeeLabel(sellsAt)}</Text>
            <Text style={s.payoutKey}>−{naira(fee)}</Text>
          </View>
          <View style={[s.payoutRow, s.payoutTotal]}>
            <Text style={s.payoutStrong}>You'd receive</Text>
            <Text style={s.payoutBig}>{naira(sellsAt - fee)}</Text>
          </View>
        </View>
      ) : null}
    </>
  );
};

const s = StyleSheet.create({
  hint: { marginTop: 8 },
  reserve: { marginTop: 14 },
  payout: { marginTop: 24, borderRadius: 18, padding: 16, backgroundColor: TINT.green.bg, borderWidth: 1, borderColor: 'rgba(46,158,94,0.16)' },
  payoutTop: { color: G.slate, fontSize: 13, fontFamily: fonts.regular, marginBottom: 10 },
  payoutRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  payoutKey: { color: G.slate, fontSize: 14, fontFamily: fonts.regular, fontVariant: ['tabular-nums'] },
  payoutTotal: { marginTop: 10, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(46,158,94,0.25)' },
  payoutStrong: { color: G.ink, fontSize: 15, fontFamily: fonts.medium },
  payoutBig: { color: G.ink, fontSize: 19, fontFamily: fonts.medium, fontVariant: ['tabular-nums'] },
});
