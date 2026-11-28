import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import type { SpecField } from '@gadget-bidding/shared';
import { AuthTitle, TextField } from '../../../../components/auth/GlassAuthKit';
import { G, GlassCard } from '../../../../components/glass';
import { fonts } from '../../../../constants';
import { Eyebrow, Label } from '../../onboarding/kit';
import { ChipGroup, FromSerialTag, Help, Question, TickRow, listingStyles as ls } from '../kit';
import { specProblem } from '../draft';
import { StepProps } from './types';

const Optional = () => <Text style={s.optional}>Optional</Text>;

/** Step 3 · Specs & locks. */
export const SpecsStep: React.FC<StepProps & { eyebrow: string }> = ({ d, set, profile, eyebrow }) => {
  const [left, setLeft] = useState<Set<string>>(new Set());
  if (!profile) return null;

  const anyFromSerial = d.from_serial.length > 0;
  const foundModel = d.found_choice === 'yes' && d.check?.found ? d.check.found.model : d.model;

  const answer = (key: string, v: string | string[]) =>
    set(prev => ({ specs: { ...prev.specs, [key]: v }, from_serial: prev.from_serial.filter(k => k !== key) }));

  const toggleLock = (lock: string) =>
    set(prev => ({ locks: prev.locks.includes(lock) ? prev.locks.filter(l => l !== lock) : [...prev.locks, lock] }));

  const field = (f: SpecField) => {
    const v = d.specs[f.key];
    const tag = d.from_serial.includes(f.key) ? <FromSerialTag /> : !f.required ? <Optional /> : null;
    const problem = left.has(f.key) ? specProblem(f, v) : null;
    const leave = () => setLeft(prev => new Set(prev).add(f.key));
    let input: React.ReactNode;
    if (f.type === 'chips' || f.type === 'multi') {
      const opts = [...(f.options ?? [])];
      // A value read by the lookup that isn't one of our options still shows (selected).
      const extra = (Array.isArray(v) ? v : v ? [v] : []).filter(x => !opts.includes(x));
      const options = [...opts, ...extra].map(o => ({ key: o, label: o }));
      input =
        f.type === 'chips' ? (
          <ChipGroup
            options={options}
            value={typeof v === 'string' ? v : null}
            // Optional ones can be un-picked.
            onPick={k => answer(f.key, k === v && !f.required ? '' : k)}
          />
        ) : (
          <ChipGroup
            options={options}
            values={Array.isArray(v) ? v : []}
            onPick={k => {
              const cur = Array.isArray(v) ? v : [];
              answer(f.key, cur.includes(k) ? cur.filter(x => x !== k) : [...cur, k]);
            }}
          />
        );
    } else {
      const numeric = f.type === 'number' || f.type === 'percent';
      input = (
        <TextField
          value={typeof v === 'string' ? v : ''}
          onChangeText={t => answer(f.key, numeric ? t.replace(/[^\d]/g, '') : t)}
          onBlur={leave}
          placeholder={f.placeholder}
          keyboardType={numeric ? 'number-pad' : 'default'}
          maxLength={f.type === 'percent' ? 3 : numeric ? 7 : 80}
          invalid={!!problem && problem !== 'required'}
          accessibilityLabel={f.label}
        />
      );
    }
    return (
      <View key={f.key} style={s.field}>
        <Question right={tag}>{f.label}</Question>
        {input}
        {problem && problem !== 'required' ? (
          <Text style={ls.error} accessibilityRole="alert">
            {problem}
          </Text>
        ) : null}
        {f.help ? <Help style={s.help}>{f.help}</Help> : null}
      </View>
    );
  };

  return (
    <>
      <Eyebrow>{eyebrow}</Eyebrow>
      <AuthTitle
        title="Check the specs"
        sub={
          anyFromSerial
            ? 'Anything marked "From serial" came from the lookup — just check it. Fill in the rest.'
            : 'Fill in what you know. Buyers search and filter by these.'
        }
      />

      <GlassCard style={s.summary}>
        <Text style={s.summaryTitle}>{profile.label}</Text>
        {foundModel ? <Text style={s.summarySub}>{foundModel}</Text> : null}
      </GlassCard>

      {profile.specs.map(field)}

      <Label style={s.label}>Locks</Label>
      <Help style={s.lockHelp}>Tick each one. Our hub checks them at drop-off.</Help>
      <GlassCard style={ls.card}>
        {profile.locks.map((l, i) => (
          <TickRow key={l} label={l} on={d.locks.includes(l)} onToggle={() => toggleLock(l)} last={i === profile.locks.length - 1} />
        ))}
      </GlassCard>
    </>
  );
};

const s = StyleSheet.create({
  summary: { paddingHorizontal: 16, paddingVertical: 14, marginBottom: 24, gap: 2 },
  summaryTitle: { color: G.ink, fontSize: 15, fontFamily: fonts.medium },
  summarySub: { color: G.muted, fontSize: 13, lineHeight: 18, fontFamily: fonts.regular },
  field: { marginBottom: 20 },
  help: { marginTop: 8 },
  optional: { color: G.muted, fontSize: 13, fontFamily: fonts.regular },
  label: { marginTop: 8, marginBottom: 4 },
  lockHelp: { marginBottom: 12 },
});
