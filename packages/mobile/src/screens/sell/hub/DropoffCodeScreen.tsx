import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { GlassScreen, GlassHeader, FooterBar, SecondaryButton, useNow } from '../../../components/glass';
import { LoadingScreen } from '../store/shared';
import { Timeline, TimelineStep, whenLabel } from '../onboarding/kit';
import type { HubView } from '../../../services/sellerHub.service';
import { QrCode, byLabel, hs, useHubView } from './shared';

/**
 * "Show this at the hub" (route 'HubDropoffCode', { orderId }): the order number as a QR code for
 * hub staff to scan, and where it is: code ready → checked in at the hub → inspection.
 */

const stepsOf = (v: HubView, now: number): TimelineStep[] => {
  const checkedIn = !!v.checked_in_at;
  const checked = !!v.inspection;
  return [
    { title: 'Code ready', sub: v.order_number, state: 'done' },
    {
      title: 'Checked in at hub',
      sub: checkedIn
        ? whenLabel(v.checked_in_at)
        : v.dropoff_due_at
          ? `Waiting for drop-off · by ${byLabel(v.dropoff_due_at, now)}`
          : 'Waiting for drop-off',
      state: checkedIn ? 'done' : 'current',
    },
    {
      title: 'Inspection',
      sub: checked ? (v.inspection!.result === 'passed' ? 'Passed' : "Didn't pass") : 'Usually same day',
      state: checked ? 'done' : checkedIn ? 'current' : 'todo',
    },
  ];
};

export const DropoffCodeScreen: React.FC<{ navigation: any; route: { params?: { orderId?: string } } }> = ({
  navigation,
  route,
}) => {
  const orderId = route.params?.orderId ?? '';
  const now = useNow(30_000);
  const { view, error, load } = useHubView(orderId);
  if (!view)
    return <LoadingScreen title="Drop-off code" onBack={() => navigation.goBack()} failed={error} onRetry={load} />;

  const checked = !!view.inspection;
  return (
    <GlassScreen>
      <GlassHeader title="Drop-off code" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={hs.content} showsVerticalScrollIndicator={false}>
        <Text style={hs.centerTitle} accessibilityRole="header">
          Show this at the hub
        </Text>
        <View style={hs.gap}>
          <QrCode value={view.order_number} />
        </View>
        <Text style={hs.bigCode} selectable accessibilityLabel={`Code ${view.order_number.split('').join(' ')}`}>
          {view.order_number}
        </Text>
        <Text style={[hs.lead, { marginBottom: 18 }]}>
          Our hub staff scan this to log your item. You'll get a notification the moment it's checked in.
        </Text>
        <Timeline steps={stepsOf(view, now)} />
        <Text style={[hs.centerCaption, hs.gap]}>
          {view.hub.address} · {view.hub.hours}
        </Text>
      </ScrollView>
      {checked ? (
        <FooterBar>
          <SecondaryButton
            label="See the hub check"
            onPress={() => navigation.navigate('HubInspection', { orderId })}
          />
        </FooterBar>
      ) : null}
    </GlassScreen>
  );
};
