import React, { useState } from 'react';
import { View, Text, ScrollView, TextInput, Pressable, StyleSheet } from 'react-native';
import {
  G,
  GlassScreen,
  GlassHeader,
  GlassCard,
  GlassKeyboardView,
  FooterBar,
  PrimaryButton,
  TextButton,
  useNow,
} from '../../../components/glass';
import { timeLeftLong } from '../../../services/sellerTabs.service';
import { listingManageService } from '../../../services/listingManage.service';
import { CaseLoading, RadioCard } from '../case/shared';
import { Note } from '../onboarding/kit';
import { dangerStyles } from './EndListingScreen';
import { ItemCard, MoneyRow, errText, goToListings, k, naira, plural, toast, useManageView } from './kit';

type Choice = 'sell' | 'cancel';

/**
 * End early ('EndEarly', { auctionId }): bids are in. Sell now to the highest bidder (the auction
 * ends now and they get the usual time to pay), or cancel it because something is wrong with the item.
 */
export const EndEarlyScreen: React.FC<{ navigation: any; route: any }> = ({ navigation, route }) => {
  const auctionId: string = route.params?.auctionId;
  const { view: v, error, reload } = useManageView(auctionId);
  const now = useNow(1000);
  const [choice, setChoice] = useState<Choice | null>(null);
  const [detail, setDetail] = useState('');
  const [busy, setBusy] = useState(false);

  if (!v) return <CaseLoading title="End early" onBack={() => navigation.goBack()} error={error} onRetry={reload} />;

  const top = v.highest_bid;
  const money = v.if_sold_now;
  const canSell = !!top && top.reserve_met && v.status === 'active';
  const picked: Choice | null = choice ?? (canSell ? 'sell' : null);

  const sell = async () => {
    setBusy(true);
    try {
      const res = await listingManageService.sellNow(auctionId);
      if (res.order) {
        toast(`Sold to the highest bidder. They have ${v.payment_hours} hours to pay.`, 'success');
        navigation.replace('SellerOrder', { orderId: res.order.id });
      } else {
        toast('It’s ending now. You’ll get a notification when the order is ready.', 'success');
        goToListings(navigation, 'live');
      }
    } catch (e) {
      toast(errText(e));
      reload();
    } finally {
      setBusy(false);
    }
  };

  const cancel = async () => {
    setBusy(true);
    try {
      await listingManageService.cancelForProblem(auctionId, detail.trim() || undefined);
      toast('Auction cancelled. Every bidder has been told.', 'success');
      goToListings(navigation, 'unsold');
    } catch (e) {
      toast(errText(e));
      reload();
    } finally {
      setBusy(false);
    }
  };

  const lines = [
    top ? `Highest bid ${naira(top.amount)} · ${plural(v.bids, 'bid')}` : `${plural(v.bids, 'bid')}`,
    v.end_time && v.status === 'active' ? `Ends in ${timeLeftLong(v.end_time, now)} anyway` : '',
  ];

  return (
    <GlassScreen>
      <GlassHeader title="End early" onBack={() => navigation.goBack()} />
      <GlassKeyboardView>
        <ScrollView
          contentContainerStyle={k.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <ItemCard image={v.image} title={v.title} lines={lines} />
          <Text style={k.h1}>How do you want to end it?</Text>

          <View style={[k.options, styles.options]} accessibilityRole="radiogroup">
            <RadioCard
              on={picked === 'sell'}
              title="Sell now to the highest bidder"
              sub={
                !top
                  ? 'Nobody has bid yet.'
                  : !top.reserve_met
                    ? `The highest bid is under your lowest price${v.reserve_price ? ` of ${naira(v.reserve_price)}` : ''}, so it can't sell now.`
                    : `End the auction at ${naira(top.amount)}. They have ${v.payment_hours} hours to pay.`
              }
              onPress={() => setChoice('sell')}
              disabled={!canSell}
            />
            <RadioCard
              on={picked === 'cancel'}
              title="Cancel the auction"
              sub="Only if something is wrong with the item"
              onPress={() => setChoice('cancel')}
            />
          </View>

          {picked === 'sell' && money ? (
            <GlassCard style={[k.card, styles.gap]}>
              <MoneyRow k="Highest bid" v={naira(money.sale)} />
              <MoneyRow k={`Platform fee (${money.fee_label})`} v={`−${naira(money.fee)}`} />
              <MoneyRow k="You'd receive" v={naira(money.you_receive)} strong last />
            </GlassCard>
          ) : null}

          {picked === 'cancel' ? (
            <>
              <Note tone="amber" style={styles.gap}>
                Nobody wins. Every bidder gets their bid hold back and is told why. Our team looks at every auction
                cancelled after bids.
              </Note>
              <Text style={k.label}>What's wrong with it? (optional)</Text>
              <TextInput
                value={detail}
                onChangeText={setDetail}
                multiline
                maxLength={300}
                style={[k.input, styles.textarea]}
                placeholder="e.g. I found a crack under the case"
                placeholderTextColor={G.faint}
                accessibilityLabel="What's wrong with it"
                textAlignVertical="top"
              />
            </>
          ) : null}
        </ScrollView>
        <FooterBar>
          {picked === 'cancel' ? (
            <Pressable
              onPress={cancel}
              disabled={busy}
              style={({ pressed }) => [
                dangerStyles.danger,
                busy && dangerStyles.dangerOff,
                pressed && dangerStyles.dangerPressed,
              ]}
              accessibilityRole="button"
            >
              <Text style={dangerStyles.dangerText}>{busy ? 'Cancelling…' : 'Cancel the auction'}</Text>
            </Pressable>
          ) : (
            <PrimaryButton
              label={busy ? 'Ending…' : top ? `End now and sell for ${naira(top.amount)}` : 'End now and sell'}
              onPress={sell}
              disabled={busy || !canSell || picked !== 'sell'}
            />
          )}
          <TextButton label="Keep it running" onPress={() => navigation.goBack()} />
        </FooterBar>
      </GlassKeyboardView>
    </GlassScreen>
  );
};

const styles = StyleSheet.create({
  options: { marginTop: 18 },
  gap: { marginTop: 16 },
  textarea: { minHeight: 90, paddingTop: 14, paddingBottom: 14, lineHeight: 22 },
});
