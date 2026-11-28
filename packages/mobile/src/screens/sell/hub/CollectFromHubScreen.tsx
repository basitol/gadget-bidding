import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import {
  GlassScreen,
  GlassHeader,
  GlassCard,
  CheckList,
  DueBanner,
  FooterBar,
  SecondaryButton,
  useNow,
} from '../../../components/glass';
import { LoadingScreen } from '../store/shared';
import { Hero, TINT } from '../onboarding/kit';
import { HUB_ICONS, KeyRow, QrCode, dayLabel, hs, leftLabel, naira, shortTitle, useHubView } from './shared';

/**
 * "Collect your Galaxy S23" (route 'HubCollect', { orderId }): after a failed check the seller chose
 * to collect it. The CL- code as a QR for the hub counter, how long it's free, the hub and what to bring.
 */
export const CollectFromHubScreen: React.FC<{ navigation: any; route: { params?: { orderId?: string } } }> = ({
  navigation,
  route,
}) => {
  const orderId = route.params?.orderId ?? '';
  const now = useNow(60_000);
  const { view, error, load } = useHubView(orderId);
  if (!view)
    return <LoadingScreen title="Collect from hub" onBack={() => navigation.goBack()} failed={error} onRetry={load} />;

  const f = view.failed;
  const title = shortTitle(view.item.title);

  if (!f || f.choice !== 'collect' || f.returned_at) {
    return (
      <GlassScreen>
        <GlassHeader title="Collect from hub" onBack={() => navigation.goBack()} />
        <ScrollView contentContainerStyle={hs.content}>
          <Hero
            icon={HUB_ICONS.box}
            tint={TINT.fill}
            title={f?.returned_at ? `Your ${title} is back with you` : 'Nothing to collect'}
            sub={
              f?.returned_at
                ? `Handed back on ${dayLabel(f.returned_at)}.`
                : f?.choice === 'deliver'
                  ? 'Our rider is bringing it to your shop.'
                  : 'There’s no item waiting for you at the hub on this order.'
            }
          />
        </ScrollView>
        <FooterBar>
          <SecondaryButton label="Back" onPress={() => navigation.goBack()} />
        </FooterBar>
      </GlassScreen>
    );
  }

  const by = f.collect_by;
  const ended = !!by && new Date(by).getTime() <= now;

  return (
    <GlassScreen>
      <GlassHeader title="Collect from hub" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={hs.content} showsVerticalScrollIndicator={false}>
        <Text style={hs.centerTitle} accessibilityRole="header">
          Collect your {title}
        </Text>
        <Text style={hs.lead}>Show this code at the hub counter.</Text>
        <View style={hs.gap}>
          <QrCode value={f.collect_code} />
        </View>
        <Text style={hs.bigCode} selectable accessibilityLabel={`Code ${f.collect_code.split('').join(' ')}`}>
          {f.collect_code}
        </Text>

        {by ? (
          <DueBanner
            label={ended ? 'Free collection ended' : 'Free collection ends in'}
            value={ended ? `${naira(view.fees.storage_per_day)} a day` : leftLabel(by, now)}
            style={hs.gap}
          />
        ) : null}
        <Text style={[hs.caption, { marginTop: 8 }]}>
          {ended
            ? `Storage is ${naira(view.fees.storage_per_day)} a day now. Collect it soon.`
            : `After ${dayLabel(by!)}, storage is ${naira(view.fees.storage_per_day)} a day.`}
        </Text>

        <GlassCard style={[hs.rows, hs.gap]}>
          <KeyRow k="Hub" v={view.hub.address} />
          <KeyRow k="Open" v={view.hub.hours} />
          <KeyRow k="Order" v={`${view.order_number} · failed inspection`} last />
        </GlassCard>

        <GlassCard style={[hs.card, hs.gap]}>
          <Text style={hs.question}>Bring with you</Text>
          <CheckList
            items={[
              'This code on your phone',
              "ID of the business owner or a staff member you've added",
              'Something to carry it in — we hand it back as you dropped it off',
            ]}
            style={{ marginTop: 8 }}
          />
        </GlassCard>
      </ScrollView>
    </GlassScreen>
  );
};
