import React, { useCallback, useState } from 'react';
import { View, Text, Pressable, FlatList, ScrollView, StyleSheet, RefreshControl, ActivityIndicator, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { G, GlassScreen, GlassHeader, GlassCard, PillTabs, GadgetImage, useNow } from '../../../components/glass';
import { BottomSheet } from '../../../components';
import { fonts } from '../../../constants';
import { useReloadOnReconnect } from '../../../store/networkStore';
import { useToastStore } from '../../../store/toastStore';
import { formatCurrency } from '../../../utils';
import {
  sellerTabsService,
  OrderTab,
  SellerOrderCard,
  DropoffCode,
  Tone,
  byWhen,
  hoursLeft,
} from '../../../services/sellerTabs.service';
import { TINT } from '../onboarding/kit';

const toast = (m: string, t: 'success' | 'error' = 'error') => useToastStore.getState().show(m, t);
const msg = (e: unknown) => (e instanceof Error ? e.message : "That didn't work. Try again.");

const TONE: Record<Tone, { bg: string; text: string }> = {
  amber: TINT.amber,
  red: TINT.red,
  blue: TINT.blue,
  green: TINT.green,
  neutral: { bg: TINT.fill, text: G.slate },
};

const EMPTY: Record<OrderTab, string> = {
  todo: "Nothing to do right now. When something sells, you'll see it here.",
  progress: 'Nothing on its way right now.',
  done: 'Finished orders show here.',
};

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Seller orders: what to drop off or answer now, what's on its way, and what's finished. */
export const SellerOrdersScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const now = useNow(30_000);
  const [tab, setTab] = useState<OrderTab>('todo');
  const [items, setItems] = useState<SellerOrderCard[]>([]);
  const [counts, setCounts] = useState<Record<OrderTab, number>>({ todo: 0, progress: 0, done: 0 });
  const [dropoff, setDropoff] = useState<{ count: number; due_at: string | null } | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [codes, setCodes] = useState<DropoffCode[] | null>(null);

  const load = useCallback(async (t: OrderTab) => {
    try {
      const res = await sellerTabsService.orders(t);
      setItems(res.items);
      setCounts(res.counts);
      setDropoff(res.dropoff);
    } catch (e) {
      toast(msg(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load(tab);
    }, [load, tab])
  );
  useReloadOnReconnect(useCallback(() => load(tab), [load, tab]));

  const openCodes = async () => {
    try {
      setCodes(await sellerTabsService.dropoffCodes());
    } catch (e) {
      toast(msg(e));
    }
  };

  const sendToHub = (o: SellerOrderCard) =>
    Alert.alert('Handed it in at the hub?', "Tap this once the item is with our hub team. They'll check it against your listing.", [
      { text: 'Not yet', style: 'cancel' },
      {
        text: "Yes, it's at the hub",
        onPress: async () => {
          setBusy(o.id);
          try {
            await sellerTabsService.sendToHub(o.id);
            toast('Marked as dropped off', 'success');
            load(tab);
          } catch (e) {
            toast(msg(e));
          } finally {
            setBusy(null);
          }
        },
      },
    ]);

  const renderItem = ({ item: o }: { item: SellerOrderCard }) => {
    const tone = TONE[o.chip.tone];
    const replying = !!o.case?.respond_by;
    const dropping = !replying && !!o.dropoff_due_at;
    const middle = replying || o.case ? `case ${o.case!.number}` : dropping ? 'buyer paid' : null;
    const sub = [o.order_number, middle, `sold ${formatCurrency(o.sold_for)}`].filter(Boolean).join(' · ');
    const when = replying ? hoursLeft(o.case!.respond_by!, now) : dropping ? capital(byWhen(o.dropoff_due_at!, now)) : null;
    const urgentWhen = replying || (dropping && new Date(o.dropoff_due_at!).getTime() - now < 24 * 3_600_000);
    const open = () =>
      o.case ? navigation.navigate('SellerCase', { disputeId: o.case.id }) : navigation.navigate('SellerOrder', { orderId: o.id });

    return (
      <Pressable onPress={open} style={({ pressed }) => pressed && styles.pressed} accessibilityRole="button" accessibilityLabel={`${o.title}, ${o.chip.label}`}>
        <GlassCard style={styles.card}>
          <View style={styles.row}>
            <GadgetImage uri={o.image} size={52} style={styles.thumb} />
            <View style={styles.body}>
              <Text style={styles.title} numberOfLines={1}>
                {o.title}
              </Text>
              <Text style={styles.sub} numberOfLines={1}>
                {sub}
              </Text>
              <View style={[styles.chip, { backgroundColor: tone.bg }]}>
                <Text style={[styles.chipText, { color: tone.text }]}>{o.chip.label}</Text>
              </View>
            </View>
            <View style={styles.right}>
              <Text style={styles.amount}>{formatCurrency(o.payout)}</Text>
              {when ? <Text style={[styles.when, urgentWhen && styles.urgent]}>{when}</Text> : null}
            </View>
          </View>
          {dropping ? (
            <Pressable
              onPress={() => sendToHub(o)}
              disabled={busy === o.id}
              style={({ pressed }) => [styles.primary, pressed && styles.pressed]}
              accessibilityRole="button"
            >
              {busy === o.id ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryText}>Send to hub</Text>}
            </Pressable>
          ) : replying ? (
            <Pressable
              onPress={open}
              style={({ pressed }) => [styles.reply, pressed && styles.pressed]}
              accessibilityRole="button"
            >
              <Text style={styles.replyText}>Reply</Text>
            </Pressable>
          ) : null}
        </GlassCard>
      </Pressable>
    );
  };

  return (
    <GlassScreen>
      <GlassHeader title="Orders" />
      {dropoff ? (
        <Pressable onPress={openCodes} style={({ pressed }) => [styles.banner, pressed && styles.pressed]} accessibilityRole="button">
          <Text style={styles.bannerText} numberOfLines={1}>
            <Text style={styles.bannerStrong}>{dropoff.count} to drop off</Text>
            {dropoff.due_at ? ` · ${byWhen(dropoff.due_at, now)}` : ''}
          </Text>
          <Text style={styles.bannerLink}>Get code →</Text>
        </Pressable>
      ) : null}
      <View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
          <PillTabs
            value={tab}
            onChange={t => {
              setLoading(true);
              setItems([]);
              setTab(t);
            }}
            tabs={[
              { key: 'todo', label: 'To do', count: counts.todo },
              { key: 'progress', label: 'In progress', count: counts.progress },
              { key: 'done', label: 'Completed', count: counts.done },
            ]}
          />
        </ScrollView>
      </View>
      <FlatList
        data={items}
        keyExtractor={o => o.id}
        renderItem={renderItem}
        contentContainerStyle={styles.content}
        ItemSeparatorComponent={() => <View style={styles.gap} />}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor={G.blue}
            onRefresh={async () => {
              setRefreshing(true);
              await load(tab);
              setRefreshing(false);
            }}
          />
        }
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator color={G.blue} style={styles.loader} />
          ) : (
            <GlassCard style={styles.empty}>
              <Text style={styles.emptyText}>{EMPTY[tab]}</Text>
            </GlassCard>
          )
        }
      />

      <BottomSheet visible={!!codes} onClose={() => setCodes(null)}>
        <Text style={styles.sheetTitle}>Drop-off codes</Text>
        <Text style={styles.sheetSub}>
          Show these at our Computer Village hub. Our team checks each item against your listing before it goes to the buyer.
        </Text>
        {codes?.length ? (
          codes.map((c, i) => (
            <View key={c.order_id} style={[styles.codeRow, i < codes.length - 1 && styles.rowLine]}>
              <GadgetImage uri={c.image} size={40} style={styles.codeThumb} />
              <View style={styles.body}>
                <Text style={styles.code} selectable accessibilityLabel={`Code ${c.code.split('').join(' ')}`}>
                  {c.code}
                </Text>
                <Text style={styles.sub} numberOfLines={1}>
                  {c.title} · {byWhen(c.due_at, now)}
                </Text>
              </View>
            </View>
          ))
        ) : (
          <Text style={styles.emptyText}>Nothing to drop off right now.</Text>
        )}
      </BottomSheet>
    </GlassScreen>
  );
};

const styles = StyleSheet.create({
  pressed: { opacity: 0.75 },
  banner: {
    marginHorizontal: 20,
    marginBottom: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: TINT.amber.bg,
    borderWidth: 1,
    borderColor: TINT.amber.line,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  bannerText: { flex: 1, color: G.slate, fontSize: 13, fontFamily: fonts.regular },
  bannerStrong: { color: G.ink, fontFamily: fonts.medium },
  bannerLink: { color: TINT.amber.text, fontSize: 13, fontFamily: fonts.medium },
  tabs: { paddingHorizontal: 20, paddingBottom: 14 },
  content: { paddingHorizontal: 20, paddingBottom: 120 },
  gap: { height: 10 },
  card: { padding: 12 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  thumb: { width: 52, height: 52, borderRadius: 12 },
  body: { flex: 1, gap: 3 },
  title: { color: G.ink, fontSize: 14, fontFamily: fonts.medium },
  sub: { color: G.muted, fontSize: 12, fontFamily: fonts.regular },
  chip: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, marginTop: 3 },
  chipText: { fontSize: 11, fontFamily: fonts.medium },
  right: { alignItems: 'flex-end', gap: 3, maxWidth: 120 },
  amount: { color: G.ink, fontSize: 14, fontFamily: fonts.medium },
  when: { color: G.muted, fontSize: 12, fontFamily: fonts.regular, textAlign: 'right' },
  urgent: { color: G.orangeInk },
  primary: { marginTop: 12, height: 42, borderRadius: 12, backgroundColor: G.blue, alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: '#FFFFFF', fontSize: 14, fontFamily: fonts.medium },
  reply: { marginTop: 12, height: 42, borderRadius: 12, backgroundColor: TINT.amber.bg, alignItems: 'center', justifyContent: 'center' },
  replyText: { color: TINT.amber.text, fontSize: 14, fontFamily: fonts.medium },
  loader: { marginTop: 40 },
  empty: { padding: 18 },
  emptyText: { color: G.muted, fontSize: 14, lineHeight: 20, fontFamily: fonts.regular, textAlign: 'center' },
  sheetTitle: { color: G.ink, fontSize: 19, fontFamily: fonts.medium },
  sheetSub: { color: G.muted, fontSize: 14, lineHeight: 20, fontFamily: fonts.regular, marginTop: 6, marginBottom: 12 },
  codeRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  rowLine: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(28,31,42,0.08)' },
  codeThumb: { width: 40, height: 40, borderRadius: 10 },
  code: { color: G.ink, fontSize: 22, fontFamily: fonts.medium, letterSpacing: 1 },
});
