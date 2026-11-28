import React, { useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import {
  GlassScreen,
  GlassHeader,
  GlassCard,
  PrimaryButton,
  SecondaryButton,
  FooterBar,
} from '../../../components/glass';
import { LoadingScreen } from '../store/shared';
import { Label } from '../onboarding/kit';
import { RadioCard } from '../case/shared';
import { TickRow } from '../listing/kit';
import { RiderOptions, sellerHubService } from '../../../services/sellerHub.service';
import { HubCard, errText, hs, naira, toast, useHubView } from './shared';

/**
 * "How will it get to us?" (route 'SendToHub', { orderId }): drop it off (free, then the drop-off code)
 * or a rider from the shop (fee off this sale's payout, then Book a rider), after ticking the list.
 */

const BEFORE_YOU_GO = [
  'Signed out of iCloud / Google and reset',
  'Packed everything listed (box, cable)',
  'Charged to at least 50%',
  'SIM and memory card removed',
];

export const SendToHubScreen: React.FC<{ navigation: any; route: { params?: { orderId?: string } } }> = ({
  navigation,
  route,
}) => {
  const orderId = route.params?.orderId ?? '';
  const { view, error, load } = useHubView(orderId);
  const [rider, setRider] = useState<RiderOptions | null>(null);
  const [method, setMethod] = useState<'dropoff' | 'rider' | null>(null);
  const [ticks, setTicks] = useState<boolean[] | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!view) return;
    setMethod(m => m ?? view.method ?? 'dropoff');
    setTicks(t => t ?? BEFORE_YOU_GO.map(() => !!view.checklist_done_at));
  }, [view]);

  useEffect(() => {
    if (!view?.can_send) return;
    sellerHubService
      .riderOptions(orderId)
      .then(setRider)
      .catch(() => setRider(null));
  }, [orderId, view?.can_send]);

  if (!view || !ticks || !method) {
    return <LoadingScreen title="Send to hub" onBack={() => navigation.goBack()} failed={error} onRetry={load} />;
  }

  if (!view.can_send) {
    return (
      <GlassScreen>
        <GlassHeader title="Send to hub" onBack={() => navigation.goBack()} />
        <View style={hs.content}>
          <GlassCard style={hs.card}>
            <Text style={hs.question}>
              {view.stage === 'on_its_way'
                ? 'The rider has it. It’s on its way to the hub.'
                : 'This order is already past this step.'}
            </Text>
          </GlassCard>
          <SecondaryButton label="Back to the order" onPress={() => navigation.goBack()} style={hs.gap} />
        </View>
      </GlassScreen>
    );
  }

  const riderSlots = rider?.slots.length ?? 0;
  const riderOff = !!rider && (!riderSlots || !rider.pickup_from);
  const riderSub = !rider
    ? 'Picked up within 2 hours'
    : !rider.pickup_from
      ? 'Add your shop address in Store details first'
      : !riderSlots
        ? `No rider can reach the hub by ${rider.deadline_label ?? 'the deadline'}`
        : rider.slots[0].key === 'asap'
          ? 'Picked up within 2 hours'
          : `Next pickup: ${rider.slots[0].title}`;
  const allTicked = ticks.every(Boolean);

  const go = async () => {
    if (method === 'rider') {
      navigation.navigate('BookRider', { orderId });
      return;
    }
    setBusy(true);
    try {
      await sellerHubService.dropOff(orderId);
      navigation.replace('HubDropoffCode', { orderId });
    } catch (e) {
      toast(errText(e));
      load();
    } finally {
      setBusy(false);
    }
  };

  return (
    <GlassScreen>
      <GlassHeader title="Send to hub" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={hs.content} showsVerticalScrollIndicator={false}>
        <Text style={hs.title} accessibilityRole="header">
          How will it get to us?
        </Text>
        <View style={[hs.gap, { gap: 10 }]} accessibilityRole="radiogroup">
          <RadioCard
            on={method === 'dropoff'}
            title="I'll drop it off"
            sub="Walk it to our hub in Computer Village"
            right="Free"
            onPress={() => setMethod('dropoff')}
          />
          <RadioCard
            on={method === 'rider'}
            title="Send a rider to my shop"
            sub={riderSub}
            right={naira(view.fees.rider_pickup)}
            onPress={() => setMethod('rider')}
            disabled={riderOff}
          />
        </View>

        <Label style={hs.section}>Before you go</Label>
        <GlassCard>
          {BEFORE_YOU_GO.map((item, i) => (
            <TickRow
              key={item}
              label={item}
              plain
              on={ticks[i]}
              last={i === BEFORE_YOU_GO.length - 1}
              onToggle={() => setTicks(t => t!.map((v, j) => (j === i ? !v : v)))}
            />
          ))}
        </GlassCard>

        <HubCard hub={view.hub} style={hs.gap} />
      </ScrollView>
      <FooterBar>
        <PrimaryButton
          label={
            !allTicked
              ? 'Tick everything above'
              : busy
                ? 'Saving…'
                : method === 'rider'
                  ? 'Next: book a rider'
                  : 'Get my drop-off code'
          }
          onPress={go}
          disabled={!allTicked || busy || (method === 'rider' && riderOff)}
        />
      </FooterBar>
    </GlassScreen>
  );
};
