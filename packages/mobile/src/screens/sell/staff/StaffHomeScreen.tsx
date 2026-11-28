import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, RefreshControl, ActivityIndicator, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { G, GlassScreen, GlassHeader, GlassCard, GadgetImage, SectionLabel, SecondaryButton, useNow } from '../../../components/glass';
import { fonts } from '../../../constants';
import { useAuthStore } from '../../../store';
import { useReloadOnReconnect } from '../../../store/networkStore';
import { useToastStore } from '../../../store/toastStore';
import { staffService, StaffHome, StaffAccessError } from '../../../services/staff.service';
import { byWhen, Tone } from '../../../services/sellerTabs.service';
import { shortDay } from '../../../services/sellerStore.service';
import { Note, TINT } from '../onboarding/kit';

const toast = (m: string, t: 'success' | 'error' = 'error') => useToastStore.getState().show(m, t);
const msg = (e: unknown) => (e instanceof Error ? e.message : "That didn't work. Try again.");

const TONE: Record<Tone, { bg: string; text: string }> = {
  amber: TINT.amber,
  red: TINT.red,
  blue: TINT.blue,
  green: TINT.green,
  neutral: { bg: TINT.fill, text: G.slate },
};

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * The staff app: one screen for someone a store added to its team. Their hub code, what to drop
 * off and collect at the hub, and what's on its way. No money, buyers or store settings.
 */
export const StaffHomeScreen: React.FC = () => {
  const now = useNow(30_000);
  const logout = useAuthStore(s => s.logout);
  const [data, setData] = useState<StaffHome | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  /** Removed from the team, or the store closed: retrying won't help. */
  const [gone, setGone] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await staffService.home());
      setFailed(null);
      setGone(false);
    } catch (e) {
      setFailed(msg(e));
      // Removed from the team (or the store closed): stop showing the store's items.
      if (e instanceof StaffAccessError) {
        setGone(true);
        setData(null);
      }
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );
  useReloadOnReconnect(load);

  const signOut = () =>
    Alert.alert('Sign out?', "You'll need your email and password to sign back in.", [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => logout() },
    ]);

  const handIn = (orderId: string, title: string) =>
    Alert.alert('Handed it in at the hub?', `Tap this once the ${title} is with our hub team. They'll check it against the listing.`, [
      { text: 'Not yet', style: 'cancel' },
      {
        text: "Yes, it's at the hub",
        onPress: async () => {
          setBusy(orderId);
          try {
            setData(await staffService.droppedOff(orderId));
            toast('Marked as dropped off', 'success');
          } catch (e) {
            toast(msg(e));
            load();
          } finally {
            setBusy(null);
          }
        },
      },
    ]);

  const signOutButton = (
    <Pressable onPress={signOut} hitSlop={8} accessibilityRole="button" style={({ pressed }) => pressed && styles.pressed}>
      <Text style={styles.signOut}>Sign out</Text>
    </Pressable>
  );

  if (!data) {
    return (
      <GlassScreen>
        <GlassHeader title="Store staff" right={signOutButton} />
        <View style={styles.center}>
          {failed ? (
            <GlassCard style={styles.problem}>
              <Text style={styles.problemText}>{failed}</Text>
              {gone ? (
                <SecondaryButton label="Sign out" onPress={() => logout()} />
              ) : (
                <SecondaryButton label="Try again" onPress={load} />
              )}
            </GlassCard>
          ) : (
            <ActivityIndicator color={G.blue} />
          )}
        </View>
      </GlassScreen>
    );
  }

  const first = data.me.full_name.split(' ')[0];
  const nothing = !data.dropoff.length && !data.collect.length && !data.on_the_way.length;

  return (
    <GlassScreen>
      <GlassHeader title={data.store.name} right={signOutButton} />
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor={G.blue}
            onRefresh={async () => {
              setRefreshing(true);
              await load();
              setRefreshing(false);
            }}
          />
        }
      >
        <Text style={styles.title} accessibilityRole="header">
          Hi {first}
        </Text>
        <Text style={styles.sub}>You drop off and collect at our hub for {data.store.name}.</Text>

        {data.me.pickup_code ? (
          <GlassCard style={styles.codeCard}>
            <Text style={styles.codeLabel}>Your hub code</Text>
            <Text style={styles.code} selectable accessibilityLabel={`Hub code ${data.me.pickup_code.split('').join(' ')}`}>
              {data.me.pickup_code}
            </Text>
            <Text style={styles.codeSub}>
              Show it with {data.me.id_phrase} at {data.hub.address}.
            </Text>
          </GlassCard>
        ) : null}

        {nothing ? (
          <GlassCard style={styles.empty}>
            <Text style={styles.emptyText}>
              Nothing to drop off or collect right now. When {data.store.name} sells something, it shows here.
            </Text>
          </GlassCard>
        ) : null}

        {data.dropoff.length ? (
          <>
            <SectionLabel>{`To drop off · ${data.dropoff.length}`}</SectionLabel>
            {data.dropoff.map(d => {
              const urgent = new Date(d.due_at).getTime() - now < 24 * 3_600_000;
              return (
                <GlassCard key={d.order_id} style={styles.card}>
                  <View style={styles.row}>
                    <GadgetImage uri={d.image} size={52} style={styles.thumb} />
                    <View style={styles.body}>
                      <Text style={styles.itemTitle} numberOfLines={1}>
                        {d.title}
                      </Text>
                      <Text style={styles.itemCode} selectable>
                        {d.code}
                      </Text>
                      <Text style={[styles.meta, urgent && styles.urgent]}>{capital(byWhen(d.due_at, now))}</Text>
                    </View>
                  </View>
                  <Pressable
                    onPress={() => handIn(d.order_id, d.title)}
                    disabled={busy === d.order_id}
                    style={({ pressed }) => [styles.primary, pressed && styles.pressed]}
                    accessibilityRole="button"
                    accessibilityLabel={`Handed in ${d.title}`}
                  >
                    {busy === d.order_id ? (
                      <ActivityIndicator color="#FFFFFF" />
                    ) : (
                      <Text style={styles.primaryText}>Handed in at the hub</Text>
                    )}
                  </Pressable>
                </GlassCard>
              );
            })}
          </>
        ) : null}

        {data.collect.length ? (
          <>
            <SectionLabel>{`To collect · ${data.collect.length}`}</SectionLabel>
            {data.collect.map(c => (
              <GlassCard key={c.code} style={styles.card}>
                <View style={styles.row}>
                  <GadgetImage uri={c.image} size={52} style={styles.thumb} />
                  <View style={styles.body}>
                    <Text style={styles.itemTitle} numberOfLines={1}>
                      {c.title}
                    </Text>
                    <Text style={styles.itemCode} selectable>
                      {c.code}
                    </Text>
                    <Text style={styles.meta}>
                      {c.free_until ? `Returned after a refund · free to collect until ${shortDay(c.free_until)}` : 'Returned after a refund'}
                    </Text>
                  </View>
                </View>
              </GlassCard>
            ))}
          </>
        ) : null}

        {data.on_the_way.length ? (
          <>
            <SectionLabel>On the way</SectionLabel>
            {data.on_the_way.map(o => {
              const tone = TONE[o.chip.tone];
              return (
                <GlassCard key={o.id} style={styles.card}>
                  <View style={styles.row}>
                    <GadgetImage uri={o.image} size={52} style={styles.thumb} />
                    <View style={styles.body}>
                      <Text style={styles.itemTitle} numberOfLines={1}>
                        {o.title}
                      </Text>
                      <Text style={styles.meta}>{o.order_number}</Text>
                      <View style={[styles.chip, { backgroundColor: tone.bg }]}>
                        <Text style={[styles.chipText, { color: tone.text }]}>{o.chip.label}</Text>
                      </View>
                    </View>
                  </View>
                </GlassCard>
              );
            })}
          </>
        ) : null}

        <Note style={styles.note}>
          You're on the {data.store.name} team as {data.me.email ?? data.me.full_name}. You can't see the store's payouts or change its
          settings.
        </Note>
      </ScrollView>
    </GlassScreen>
  );
};

const styles = StyleSheet.create({
  pressed: { opacity: 0.75 },
  center: { flex: 1, justifyContent: 'center', paddingHorizontal: 20 },
  problem: { padding: 18, gap: 14 },
  problemText: { color: G.slate, fontSize: 15, lineHeight: 22, fontFamily: fonts.regular, textAlign: 'center' },
  signOut: { color: G.blue600, fontSize: 14, fontFamily: fonts.medium },
  content: { paddingHorizontal: 20, paddingBottom: 48 },
  title: { color: G.ink, fontSize: 26, lineHeight: 32, letterSpacing: -0.5, fontFamily: fonts.medium, marginTop: 8 },
  sub: { color: G.muted, fontSize: 15, lineHeight: 22, fontFamily: fonts.regular, marginTop: 8, marginBottom: 20 },
  codeCard: { padding: 18, marginBottom: 24 },
  codeLabel: { color: G.slate, fontSize: 14, fontFamily: fonts.medium },
  code: { color: G.ink, fontSize: 34, letterSpacing: 6, fontFamily: fonts.medium, marginTop: 8 },
  codeSub: { color: G.muted, fontSize: 14, lineHeight: 20, fontFamily: fonts.regular, marginTop: 8 },
  empty: { padding: 18, marginBottom: 24 },
  emptyText: { color: G.muted, fontSize: 14, lineHeight: 20, fontFamily: fonts.regular, textAlign: 'center' },
  card: { padding: 12, marginBottom: 10 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  thumb: { width: 52, height: 52, borderRadius: 12 },
  body: { flex: 1, gap: 3 },
  itemTitle: { color: G.ink, fontSize: 14, fontFamily: fonts.medium },
  itemCode: { color: G.ink, fontSize: 16, letterSpacing: 0.5, fontFamily: fonts.medium },
  meta: { color: G.muted, fontSize: 12, lineHeight: 17, fontFamily: fonts.regular },
  urgent: { color: G.orangeInk },
  chip: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, marginTop: 3 },
  chipText: { fontSize: 11, fontFamily: fonts.medium },
  primary: { marginTop: 12, height: 42, borderRadius: 12, backgroundColor: G.blue, alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: '#FFFFFF', fontSize: 14, fontFamily: fonts.medium },
  note: { marginTop: 14 },
});
