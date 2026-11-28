import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, TextInput, Pressable, Image, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { platformFeeFor } from '@gadget-bidding/shared';
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
import { mediaUrl } from '../../../utils';
import { listingManageService, daysLabel } from '../../../services/listingManage.service';
import { CaseLoading } from '../case/shared';
import { Label } from '../onboarding/kit';
import { ItemCard, addListingPhoto, errText, k, naira, toast, useManageView, weekdayTime } from './kit';

const digits = (v: string) => v.replace(/\D/g, '');

/**
 * Edit listing ('EditListing', { auctionId }): no bids yet, so the starting price, how long it runs,
 * the description and photos can change. New photos are checked by our team first. Grade, model and
 * IMEI stay locked (they were checked in review).
 */
export const EditListingScreen: React.FC<{ navigation: any; route: any }> = ({ navigation, route }) => {
  const auctionId: string = route.params?.auctionId;
  const { view: v, setView, error, reload } = useManageView(auctionId);
  const [price, setPrice] = useState('');
  const [hours, setHours] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [adding, setAdding] = useState(false);

  // Fill the form once, from the listing as it is now.
  useEffect(() => {
    if (v && !ready) {
      setPrice(String(v.starting_price));
      setHours(v.durations_hours.includes(v.run_hours) ? v.run_hours : null);
      setNote(v.note.text);
      setReady(true);
    }
  }, [v, ready]);

  // Someone bid while this was open: nothing here can change any more.
  useEffect(() => {
    if (v && !v.can_edit) {
      toast('Someone has bid, so the price and details are locked now.');
      navigation.goBack();
    }
  }, [v, navigation]);

  const start = Number(digits(price)) || 0;
  const fee = useMemo(() => platformFeeFor(start), [start]);

  if (!v || !ready)
    return <CaseLoading title="Edit listing" onBack={() => navigation.goBack()} error={error} onRetry={reload} />;

  const changed =
    start !== v.starting_price || (hours !== null && hours !== v.run_hours) || note.trim() !== v.note.text.trim();
  const endsAt = hours !== null && v.start_time ? new Date(new Date(v.start_time).getTime() + hours * 3_600_000) : null;
  const tooSoon = !!endsAt && v.status === 'active' && endsAt.getTime() < Date.now() + 3_600_000;
  const priceProblem =
    start < v.min_start_price
      ? `The starting price has to be at least ${naira(v.min_start_price)}.`
      : v.buy_now_price != null && start >= v.buy_now_price
        ? `Your buy-now price is ${naira(v.buy_now_price)}, so start below that.`
        : null;

  const save = async () => {
    if (priceProblem) return toast(priceProblem);
    if (tooSoon) return toast('That would end it within the hour. Pick a longer run.');
    setSaving(true);
    try {
      const body: { starting_price?: number; duration_hours?: number; note?: string } = {};
      if (start !== v.starting_price) body.starting_price = start;
      if (hours !== null && hours !== v.run_hours) body.duration_hours = hours;
      if (note.trim() !== v.note.text.trim()) body.note = note.trim();
      await listingManageService.edit(auctionId, body);
      toast('Changes saved', 'success');
      navigation.goBack();
    } catch (e) {
      toast(errText(e));
    } finally {
      setSaving(false);
    }
  };

  const addPhoto = async () => {
    setAdding(true);
    const next = await addListingPhoto(auctionId);
    setAdding(false);
    if (next) {
      setView(next);
      toast('Photo sent. Our team checks it before it shows.', 'success');
    }
  };

  const removePending = async (url: string) => {
    try {
      setView(await listingManageService.removePendingPhoto(auctionId, url));
    } catch (e) {
      toast(errText(e));
    }
  };

  const room = v.photos.length + v.pending_photos.length < v.max_photos;

  return (
    <GlassScreen>
      <GlassHeader title="Edit listing" onBack={() => navigation.goBack()} />
      <GlassKeyboardView>
        <ScrollView
          contentContainerStyle={k.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <ItemCard image={v.image} title={v.title} lines={['No bids yet · you can change anything']} />

          <Text style={k.label}>Starting price</Text>
          <View style={styles.priceBox}>
            <Text style={styles.currency}>₦</Text>
            <TextInput
              value={price ? Number(digits(price)).toLocaleString('en-NG') : ''}
              onChangeText={setPrice}
              keyboardType="number-pad"
              style={styles.priceInput}
              placeholder="0"
              placeholderTextColor={G.faint}
              accessibilityLabel="Starting price"
            />
          </View>
          <Text style={[k.caption, priceProblem && { color: G.red }]}>
            {priceProblem ?? `You'd receive ${naira(Math.max(0, start - fee))} at this price`}
          </Text>

          <Label style={styles.sectionLabel}>Run for</Label>
          <View style={styles.chips}>
            {v.durations_hours.map(h => (
              <Chip key={h} label={daysLabel(h)} selected={hours === h} onPress={() => setHours(h)} />
            ))}
          </View>
          {endsAt ? (
            <Text style={[k.caption, tooSoon && { color: G.red }]}>
              {tooSoon ? 'That would end it within the hour. Pick a longer run.' : `Ends ${weekdayTime(endsAt)}`}
            </Text>
          ) : null}

          <Text style={k.label}>Description</Text>
          <TextInput
            value={note}
            onChangeText={setNote}
            multiline
            maxLength={1000}
            style={[k.input, styles.textarea]}
            placeholder={
              v.note.mode === 'note'
                ? 'Anything buyers should know: how long you used it, what comes with it'
                : 'Describe it'
            }
            placeholderTextColor={G.faint}
            accessibilityLabel="Description"
            textAlignVertical="top"
          />
          {v.note.mode === 'note' ? (
            <Text style={k.caption}>Shown under the details we checked (grade, battery, repairs).</Text>
          ) : null}

          <Label style={styles.sectionLabel}>Photos</Label>
          <View style={styles.grid}>
            {v.photos.map(p => (
              <View key={p.url} style={styles.tile} accessible accessibilityLabel={`${p.label} photo`}>
                <Image source={{ uri: mediaUrl(p.url) }} style={styles.tileImage} />
                <Text style={styles.tileLabel} numberOfLines={1}>
                  {p.label}
                </Text>
              </View>
            ))}
            {v.pending_photos.map(url => (
              <View key={url} style={styles.tile}>
                <Image source={{ uri: mediaUrl(url) }} style={[styles.tileImage, styles.tilePending]} />
                <Text style={styles.tileLabel}>Checking</Text>
                <Pressable
                  onPress={() => removePending(url)}
                  style={styles.remove}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel="Remove this photo"
                >
                  <Ionicons name="close" size={14} color={G.ink} />
                </Pressable>
              </View>
            ))}
            {room ? (
              <Pressable
                onPress={adding ? undefined : addPhoto}
                style={({ pressed }) => [styles.tile, styles.addTile, pressed && k.pressed]}
                accessibilityRole="button"
                accessibilityLabel="Add a photo"
              >
                {adding ? <ActivityIndicator color={G.blue} /> : <Ionicons name="add" size={24} color={G.blue} />}
              </Pressable>
            ) : null}
          </View>
          <Text style={k.caption}>New photos show once our team has checked them.</Text>

          <GlassCard style={styles.locked}>
            <View style={k.flex}>
              <Text style={styles.lockedTitle}>Grade, model and IMEI</Text>
              <Text style={styles.lockedSub}>Locked after review. To change them, end and relist.</Text>
            </View>
            <Ionicons name="lock-closed-outline" size={18} color={G.muted} />
          </GlassCard>
        </ScrollView>
        <FooterBar>
          <PrimaryButton label={saving ? 'Saving…' : 'Save changes'} onPress={save} disabled={saving || !changed} />
        </FooterBar>
      </GlassKeyboardView>
    </GlassScreen>
  );
};

const styles = StyleSheet.create({
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
  sectionLabel: { marginTop: 22, marginBottom: 10 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  textarea: { minHeight: 110, paddingTop: 14, paddingBottom: 14, lineHeight: 22 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tile: {
    width: 72,
    height: 88,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  tileImage: { width: 72, height: 66, resizeMode: 'cover' },
  tilePending: { opacity: 0.55 },
  tileLabel: { color: G.blue600, fontSize: 11, fontFamily: fonts.medium, paddingHorizontal: 4, paddingVertical: 4 },
  addTile: { borderWidth: 1.5, borderStyle: 'dashed', borderColor: '#AFC0F6', backgroundColor: '#FFFFFF' },
  remove: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  locked: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, marginTop: 22 },
  lockedTitle: { color: G.ink, fontSize: 15, fontFamily: fonts.medium },
  lockedSub: { color: G.muted, fontSize: 13, lineHeight: 18, fontFamily: fonts.regular, marginTop: 2 },
});
