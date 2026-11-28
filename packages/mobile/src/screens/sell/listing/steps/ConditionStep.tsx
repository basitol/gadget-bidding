import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { CONDITION_GRADES } from '@gadget-bidding/shared';
import { AuthTitle, TextField } from '../../../../components/auth/GlassAuthKit';
import { G } from '../../../../components/glass';
import { fonts } from '../../../../constants';
import { Eyebrow } from '../../onboarding/kit';
import { ChipGroup, Help, Question, RadioCard, listingStyles as ls } from '../kit';
import { batteryProblem, batteryRequired } from '../draft';
import { StepProps } from './types';

const WORKS = '__works';

/** Step 4 · Condition: grade, battery health, faults, what's in the box, a note. */
export const ConditionStep: React.FC<StepProps & { eyebrow: string }> = ({ d, set, profile, eyebrow }) => {
  const [batteryLeft, setBatteryLeft] = useState(false);
  if (!profile) return null;

  const battery = batteryLeft ? batteryProblem(profile, d.battery_health) : null;

  const pickFault = (key: string) =>
    set(prev => {
      if (key === WORKS) return { all_works: !prev.all_works, faults: [] };
      const faults = prev.faults.includes(key) ? prev.faults.filter(f => f !== key) : [...prev.faults, key];
      return { all_works: false, faults };
    });

  const pickBox = (key: string) =>
    set(prev => ({ included: prev.included.includes(key) ? prev.included.filter(k => k !== key) : [...prev.included, key] }));

  return (
    <>
      <Eyebrow>{eyebrow}</Eyebrow>
      <AuthTitle title="How does it look?" sub="Pick the grade that fits best. Our hub checks it at drop-off." />

      <View accessibilityRole="radiogroup">
        {CONDITION_GRADES.map(g => (
          <RadioCard key={g.key} label={g.label} help={g.help} selected={d.condition === g.key} onPress={() => set({ condition: g.key })} />
        ))}
      </View>

      {profile.batteryHealth ? (
        <View style={ls.gap}>
          <Question right={batteryRequired(profile) ? null : <Text style={s.optional}>Optional</Text>}>Battery health</Question>
          <View style={s.percentRow}>
            <TextField
              value={d.battery_health}
              onChangeText={t => set({ battery_health: t.replace(/\D/g, '').slice(0, 3) })}
              onBlur={() => setBatteryLeft(true)}
              placeholder="e.g. 89"
              keyboardType="number-pad"
              maxLength={3}
              invalid={!!battery && battery !== 'required'}
              style={s.percentInput}
              accessibilityLabel="Battery health, percent"
            />
            <Text style={s.percent}>%</Text>
          </View>
          {battery && battery !== 'required' ? (
            <Text style={ls.error} accessibilityRole="alert">
              {battery}
            </Text>
          ) : null}
          <Help style={s.help}>{profile.batteryHealth.help}</Help>
        </View>
      ) : null}

      <View style={ls.gap}>
        <Question>Anything not working?</Question>
        <ChipGroup
          options={[{ key: WORKS, label: 'Everything works' }, ...profile.faults]}
          values={d.all_works ? [WORKS] : d.faults}
          onPick={pickFault}
        />
      </View>

      <View style={ls.gap}>
        <Question right={<Text style={s.optional}>Optional</Text>}>What's in the box?</Question>
        <ChipGroup options={profile.inBox} values={d.included} onPick={pickBox} />
      </View>

      <View style={ls.gap}>
        <Question right={<Text style={s.optional}>Optional</Text>}>Anything else buyers should know?</Question>
        <TextField
          value={d.note}
          onChangeText={t => set({ note: t })}
          placeholder="e.g. Small scratch near the camera. Comes with a spare cable."
          multiline
          maxLength={500}
          style={s.note}
          accessibilityLabel="Anything else buyers should know"
        />
      </View>
    </>
  );
};

const s = StyleSheet.create({
  optional: { color: G.muted, fontSize: 13, fontFamily: fonts.regular },
  percentRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  percentInput: { width: 120 },
  percent: { color: G.ink, fontSize: 16, fontFamily: fonts.medium },
  help: { marginTop: 8 },
  note: { height: 110, paddingTop: 14, paddingBottom: 14, textAlignVertical: 'top' },
});
