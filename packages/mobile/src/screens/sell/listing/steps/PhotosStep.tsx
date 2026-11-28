import React from 'react';
import { View, Text, Image, Pressable, StyleSheet, ActivityIndicator, ActionSheetIOS, Alert, Platform, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { photoSlotsFor, missingPhotos, type PhotoSlot } from '@gadget-bidding/shared';
import { AuthTitle } from '../../../../components/auth/GlassAuthKit';
import { G, GlassCard } from '../../../../components/glass';
import { fonts } from '../../../../constants';
import { mediaUrl } from '../../../../utils';
import { listingService, pickListingPhoto, takeListingPhoto, type PickedPhoto } from '../../../../services/listing.service';
import { Eyebrow, Ticks } from '../../onboarding/kit';
import { RequiredTag, listingStyles as ls } from '../kit';
import { hasDamage } from '../draft';
import { StepProps, errMsg, toast } from './types';

const GAP = 10;

/** Slots that are a screenshot or a photo of a settings screen. */
const isScreenSlot = (sl: PhotoSlot) =>
  ['about', 'parts_history', 'specs', 'serial'].includes(sl.key) || (sl.key === 'battery' && /screen|system|report|health/i.test(sl.label));

const listWords = (w: string[]) => (w.length <= 1 ? w.join('') : `${w.slice(0, -1).join(', ')} and ${w[w.length - 1]}`);

/** Step 6 · Photos: one per slot, uploaded as soon as it's picked. */
export const PhotosStep: React.FC<
  StepProps & {
    eyebrow: string;
    uploading: Record<string, string>;
    setUploading: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  }
> = ({ d, set, profile, eyebrow, uploading, setUploading }) => {
  const { width } = useWindowDimensions();
  if (!profile) return null;

  const damage = hasDamage(d);
  const slots = photoSlotsFor(profile, damage);
  const missing = missingPhotos(profile, d.photos, damage);
  const added = slots.filter(sl => d.photos[sl.key]).length;
  const size = Math.floor((width - 40 - GAP * 2) / 3);
  const screens = slots.filter(isScreenSlot).map(sl => sl.label);

  const upload = async (slot: PhotoSlot, pick: () => Promise<PickedPhoto | null>) => {
    let photo: PickedPhoto | null;
    try {
      photo = await pick();
    } catch (e) {
      toast(errMsg(e));
      return;
    }
    if (!photo) return;
    setUploading(u => ({ ...u, [slot.key]: photo!.uri }));
    try {
      const url = await listingService.uploadPhoto(photo);
      set(prev => ({ photos: { ...prev.photos, [slot.key]: url } }));
    } catch (e) {
      toast(errMsg(e));
    } finally {
      setUploading(u => {
        const next = { ...u };
        delete next[slot.key];
        return next;
      });
    }
  };

  const remove = (slot: PhotoSlot) =>
    set(prev => {
      const photos = { ...prev.photos };
      delete photos[slot.key];
      return { photos };
    });

  const choose = (slot: PhotoSlot) => {
    if (uploading[slot.key]) return;
    const filled = !!d.photos[slot.key];
    const choices: [string, () => void][] = [
      [filled ? 'Take a new photo' : 'Take a photo', () => upload(slot, takeListingPhoto)],
      [filled ? 'Choose another photo' : 'Choose a photo', () => upload(slot, pickListingPhoto)],
      ...(filled ? ([['Remove', () => remove(slot)]] as [string, () => void][]) : []),
    ];
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          title: slot.label,
          options: [...choices.map(c => c[0]), 'Cancel'],
          cancelButtonIndex: choices.length,
          destructiveButtonIndex: filled ? 2 : undefined,
        },
        i => {
          if (i < choices.length) choices[i][1]();
        }
      );
    } else {
      Alert.alert(slot.label, undefined, [
        ...choices.map(([text, fn]) => ({ text, onPress: fn, style: text === 'Remove' ? ('destructive' as const) : undefined })),
        { text: 'Cancel', style: 'cancel' as const },
      ]);
    }
  };

  return (
    <>
      <Eyebrow>{eyebrow}</Eyebrow>
      <AuthTitle title="Add clear photos" sub="Real photos of this exact item. Stock images get sent back." />

      <View style={s.grid}>
        {slots.map(sl => {
          const url = d.photos[sl.key];
          const local = uploading[sl.key];
          const required = sl.required || (sl.ifDamage && damage);
          const src = local ?? (url ? mediaUrl(url) : null);
          return (
            <Pressable
              key={sl.key}
              onPress={() => choose(sl)}
              style={({ pressed }) => [{ width: size }, pressed && s.pressed]}
              accessibilityRole="button"
              accessibilityLabel={`${sl.label}${required ? ', required' : ''}${url ? ', added. Tap to change' : ''}`}
            >
              <GlassCard style={[s.slot, { height: size }]}>
                {src ? (
                  <>
                    <Image source={{ uri: src }} style={[s.image, local ? s.dim : null]} resizeMode="cover" />
                    {local ? (
                      <View style={s.center}>
                        <ActivityIndicator color={G.ink} />
                      </View>
                    ) : (
                      <View style={s.done}>
                        <Ionicons name="checkmark" size={12} color="#FFFFFF" />
                      </View>
                    )}
                  </>
                ) : (
                  <View style={s.empty}>
                    <Ionicons name="add" size={22} color={G.blue} />
                    <Text style={s.slotLabel} numberOfLines={3}>
                      {sl.label}
                    </Text>
                    {required ? <RequiredTag /> : null}
                  </View>
                )}
              </GlassCard>
              {src ? (
                <Text style={s.under} numberOfLines={1}>
                  {sl.label}
                </Text>
              ) : null}
            </Pressable>
          );
        })}
      </View>

      <Text style={[ls.muted, s.count]}>
        {`${added} of ${slots.length} added`}
        {missing.length ? ' · add the ones marked Required' : ''}
      </Text>

      <GlassCard style={s.tips}>
        <Text style={s.tipsTitle}>Tips for faster approval</Text>
        <Ticks
          items={[
            'Good daylight, plain background',
            'Show scratches, cracks and replaced parts up close',
            ...(screens.length ? [`Screenshots: ${listWords(screens)}`] : []),
            'Photo slots change for laptops, consoles and audio',
          ]}
        />
      </GlassCard>
    </>
  );
};

const s = StyleSheet.create({
  pressed: { opacity: 0.7 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP },
  slot: { overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  image: { ...StyleSheet.absoluteFillObject, borderRadius: 17 },
  dim: { opacity: 0.5 },
  center: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  done: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: G.green,
    alignItems: 'center',
    justifyContent: 'center',
  },
  empty: { alignItems: 'center', gap: 4, paddingHorizontal: 6 },
  slotLabel: { color: G.ink, fontSize: 12, lineHeight: 15, fontFamily: fonts.medium, textAlign: 'center' },
  under: { color: G.slate, fontSize: 12, fontFamily: fonts.regular, marginTop: 4, textAlign: 'center' },
  count: { marginTop: 14 },
  tips: { padding: 16, marginTop: 20, gap: 12 },
  tipsTitle: { color: G.ink, fontSize: 15, fontFamily: fonts.medium },
});
