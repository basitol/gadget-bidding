import React from 'react';
import { View, StyleSheet } from 'react-native';
import { PART_SOURCES, PARTS_HISTORY_OPTIONS, damageOptionsFor, listingDisclosures } from '@gadget-bidding/shared';
import { AuthTitle } from '../../../../components/auth/GlassAuthKit';
import { GlassCard } from '../../../../components/glass';
import { Eyebrow, Label } from '../../onboarding/kit';
import { ChipGroup, Disclosures, Help, Question, TickRow, TintNote, listingStyles as ls } from '../kit';
import { disclosureSpecs } from '../draft';
import { StepProps } from './types';

const OPENED = [
  { key: 'never', label: 'Never' },
  { key: 'yes', label: 'Yes' },
  { key: 'not_sure', label: 'Not sure' },
];
const NONE = '__none';

/** Step 5 · Repairs and damage, and what buyers will see. */
export const RepairsStep: React.FC<StepProps & { eyebrow: string }> = ({ d, set, profile, eyebrow }) => {
  if (!profile) return null;

  const togglePart = (key: string) =>
    set(prev => {
      const parts = { ...prev.parts };
      if (key in parts) delete parts[key];
      else parts[key] = null;
      return { parts };
    });

  const pickDamage = (key: string) =>
    set(prev => {
      if (key === NONE) return { no_damage: !prev.no_damage, damage: [] };
      const damage = prev.damage.includes(key) ? prev.damage.filter(x => x !== key) : [...prev.damage, key];
      return { no_damage: false, damage };
    });

  // Faults are shown on the condition step; here it's repairs and damage.
  const seen = listingDisclosures({ ...disclosureSpecs(d), faults: [] });

  return (
    <>
      <Eyebrow>{eyebrow}</Eyebrow>
      <AuthTitle title="Repairs and damage" sub="Buyers trust honest listings — and our hub can tell when a part has been replaced." />

      <Question>Has it ever been opened or repaired?</Question>
      <ChipGroup options={OPENED} value={d.opened} onPick={k => set({ opened: k as 'never' | 'yes' | 'not_sure' })} />

      {d.opened === 'yes' ? (
        <View style={ls.gap}>
          <Question>Which parts were changed?</Question>
          <GlassCard style={ls.card}>
            {profile.parts.map((p, i) => {
              const on = p.key in d.parts;
              return (
                <TickRow key={p.key} label={p.label} on={on} onToggle={() => togglePart(p.key)} last={i === profile.parts.length - 1}>
                  {on ? (
                    <ChipGroup
                      options={PART_SOURCES}
                      value={d.parts[p.key]}
                      onPick={k => set(prev => ({ parts: { ...prev.parts, [p.key]: k as (typeof PART_SOURCES)[number]['key'] } }))}
                    />
                  ) : null}
                </TickRow>
              );
            })}
          </GlassCard>
        </View>
      ) : null}

      {profile.partsHistory ? (
        <View style={ls.gap}>
          <Question>iPhone "Parts and Service History"</Question>
          <Help style={s.helpTop}>Settings → General → About. Non-genuine screens, batteries and cameras show "Unknown Part".</Help>
          <ChipGroup options={PARTS_HISTORY_OPTIONS} value={d.parts_history} onPick={k => set({ parts_history: k })} />
          {d.parts_history === 'unknown_part' ? (
            <TintNote tone="amber" icon="alert-circle" style={ls.gapSm}>
              Add a screenshot of that screen in Photos. Buyers see "Non-genuine part — iPhone shows Unknown Part". Some features (like True Tone or battery health) may not work with these parts.
            </TintNote>
          ) : null}
        </View>
      ) : null}

      <View style={ls.gap}>
        <Question>Any damage?</Question>
        <ChipGroup options={[{ key: NONE, label: 'None' }, ...damageOptionsFor(profile)]} values={d.no_damage ? [NONE] : d.damage} onPick={pickDamage} />
      </View>

      {seen.length ? (
        <GlassCard style={s.seen}>
          <Label style={s.seenLabel}>Buyers will see</Label>
          <Disclosures items={seen} />
        </GlassCard>
      ) : null}
    </>
  );
};

const s = StyleSheet.create({
  helpTop: { marginTop: -4, marginBottom: 10 },
  seen: { padding: 16, marginTop: 24 },
  seenLabel: { marginBottom: 12 },
});
