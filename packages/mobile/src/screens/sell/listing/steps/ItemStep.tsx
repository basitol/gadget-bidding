import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator, Keyboard } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LISTING_CATEGORIES, profileByKey, profilesForCategory, type ListingCategoryKey } from '@gadget-bidding/shared';
import { AuthTitle, Field, TextField } from '../../../../components/auth/GlassAuthKit';
import { G, GlassCard, SecondaryButton } from '../../../../components/glass';
import { fonts } from '../../../../constants';
import { listingService, type ModelSuggestion } from '../../../../services/listing.service';
import { Eyebrow } from '../../onboarding/kit';
import { CategoryTile, ChipGroup, Question, Strong, TintNote, listingStyles as ls } from '../kit';
import { lookupFor, profileChange } from '../draft';
import { scannerAvailable } from '../ScannerModal';
import { StepProps, idWord } from './types';

const ICON: Record<ListingCategoryKey, keyof typeof Ionicons.glyphMap> = {
  phones: 'phone-portrait-outline',
  tablets: 'tablet-portrait-outline',
  laptops: 'laptop-outline',
  desktops: 'desktop-outline',
  audio: 'headset-outline',
  gaming: 'game-controller-outline',
  wearables: 'watch-outline',
  vr_glasses: 'glasses-outline',
  cameras_drones: 'camera-outline',
  other: 'cube-outline',
};

/** Step 1 · The item: category, then the model (from our list, or typed + "What kind is it?"). */
export const ItemStep: React.FC<StepProps & { eyebrow: string; onScan: () => void }> = ({ d, set, profile, config, eyebrow, onScan }) => {
  const [results, setResults] = useState<ModelSuggestion[]>([]);
  const [searching, setSearching] = useState(false);
  const [answered, setAnswered] = useState('');
  const [focused, setFocused] = useState(false);

  const term = d.model.trim();
  useEffect(() => {
    if (term.length < 2 || d.model_id) {
      setResults([]);
      setSearching(false);
      return;
    }
    let alive = true;
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const r = await listingService.models(term, d.category_key);
        if (alive) setResults(r.slice(0, 6));
      } catch {
        if (alive) setResults([]);
      } finally {
        if (alive) {
          setAnswered(term);
          setSearching(false);
        }
      }
    }, 300);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [term, d.model_id, d.category_key]);

  const kinds = d.category_key ? profilesForCategory(d.category_key) : [];

  const pickCategory = (key: ListingCategoryKey) =>
    set(prev => {
      if (prev.category_key === key) return {};
      const only = profilesForCategory(key);
      const keepProfile = profileByKey(prev.profile)?.category === key;
      const nextProfile = keepProfile ? prev.profile : only.length === 1 ? only[0].key : null;
      return {
        category_key: key,
        ...(keepProfile ? {} : { model_id: null, brand: null, model_lookup: null }),
        ...profileChange(prev, nextProfile),
      };
    });

  const type = (t: string) =>
    set(prev => ({
      model: t,
      // Changing a model picked from the list: it's the seller's own words now.
      ...(prev.model_id ? { model_id: null, brand: null, model_lookup: null, ...profileChange(prev, kindsFor(prev.category_key))} : {}),
    }));

  const pick = (m: ModelSuggestion) => {
    Keyboard.dismiss();
    setFocused(false);
    const cat = m.category_key ?? profileByKey(m.profile)?.category ?? null;
    set(prev => ({
      model: m.name,
      model_id: m.id,
      brand: m.brand,
      model_lookup: m.lookup_available ?? null,
      category_key: cat ?? prev.category_key,
      ...profileChange(prev, m.profile),
    }));
  };

  const pickKind = (key: string) => set(prev => profileChange(prev, key));

  const showList = !d.model_id && results.length > 0 && (focused || !profile);
  const showKinds = !d.model_id && term.length >= 2 && kinds.length > 1 && (!!profile || (!searching && answered === term));
  const ready = !!profile && term.length >= 2;
  const lookup = profile ? lookupFor(d, profile, config) : false;

  return (
    <>
      <Eyebrow>{eyebrow}</Eyebrow>
      <AuthTitle title="What are you selling?" sub="Pick the kind of gadget, then find the model." />

      <View style={s.grid}>
        {LISTING_CATEGORIES.map(c => (
          <CategoryTile key={c.key} label={c.label} icon={ICON[c.key]} selected={d.category_key === c.key} onPress={() => pickCategory(c.key)} />
        ))}
      </View>

      <Field label="Search the model" style={ls.gap}>
        <TextField
          value={d.model}
          onChangeText={type}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder="e.g. iPhone 15 Pro, MacBook Air M2"
          autoCorrect={false}
          returnKeyType="search"
          clearButtonMode="while-editing"
          accessibilityLabel="Search the model"
        />
      </Field>

      {searching && !results.length ? (
        <View style={s.searching}>
          <ActivityIndicator size="small" color={G.muted} />
          <Text style={ls.muted}>Looking for it…</Text>
        </View>
      ) : null}

      {showList ? (
        <GlassCard style={[ls.card, s.list]}>
          {results.map((m, i) => (
            <Pressable
              key={m.id}
              onPress={() => pick(m)}
              style={({ pressed }) => [s.row, i < results.length - 1 && s.rowLine, pressed && s.pressed]}
              accessibilityRole="button"
              accessibilityLabel={m.name}
            >
              <View style={s.rowBody}>
                <Text style={s.rowTitle}>{m.name}</Text>
                {profileByKey(m.profile) ? <Text style={s.rowSub}>{profileByKey(m.profile)!.label}</Text> : null}
              </View>
              <Ionicons name="chevron-forward" size={16} color={G.faint} />
            </Pressable>
          ))}
        </GlassCard>
      ) : null}

      {showKinds ? (
        <View style={ls.gapSm}>
          <Question>What kind is it?</Question>
          <ChipGroup options={kinds.map(k => ({ key: k.key, label: k.label }))} value={d.profile} onPick={pickKind} />
        </View>
      ) : null}

      {ready && profile ? (
        <>
          <TintNote tone="green" icon="checkmark-circle" style={ls.gap}>
            <Strong>{profile.label}</Strong>
            {profile.identifier === 'none'
              ? ' — next, the specs.'
              : lookup
                ? ` — next we'll read the specs from its ${idWord(profile)} so you don't have to type them.`
                : ` — next we'll ask for its ${idWord(profile)}.`}
          </TintNote>
          {scannerAvailable && profile.identifier !== 'none' ? (
            <SecondaryButton label="Scan IMEI or serial number instead" onPress={onScan} style={s.scan} />
          ) : null}
        </>
      ) : null}

      <Text style={[ls.muted, s.cantFind]}>Can't find your model? Pick "Other" — our team adds new models within a day.</Text>
    </>
  );
};

/** Typed model in a one-kind category still has its kind. */
const kindsFor = (cat: ListingCategoryKey | null) => {
  const only = cat ? profilesForCategory(cat) : [];
  return only.length === 1 ? only[0].key : null;
};

const s = StyleSheet.create({
  pressed: { opacity: 0.7 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 10 },
  searching: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: -4 },
  list: { marginTop: -4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 13 },
  rowLine: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(28,31,42,0.08)' },
  rowBody: { flex: 1, gap: 2 },
  rowTitle: { color: G.ink, fontSize: 15, fontFamily: fonts.medium },
  rowSub: { color: G.muted, fontSize: 13, fontFamily: fonts.regular },
  scan: { marginTop: 12, height: 52 },
  cantFind: { marginTop: 16 },
});
