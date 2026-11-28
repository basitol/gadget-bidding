import React from 'react';
import { ScrollView, View } from 'react-native';
import { GlassScreen, GlassHeader, PrimaryButton, FooterBar, DueBanner, useNow } from '../../../components/glass';
import { LoadingScreen } from '../store/shared';
import { Hero, Timeline, TimelineStep, TINT } from '../onboarding/kit';
import { HUB_ICONS, ItemRow, MoneyCard, dayWord, hs, leftLabel, naira, useHubView } from './shared';
import type { HubView } from '../../../services/sellerHub.service';

/**
 * "Sold for ₦865,000!" (route 'SellerSold', { orderId }; the order screen shows the same until the
 * seller picks how it gets to the hub): the drop-off countdown, the item, the money and what happens next.
 */

type SoldOrder = Pick<HubView, 'order_number' | 'item' | 'money' | 'dropoff_due_at' | 'delivery_method'>;

const stepsOf = (o: SoldOrder, now: number): TimelineStep[] => {
  const by = o.dropoff_due_at ? dayWord(o.dropoff_due_at, now) : null;
  return [
    { title: 'Drop at hub', sub: by ? `Computer Village · ${by}` : 'Computer Village', state: 'current' },
    { title: 'Hub check', sub: 'Usually same day', state: 'todo' },
    o.delivery_method === 'pickup'
      ? { title: 'Buyer collects', sub: 'From the hub, once it passes', state: 'todo' }
      : { title: 'Delivered to buyer', sub: '1–2 days', state: 'todo' },
    { title: 'You get paid', sub: 'After the buyer confirms', state: 'todo' },
  ];
};

export const SoldView: React.FC<{ order: SoldOrder; navigation: any; orderId: string; onBack: () => void }> = ({
  order,
  navigation,
  orderId,
  onBack,
}) => {
  const now = useNow(30_000);
  const due = order.dropoff_due_at;
  const late = !!due && new Date(due).getTime() <= now;
  return (
    <GlassScreen>
      <GlassHeader title="Sold" onBack={onBack} />
      <ScrollView contentContainerStyle={hs.content} showsVerticalScrollIndicator={false}>
        <Hero
          icon={HUB_ICONS.tag}
          tint={TINT.green.bg}
          title={`Sold for ${naira(order.money.sale_price)}!`}
          sub="The buyer has paid and the money is held safely. Get it to our hub so we can check it."
        />
        {due ? (
          <DueBanner
            label={late ? 'Drop-off is overdue' : 'Drop it at the hub within'}
            value={late ? 'Now' : leftLabel(due, now)}
          />
        ) : null}
        <ItemRow
          title={order.item.title}
          image={order.item.image}
          sub={`Order ${order.order_number}${order.item.bids ? ` · ${order.item.bids} bid${order.item.bids === 1 ? '' : 's'}` : ''}`}
          style={hs.gap}
        />
        <MoneyCard money={order.money} style={hs.gap} />
        <View style={hs.gap}>
          <Timeline steps={stepsOf(order, now)} />
        </View>
      </ScrollView>
      <FooterBar>
        <PrimaryButton label="Send to hub" onPress={() => navigation.navigate('SendToHub', { orderId })} />
      </FooterBar>
    </GlassScreen>
  );
};

export const SoldScreen: React.FC<{ navigation: any; route: { params?: { orderId?: string } } }> = ({
  navigation,
  route,
}) => {
  const orderId = route.params?.orderId ?? '';
  const { view, error, load } = useHubView(orderId);
  if (!view) return <LoadingScreen title="Sold" onBack={() => navigation.goBack()} failed={error} onRetry={load} />;
  return <SoldView order={view} navigation={navigation} orderId={orderId} onBack={() => navigation.goBack()} />;
};
