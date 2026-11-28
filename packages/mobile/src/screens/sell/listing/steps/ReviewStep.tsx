import React from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import {
  CONDITION_GRADES,
  LISTING_CATEGORIES,
  listingDisclosures,
  maskIdentifier,
  photoSlotsFor,
  platformFeeFor,
} from '@gadget-bidding/shared';
import { AuthTitle } from '../../../../components/auth/GlassAuthKit';
import { G, GlassCard } from '../../../../components/glass';
import { fonts } from '../../../../constants';
import { mediaUrl } from '../../../../utils';
import { Eyebrow, Note } from '../../onboarding/kit';
import { ReviewLine, ReviewSection, TickRow, listingStyles as ls, naira } from '../kit';
import { disclosureSpecs, hasDamage, normalizeIdentifier, reserveAmount, startAmount } from '../draft';
import { IdWord, StepProps } from './types';

const ATTEST =
  "This item is mine to sell, and the specs, repairs and faults above are true. If the hub finds something I didn't mention, the buyer is refunded and it counts against my store.";

/** Step 8 · Check your listing, with an Edit link per section. */
export const ReviewStep: React.FC<
  StepProps & { eyebrow: string; teamNote?: string | null; attest: boolean; onAttest: () => void; onEdit: (step: number) => void }
> = ({ d, profile, config, eyebrow, teamNote, attest, onAttest, onEdit }) => {
  if (!profile) return null;

  const model = (d.found_choice === 'yes' && d.check?.found?.model) || d.model.trim();
  const category = LISTING_CATEGORIES.find(c => c.key === d.category_key)?.label;
  const slots = photoSlotsFor(profile, hasDamage(d));
  const hero = d.photos.front ?? slots.map(sl => d.photos[sl.key]).find(Boolean);

  const id = normalizeIdentifier(d.identifier, profile.identifier);
  const idLine =
    profile.identifier === 'none'
      ? null
      : id
        ? `${IdWord(profile)} ${d.check?.masked ?? maskIdentifier(id)}`
        : d.identifier_on_file
          ? `${IdWord(profile)} ${d.identifier_on_file}`
          : `No ${profile.identifier === 'imei' ? 'IMEI' : 'serial number'} added`;

  const specLine = profile.specs
    .map(f => {
      const v = d.specs[f.key];
      if (!v || (Array.isArray(v) && !v.length)) return null;
      const text = Array.isArray(v) ? v.join(', ') : String(v).trim();
      return f.type === 'number' || f.type === 'percent' ? `${f.label} ${text}` : text;
    })
    .filter(Boolean)
    .join(' · ');

  const grade = CONDITION_GRADES.find(g => g.key === d.condition);
  const faults = d.all_works ? [] : d.faults.map(k => profile.faults.find(f => f.key === k)?.label ?? k);
  const box = d.included.map(k => profile.inBox.find(o => o.key === k)?.label ?? k);
  const repairs = listingDisclosures({ ...disclosureSpecs(d), faults: [] });

  const start = startAmount(d);
  const reserve = reserveAmount(d);
  const sellsAt = Math.max(start, reserve ?? 0);
  const receive = sellsAt - platformFeeFor(sellsAt);
  const days = d.duration_hours % 24 === 0 ? `${d.duration_hours / 24} day${d.duration_hours === 24 ? '' : 's'}` : `${d.duration_hours} hours`;

  return (
    <>
      <Eyebrow>{eyebrow}</Eyebrow>
      <AuthTitle title="Check your listing" sub="This is what our team reviews. Tap Edit to change anything." />

      {teamNote ? (
        <Note tone="amber" title="What our team asked you to change" style={s.teamNote}>
          {teamNote}
        </Note>
      ) : null}

      <GlassCard style={s.hero}>
        {hero ? <Image source={{ uri: mediaUrl(hero) }} style={s.heroImage} resizeMode="contain" /> : null}
        <Text style={s.heroTitle}>{model}</Text>
        <Text style={s.heroSub}>{[category, profile.label].filter(Boolean).join(' · ')}</Text>
      </GlassCard>

      <ReviewSection label="Item" onEdit={() => onEdit(1)}>
        <ReviewLine strong>{model}</ReviewLine>
        <ReviewLine tone="muted">{profile.label}</ReviewLine>
        {idLine ? <ReviewLine tone={id || d.identifier_on_file ? 'ink' : 'muted'}>{idLine}</ReviewLine> : null}
      </ReviewSection>

      <ReviewSection label="Specs & locks" onEdit={() => onEdit(3)}>
        {specLine ? <ReviewLine>{specLine}</ReviewLine> : null}
        <ReviewLine tone="muted">
          {profile.locks.length === 1 ? 'Lock confirmed' : `All ${profile.locks.length} locks confirmed`}
        </ReviewLine>
      </ReviewSection>

      <ReviewSection label="Condition" onEdit={() => onEdit(4)}>
        <ReviewLine strong>
          {[grade?.label, profile.batteryHealth && d.battery_health ? `Battery ${d.battery_health}%` : null].filter(Boolean).join(' · ')}
        </ReviewLine>
        <ReviewLine tone={faults.length ? 'red' : 'ink'}>{faults.length ? `Not working: ${faults.join(', ')}` : 'Everything works'}</ReviewLine>
        {box.length ? <ReviewLine tone="muted">{`In the box: ${box.join(', ')}`}</ReviewLine> : null}
        {d.note.trim() ? <ReviewLine tone="muted">{`"${d.note.trim()}"`}</ReviewLine> : null}
      </ReviewSection>

      <ReviewSection label="Repairs" onEdit={() => onEdit(5)}>
        {repairs.length ? (
          repairs.map(r => (
            <ReviewLine key={r.label} tone={r.tone === 'red' ? 'red' : r.tone === 'neutral' ? 'ink' : 'amber'}>
              {r.label}
            </ReviewLine>
          ))
        ) : (
          <ReviewLine>Never opened or repaired · no damage</ReviewLine>
        )}
      </ReviewSection>

      <ReviewSection label="Auction" onEdit={() => onEdit(7)}>
        <ReviewLine strong>{`Starts at ${naira(start)} · runs ${days}`}</ReviewLine>
        <ReviewLine tone="muted">{reserve ? `Lowest price ${naira(reserve)} · hidden from buyers` : 'No lowest price'}</ReviewLine>
        {sellsAt ? <ReviewLine tone="muted">{`You'd receive ${naira(receive)} if it sells at ${naira(sellsAt)}`}</ReviewLine> : null}
      </ReviewSection>

      <View style={ls.gapSm}>
        <GlassCard style={ls.card}>
          <TickRow label={ATTEST} on={attest} onToggle={onAttest} last plain />
        </GlassCard>
      </View>
    </>
  );
};

const s = StyleSheet.create({
  teamNote: { marginBottom: 16 },
  hero: { padding: 16, marginBottom: 12, alignItems: 'center' },
  heroImage: { width: '100%', height: 190, marginBottom: 12 },
  heroTitle: { color: G.ink, fontSize: 19, lineHeight: 25, fontFamily: fonts.medium, textAlign: 'center' },
  heroSub: { color: G.muted, fontSize: 13, fontFamily: fonts.regular, marginTop: 2, textAlign: 'center' },
});
