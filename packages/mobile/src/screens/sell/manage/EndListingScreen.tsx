import React, { useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import { G, GlassScreen, GlassHeader, FooterBar, TextButton } from '../../../components/glass';
import { fonts } from '../../../constants';
import { listingManageService, EndReason } from '../../../services/listingManage.service';
import { CaseLoading } from '../case/shared';
import { Label } from '../onboarding/kit';
import { ItemCard, RadioRow, errText, goToListings, k, plural, toast, useManageView } from './kit';

const REASONS: { key: EndReason; label: string }[] = [
  { key: 'sold_elsewhere', label: 'I sold it in my shop' },
  { key: 'change_price', label: 'I want to change the price a lot' },
  { key: 'found_fault', label: 'I found a fault' },
  { key: 'other', label: 'Something else' },
];

/** End listing ('EndListing', { auctionId }): no bids, so it comes down for free. */
export const EndListingScreen: React.FC<{ navigation: any; route: any }> = ({ navigation, route }) => {
  const auctionId: string = route.params?.auctionId;
  const { view: v, error, reload } = useManageView(auctionId);
  const [reason, setReason] = useState<EndReason | null>(null);
  const [busy, setBusy] = useState(false);

  if (!v) return <CaseLoading title="End listing" onBack={() => navigation.goBack()} error={error} onRetry={reload} />;

  const end = async () => {
    if (!reason) return toast('Pick why you’re ending it.');
    setBusy(true);
    try {
      await listingManageService.end(auctionId, reason);
      toast('Listing ended', 'success');
      goToListings(navigation, 'unsold');
    } catch (e: any) {
      // Someone bid while this was open: ending early is the way now.
      if (e?.code === 'HAS_BIDS') {
        toast(errText(e));
        navigation.replace('EndEarly', { auctionId });
      } else toast(errText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <GlassScreen>
      <GlassHeader title="End listing" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={k.content} showsVerticalScrollIndicator={false}>
        <ItemCard
          image={v.image}
          title={v.title}
          lines={[`${v.bids ? plural(v.bids, 'bid') : 'No bids'} · ${v.watching} watching`]}
        />
        <Text style={k.h1}>End this listing?</Text>
        <Text style={k.lead}>
          It comes down straight away. Nobody has bid, so there's no fee and no effect on your rating.
        </Text>

        <Label style={styles.label}>Why? (helps us improve)</Label>
        <View style={k.options} accessibilityRole="radiogroup">
          {REASONS.map(r => (
            <RadioRow key={r.key} on={reason === r.key} label={r.label} onPress={() => setReason(r.key)} />
          ))}
        </View>
      </ScrollView>
      <FooterBar>
        <Pressable
          onPress={end}
          disabled={busy || !reason}
          style={({ pressed }) => [
            styles.danger,
            (busy || !reason) && styles.dangerOff,
            pressed && styles.dangerPressed,
          ]}
          accessibilityRole="button"
          accessibilityState={{ disabled: busy || !reason }}
        >
          <Text style={styles.dangerText}>{busy ? 'Ending…' : 'End listing'}</Text>
        </Pressable>
        <TextButton label="Keep it live" onPress={() => navigation.goBack()} />
      </FooterBar>
    </GlassScreen>
  );
};

export const dangerStyles = StyleSheet.create({
  danger: { height: 50, borderRadius: 14, backgroundColor: G.red, alignItems: 'center', justifyContent: 'center' },
  dangerOff: { backgroundColor: '#E6E9F1' },
  dangerPressed: { opacity: 0.85 },
  dangerText: { color: '#FFFFFF', fontSize: 15, fontFamily: fonts.medium },
});

const styles = StyleSheet.create({
  ...dangerStyles,
  label: { marginTop: 24, marginBottom: 10 },
});
