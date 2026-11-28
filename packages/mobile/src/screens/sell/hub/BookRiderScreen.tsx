import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  G,
  GlassScreen,
  GlassHeader,
  GlassCard,
  PrimaryButton,
  SecondaryButton,
  FooterBar,
} from '../../../components/glass';
import { BottomSheet } from '../../../components/motion';
import { fonts } from '../../../constants';
import { LoadingScreen } from '../store/shared';
import { IconImage, Label, Note } from '../onboarding/kit';
import { RadioCard } from '../case/shared';
import { HubError, RiderOptions, sellerHubService } from '../../../services/sellerHub.service';
import { HUB_ICONS, ItemRow, KeyRow, errText, hs, naira, toast, useHubView } from './shared';

/**
 * "Book a rider" (route 'BookRider', { orderId }): where we pick it up, when (only times that still
 * reach the hub by the drop-off deadline), who the rider asks for, and the fee off this sale's payout.
 */
export const BookRiderScreen: React.FC<{ navigation: any; route: { params?: { orderId?: string } } }> = ({
  navigation,
  route,
}) => {
  const orderId = route.params?.orderId ?? '';
  const { view, error, load } = useHubView(orderId);
  const [options, setOptions] = useState<RiderOptions | null>(null);
  const [optionsError, setOptionsError] = useState<string | null>(null);
  const [slot, setSlot] = useState<string | null>(null);
  const [contact, setContact] = useState<number>(0);
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);

  const loadOptions = useCallback(async () => {
    try {
      const o = await sellerHubService.riderOptions(orderId);
      setOptions(o);
      setOptionsError(null);
      setSlot(cur =>
        cur && o.slots.some(s => s.key === cur)
          ? cur
          : o.current && o.slots.some(s => s.key === o.current!.key)
            ? o.current.key
            : (o.slots[0]?.key ?? null)
      );
      if (o.current) {
        const i = o.contacts.findIndex(c => c.phone === o.current!.contact_phone);
        if (i >= 0) setContact(i);
      }
    } catch (e) {
      setOptionsError(errText(e, "We couldn't load pickup times."));
    }
  }, [orderId]);

  useEffect(() => {
    loadOptions();
  }, [loadOptions]);

  if (!view || !options) {
    return (
      <LoadingScreen
        title="Book a rider"
        onBack={() => navigation.goBack()}
        failed={error ?? optionsError}
        onRetry={() => {
          load();
          loadOptions();
        }}
      />
    );
  }

  const who = options.contacts[contact] ?? null;
  const ready = !!slot && !!who && !!options.pickup_from;

  const book = async () => {
    if (!slot || !who) return;
    setBusy(true);
    try {
      const res = await sellerHubService.bookRider(orderId, { slot, contact_name: who.name, contact_phone: who.phone });
      toast(`Rider booked · ${res.rider?.label ?? 'we’ll be in touch'}`, 'success');
      navigation.navigate('SellerOrder', { orderId });
    } catch (e) {
      toast(errText(e));
      if (e instanceof HubError && e.code === 'SLOT_GONE') loadOptions();
    } finally {
      setBusy(false);
    }
  };

  return (
    <GlassScreen>
      <GlassHeader title="Book a rider" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={hs.content} showsVerticalScrollIndicator={false}>
        <ItemRow
          title={view.item.title}
          image={view.item.image}
          sub={`Order ${view.order_number}${options.deadline_label ? ` · must reach the hub by ${options.deadline_label}` : ''}`}
        />

        <Label style={hs.section}>Pick up from</Label>
        {options.pickup_from ? (
          <GlassCard style={[hs.card, hs.itemRow]}>
            <View style={styles.storeTile}>
              <IconImage source={HUB_ICONS.store} size={26} />
            </View>
            <View style={hs.flex}>
              <Text style={hs.itemTitle}>Your shop</Text>
              <Text style={hs.sub}>{options.pickup_from}</Text>
            </View>
          </GlassCard>
        ) : (
          <>
            <Note tone="amber">Add your shop number and plaza in Store details so the rider can find you.</Note>
            <SecondaryButton
              label="Open Store details"
              onPress={() => navigation.navigate('StoreDetails')}
              style={hs.gap}
            />
          </>
        )}

        <Label style={hs.section}>When?</Label>
        {options.slots.length ? (
          <View style={styles.options} accessibilityRole="radiogroup">
            {options.slots.map(s => (
              <RadioCard key={s.key} on={slot === s.key} title={s.title} sub={s.sub} onPress={() => setSlot(s.key)} />
            ))}
          </View>
        ) : (
          <Note tone="amber">
            {`No rider can reach the hub by ${options.deadline_label ?? 'the deadline'} now. Drop it off yourself instead.`}
          </Note>
        )}

        <Text style={[hs.question, styles.ask]}>Who should the rider ask for?</Text>
        <Pressable
          onPress={() => setPicking(true)}
          disabled={options.contacts.length < 2}
          style={({ pressed }) => [styles.field, pressed && hs.pressed]}
          accessibilityRole="button"
          accessibilityLabel={`Rider asks for ${who?.label ?? 'nobody yet'}. Change`}
        >
          <Text style={styles.fieldText}>{who?.label ?? 'Add someone in Store staff'}</Text>
          {options.contacts.length > 1 ? <Ionicons name="chevron-down" size={18} color={G.faint} /> : null}
        </Pressable>

        <GlassCard style={[hs.rows, hs.gap]}>
          <KeyRow k="Pickup to hub" v={naira(options.fee)} />
          <KeyRow k="Paid from" v={options.paid_from} last />
        </GlassCard>
      </ScrollView>
      <FooterBar>
        <PrimaryButton label={busy ? 'Booking…' : 'Book rider'} onPress={book} disabled={!ready || busy} />
      </FooterBar>

      <BottomSheet visible={picking} onClose={() => setPicking(false)}>
        <Text style={styles.sheetTitle}>Who should the rider ask for?</Text>
        <View style={[styles.options, hs.gap]} accessibilityRole="radiogroup">
          {options.contacts.map((c, i) => (
            <RadioCard
              key={c.phone}
              on={contact === i}
              title={c.name}
              sub={`${c.role === 'owner' ? 'Business owner' : 'Store staff'} · ${c.label.split(' · ')[1] ?? c.phone}`}
              onPress={() => {
                setContact(i);
                setPicking(false);
              }}
            />
          ))}
        </View>
      </BottomSheet>
    </GlassScreen>
  );
};

const styles = StyleSheet.create({
  options: { gap: 10 },
  storeTile: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#F1F5FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ask: { marginTop: 22, marginBottom: 10 },
  field: {
    minHeight: 52,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(28,31,42,0.08)',
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  fieldText: { color: G.ink, fontSize: 16, fontFamily: fonts.regular, fontVariant: ['tabular-nums'] },
  sheetTitle: { color: G.ink, fontSize: 19, fontFamily: fonts.medium },
});
