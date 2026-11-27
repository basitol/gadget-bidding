import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { G, GlassScreen, GlassHeader, GlassCard, GadgetImage, PrimaryButton, FooterBar, timeLeft, useNow } from '../../components/glass';
import { fonts } from '../../constants';
import { api, auctionService } from '../../services';
import { useToastStore } from '../../store/toastStore';

const toast = (msg: string, type: 'success' | 'error' = 'success') => useToastStore.getState().show(msg, type);

const REASONS = [
  { key: 'stolen', title: 'It might be stolen', sub: 'IMEI, iCloud lock or the price looks wrong' },
  { key: 'fake', title: 'It looks fake or copied', sub: 'Photos or details from somewhere else' },
  { key: 'wrong_details', title: 'Details are wrong', sub: 'Wrong model, storage or condition' },
  { key: 'other', title: 'Something else', sub: null },
] as const;
type Reason = (typeof REASONS)[number]['key'];

/** Report a listing. Private: the seller never learns who reported it. */
export const ReportListingScreen: React.FC<{ navigation: any; route: any }> = ({ navigation, route }) => {
  const { auctionId } = route.params;
  const now = useNow(30_000);
  const [auction, setAuction] = useState<any>(null);
  const [seller, setSeller] = useState<{ code: string; verified_business?: boolean } | null>(null);
  const [reason, setReason] = useState<Reason | null>(null);
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);
  const scroll = useRef<ScrollView>(null);

  useEffect(() => {
    auctionService
      .getAuction(auctionId)
      .then(r => setAuction(r.data))
      .catch(() => {});
    api
      .get(`/auctions/${auctionId}/seller`)
      .then(r => setSeller(r.data.data))
      .catch(() => {});
  }, [auctionId]);

  const send = async () => {
    if (!reason || busy) return;
    setBusy(true);
    try {
      await api.post(`/auctions/${auctionId}/report`, { reason, details: details.trim() || undefined });
      toast("Thanks. Our team will look at it within a day. The seller won't know it was you.");
      navigation.goBack();
    } catch (e: any) {
      toast(e?.response?.data?.error || e?.message || "We couldn't send your report. Try again.", 'error');
    } finally {
      setBusy(false);
    }
  };

  const ended = auction && new Date(auction.end_time).getTime() <= now;

  return (
    <GlassScreen>
      <GlassHeader title="Report listing" onBack={() => navigation.goBack()} />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView ref={scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <GlassCard style={styles.item}>
            <GadgetImage uri={auction?.gadget?.images?.[0]} size={56} style={styles.thumb} />
            <View style={styles.flex}>
              <Text style={styles.itemTitle} numberOfLines={1}>
                {auction?.gadget?.title ?? ' '}
              </Text>
              {seller ? (
                <Text style={styles.itemSub}>
                  {seller.verified_business ? 'Verified seller' : 'Seller'} {seller.code}
                </Text>
              ) : null}
              {auction ? (
                <Text style={styles.itemSub}>{ended ? 'Ended' : `Ends in ${timeLeft(auction.end_time, now)}`}</Text>
              ) : null}
            </View>
          </GlassCard>

          <Text style={styles.title} accessibilityRole="header">
            What's wrong?
          </Text>
          <Text style={styles.lead}>Reports are private. The seller won't know it was you.</Text>

          <View style={styles.options} accessibilityRole="radiogroup">
            {REASONS.map(r => {
              const on = reason === r.key;
              return (
                <Pressable
                  key={r.key}
                  onPress={() => setReason(r.key)}
                  style={({ pressed }) => [styles.option, on && styles.optionOn, pressed && styles.pressed]}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={r.sub ? `${r.title}. ${r.sub}` : r.title}
                >
                  <View style={[styles.radio, on && styles.radioOn]}>{on ? <View style={styles.radioDot} /> : null}</View>
                  <View style={styles.flex}>
                    <Text style={styles.optionTitle}>{r.title}</Text>
                    {r.sub ? <Text style={styles.optionSub}>{r.sub}</Text> : null}
                  </View>
                </Pressable>
              );
            })}
          </View>

          <Text style={styles.label}>
            Tell us more <Text style={styles.optional}>(optional)</Text>
          </Text>
          <TextInput
            value={details}
            onChangeText={t => setDetails(t.slice(0, 1000))}
            placeholder="e.g. The same photos are on another site with a different seller"
            placeholderTextColor={G.faint}
            multiline
            textAlignVertical="top"
            // The box sits below the fold: bring it up above the keyboard.
            onFocus={() => setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 250)}
            style={styles.textarea}
            accessibilityLabel="Tell us more, optional"
          />
        </ScrollView>
        <FooterBar>
          <PrimaryButton label={busy ? 'Sending…' : 'Send report'} onPress={send} disabled={!reason || busy} />
        </FooterBar>
      </KeyboardAvoidingView>
    </GlassScreen>
  );
};

const styles = StyleSheet.create({
  flex: { flex: 1 },
  pressed: { opacity: 0.75 },
  content: { paddingHorizontal: 20, paddingBottom: 40 },

  item: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14 },
  thumb: { width: 56, height: 56, borderRadius: 12 },
  itemTitle: { color: G.ink, fontSize: 16, fontFamily: fonts.medium },
  itemSub: { color: G.slate, fontSize: 13, fontFamily: fonts.regular, marginTop: 3 },

  title: { color: G.ink, fontSize: 26, lineHeight: 32, letterSpacing: -0.52, fontFamily: fonts.medium, marginTop: 22 },
  lead: { color: G.muted, fontSize: 15, lineHeight: 22, fontFamily: fonts.regular, marginTop: 6, marginBottom: 16 },

  options: { gap: 10 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.56)',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.75)',
  },
  optionOn: { borderColor: '#A9BBFF', backgroundColor: 'rgba(255,255,255,0.85)' },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: '#C9CEDA', alignItems: 'center', justifyContent: 'center' },
  radioOn: { borderColor: G.blue, backgroundColor: G.blue },
  radioDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#FFFFFF' },
  optionTitle: { color: G.ink, fontSize: 15, fontFamily: fonts.medium },
  optionSub: { color: G.muted, fontSize: 13, fontFamily: fonts.regular, marginTop: 2 },

  label: { color: G.slate, fontSize: 14, fontFamily: fonts.medium, marginTop: 20, marginBottom: 8 },
  optional: { color: G.muted, fontFamily: fonts.regular },
  textarea: {
    minHeight: 104,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 14,
    fontSize: 16,
    lineHeight: 22,
    fontFamily: fonts.regular,
    color: G.ink,
    borderWidth: 1,
    borderColor: '#EDEFF4',
  },
});
