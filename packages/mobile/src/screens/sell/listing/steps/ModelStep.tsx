import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AuthTitle, TextField, TextLink } from '../../../../components/auth/GlassAuthKit';
import { G, GlassCard, PrimaryButton, SecondaryButton } from '../../../../components/glass';
import { fonts } from '../../../../constants';
import { Eyebrow, Note } from '../../onboarding/kit';
import { Help, Question, Strong, TintNote, ValueChip, listingStyles as ls } from '../kit';
import { imeiProblem, lookupFor, normalizeIdentifier } from '../draft';
import { scannerAvailable } from '../ScannerModal';
import { IdWord, StepProps, idWord, toast } from './types';

/** Words for "We read the chip, memory, storage and year…" (CPU / GPU cores is left out, as in the design). */
const READ_WORD: Record<string, string | null> = {
  chip: 'chip',
  cores: null,
  memory: 'memory',
  storage: 'storage',
  year_size: 'year',
  colour: 'colour',
  processor: 'processor',
  connectivity: 'connectivity',
  size: 'case size',
  material: 'case',
  case: 'case',
};

const listWords = (words: string[]) =>
  words.length <= 1 ? words.join('') : `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`;

/** Step 2 · Find the exact model: IMEI / serial, scanner, and what the maker's lookup found. */
export const ModelStep: React.FC<
  StepProps & {
    eyebrow: string;
    checking: boolean;
    onCheck: () => void;
    onScan: () => void;
    onFound: (yes: boolean) => void;
    onSkip: () => void;
  }
> = ({ d, set, profile, config, eyebrow, checking, onCheck, onScan, onFound, onSkip }) => {
  const [touched, setTouched] = useState(false);
  if (!profile) return null;

  const kind = profile.identifier;
  if (kind === 'none') {
    return (
      <>
        <Eyebrow>{eyebrow}</Eyebrow>
        <AuthTitle title="Let's find the exact model" sub="There's no serial number to add for this kind of gadget." />
      </>
    );
  }

  const lookup = lookupFor(d, profile, config);
  const words = profile.specs.filter(f => f.fromSerial).map(f => (f.key in READ_WORD ? READ_WORD[f.key] : f.label.toLowerCase()));
  const read = listWords(words.filter((w): w is string => !!w));
  const sub = lookup
    ? `We read the ${read} from the ${idWord(profile)}, so you don't have to.`
    : kind === 'imei'
      ? 'Add the IMEI so our hub can check it and match it to the phone.'
      : 'Add the serial number so our hub can check it and match it to the device.';

  const id = normalizeIdentifier(d.identifier, kind);
  const result = d.check && d.checked === id && id ? d.check : null;
  const clientError = kind === 'imei' && touched ? imeiProblem(id) : null;
  const serverError = result && !result.valid ? result.message || `That ${idWord(profile)} doesn't look right. Check it and try again.` : null;
  const error = clientError || serverError;
  const found = result?.valid ? result.found : null;

  const change = (t: string) =>
    set(prev => {
      const next = normalizeIdentifier(t, kind);
      const same = next === normalizeIdentifier(prev.identifier, kind);
      return {
        identifier: t,
        identifier_skipped: false,
        ...(same ? {} : { found_choice: null, ...(prev.found_choice === 'yes' ? { from_serial: [] } : {}) }),
      };
    });

  const scan = () => {
    if (!scannerAvailable) {
      toast('Scanning comes with the next app update. Type the number for now.', 'info');
      return;
    }
    onScan();
  };

  return (
    <>
      <Eyebrow>{eyebrow}</Eyebrow>
      <AuthTitle title="Let's find the exact model" sub={sub} />

      <Question>{IdWord(profile)}</Question>
      <View style={s.idRow}>
        <TextField
          value={d.identifier}
          onChangeText={change}
          onBlur={() => setTouched(true)}
          onSubmitEditing={onCheck}
          placeholder={kind === 'imei' ? '15 digits' : 'e.g. C02XG0FDH7JY'}
          keyboardType={kind === 'imei' ? 'number-pad' : 'default'}
          autoCapitalize="characters"
          autoCorrect={false}
          spellCheck={false}
          returnKeyType="done"
          maxLength={kind === 'imei' ? 20 : 34}
          invalid={!!error}
          style={s.idInput}
          accessibilityLabel={IdWord(profile)}
        />
        <Pressable onPress={scan} style={({ pressed }) => [s.scan, pressed && s.pressed]} accessibilityRole="button" accessibilityLabel={`Scan the ${idWord(profile)} barcode`}>
          <Ionicons name="barcode-outline" size={22} color={G.ink} />
        </Pressable>
      </View>
      {error ? (
        <Text style={ls.error} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
      <Help style={s.help}>{profile.identifierHelp}</Help>

      {checking ? (
        <View style={s.checking}>
          <ActivityIndicator size="small" color={G.muted} />
          <Text style={ls.muted}>Checking the {idWord(profile)}…</Text>
        </View>
      ) : null}

      {!id && d.identifier_on_file ? (
        <Note style={ls.gapSm}>{`On file: ${d.identifier_on_file}. Leave this empty to keep it, or type a new one.`}</Note>
      ) : null}
      {!id && d.identifier_skipped ? <Note style={ls.gapSm}>You skipped this. You can add it any time before you submit.</Note> : null}

      {found ? (
        <GlassCard style={s.found}>
          <View style={s.foundHead}>
            <Ionicons name="checkmark-circle" size={16} color={G.green} />
            <Text style={s.overline}>WE FOUND · From the maker's serial lookup</Text>
          </View>
          <Text style={s.foundModel}>{found.model}</Text>
          <View style={s.chips}>
            {profile.specs
              .filter(f => found.specs?.[f.key] !== undefined && found.specs?.[f.key] !== null && found.specs?.[f.key] !== '')
              .map(f => {
                const v = found.specs[f.key];
                return <ValueChip key={f.key} label={Array.isArray(v) ? v.join(', ') : String(v)} />;
              })}
          </View>
          {d.found_choice ? (
            <View style={s.choice}>
              <Text style={s.choiceText}>{d.found_choice === 'yes' ? "We'll use these specs." : "You'll check the specs by hand next."}</Text>
              <TextLink label="Change" onPress={() => set({ found_choice: null })} />
            </View>
          ) : (
            <View style={s.foundButtons}>
              <PrimaryButton label="Yes, that's it" onPress={() => onFound(true)} style={s.flex} />
              <SecondaryButton label="Not right — edit" onPress={() => onFound(false)} style={s.flex} />
            </View>
          )}
        </GlassCard>
      ) : null}

      {result?.valid && !found ? (
        <GlassCard style={s.neutral}>
          <Ionicons name="business-outline" size={18} color={G.slate} />
          <Text style={s.neutralText}>
            {result.masked ? (
              <>
                <Strong>{result.masked}</Strong>
                {' · '}
              </>
            ) : null}
            We'll match this to the device at the hub.
          </Text>
        </GlassCard>
      ) : null}

      {result?.valid && result.duplicate ? (
        <TintNote tone="amber" icon="alert-circle" style={ls.gapSm}>
          This number is already on another listing. You can carry on — our team will check it.
        </TintNote>
      ) : null}

      {!profile.identifierRequired && !d.identifier_skipped && !id ? (
        <TextLink label="Skip" onPress={onSkip} style={s.skip} />
      ) : null}

      <Note style={ls.gap}>
        {`Our hub checks the ${idWord(profile)} against stolen, blacklisted and finance-locked lists and matches it to the device at drop-off.`}
      </Note>
    </>
  );
};

const s = StyleSheet.create({
  flex: { flex: 1 },
  pressed: { opacity: 0.7 },
  idRow: { flexDirection: 'row', gap: 8 },
  idInput: { flex: 1, letterSpacing: 0.5, fontVariant: ['tabular-nums'] },
  scan: { width: 52, height: 52, borderRadius: 14, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  help: { marginTop: 8 },
  checking: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 },
  found: { padding: 16, marginTop: 16, gap: 10 },
  foundHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  overline: { color: G.green, fontSize: 12, letterSpacing: 0.4, fontFamily: fonts.medium, flexShrink: 1 },
  foundModel: { color: G.ink, fontSize: 19, lineHeight: 25, letterSpacing: -0.2, fontFamily: fonts.medium },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  foundButtons: { flexDirection: 'row', gap: 8, marginTop: 4 },
  choice: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 },
  choiceText: { color: G.slate, fontSize: 14, fontFamily: fonts.regular, flex: 1 },
  neutral: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 16, marginTop: 16 },
  neutralText: { flex: 1, color: G.slate, fontSize: 14, lineHeight: 20, fontFamily: fonts.regular },
  skip: { alignSelf: 'center', marginTop: 18, paddingVertical: 6 },
});
