import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, Switch } from 'react-native';
import { G, GlassScreen, GlassHeader, GlassCard, Chip } from '../../../components/glass';
import { fonts } from '../../../constants';
import { useAuthStore } from '../../../store';
import { getPushPermission, openSystemNotificationSettings } from '../../../services/pushNotifications';
import { sellerStoreService, SellerAlertSettings, SellerAlertChange } from '../../../services/sellerStore.service';
import { LoadingScreen, Overline, toast, errText, s as shared } from './shared';

type Key = 'sales' | 'seller_bids' | 'payouts';
const ROWS: { key: Key; title: string; sub: string }[] = [
  { key: 'sales', title: 'Sales', sub: 'Item sold, buyer paid, order updates' },
  { key: 'seller_bids', title: 'Bids', sub: 'New bids on your listings' },
  { key: 'payouts', title: 'Payouts', sub: 'Money sent to your business account' },
];

/** Seller alert switches, saved straight away (the same settings the buyer app uses, with seller rows). */
export const SellerNotificationSettingsScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const { user } = useAuthStore();
  const [prefs, setPrefs] = useState<SellerAlertSettings | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [osBlocked, setOsBlocked] = useState(false);

  const load = useCallback(async () => {
    setFailed(null);
    try {
      setPrefs(await sellerStoreService.alerts());
    } catch (e) {
      setFailed(errText(e, "Couldn't load your alert settings"));
    }
    getPushPermission()
      .then(p => setOsBlocked(p === 'denied'))
      .catch(() => {});
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (!prefs) return <LoadingScreen title="Notifications" onBack={() => navigation.goBack()} failed={failed} onRetry={load} />;

  /** Save straight away; put it back if the server says no. */
  const change = async (patch: SellerAlertChange, optimistic: SellerAlertSettings) => {
    const before = prefs;
    setPrefs(optimistic);
    try {
      setPrefs({ ...optimistic, ...(await sellerStoreService.saveAlerts(patch)) });
    } catch (e) {
      setPrefs(before);
      toast(errText(e, "We couldn't save that. Try again."));
    }
  };

  // Seller accounts sign up with email; texts only work once there's a real phone on the account.
  const hasPhone = !!user?.phone_number && !String(user.phone_number).startsWith('+9');
  const channels = (['push', 'email', ...(hasPhone ? ['sms'] : [])] as const) as readonly ('push' | 'email' | 'sms')[];
  const LABEL = { push: 'Push', email: 'Email', sms: 'SMS' } as const;

  return (
    <GlassScreen>
      <GlassHeader title="Notifications" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={shared.content}>
        {osBlocked && prefs.channels.push ? (
          <View style={styles.warn}>
            <Text style={styles.warnText}>Notifications are off for Gadgets Bidding in your phone's Settings.</Text>
            <Pressable onPress={openSystemNotificationSettings} hitSlop={8} accessibilityRole="button">
              <Text style={styles.link}>Open Settings</Text>
            </Pressable>
          </View>
        ) : null}

        <Overline style={styles.first}>Tell me about</Overline>
        <GlassCard style={shared.group}>
          {ROWS.map((r, i) => (
            <View key={r.key} style={[styles.row, i < ROWS.length - 1 && shared.divider]}>
              <View style={shared.flex}>
                <Text style={styles.title}>{r.title}</Text>
                <Text style={styles.sub}>{r.sub}</Text>
              </View>
              <Switch
                value={prefs[r.key]}
                onValueChange={v => change({ [r.key]: v }, { ...prefs, [r.key]: v })}
                trackColor={{ false: '#EDEFF4', true: G.blue }}
                thumbColor="#FFFFFF"
                accessibilityLabel={`${r.title}: ${r.sub}`}
              />
            </View>
          ))}
        </GlassCard>
        <Text style={shared.help}>Cases, listing reviews, and account and security alerts always come through.</Text>

        <Overline>How we reach you</Overline>
        <View style={styles.chips}>
          {channels.map(c => (
            <Chip
              key={c}
              label={LABEL[c]}
              selected={prefs.channels[c]}
              onPress={() =>
                change(
                  { channels: { [c]: !prefs.channels[c] } },
                  { ...prefs, channels: { ...prefs.channels, [c]: !prefs.channels[c] } }
                )
              }
            />
          ))}
        </View>
        {!prefs.channels.push && !prefs.channels.email && !(hasPhone && prefs.channels.sms) ? (
          <Text style={shared.help}>Alerts will only show in the app's notification list.</Text>
        ) : null}

        <GlassCard style={[shared.group, styles.row, styles.topGap]}>
          <View style={shared.flex}>
            <Text style={styles.title}>Quiet hours</Text>
            <Text style={styles.sub}>10:00 pm – 7:00 am · no sounds</Text>
          </View>
          <Switch
            value={prefs.quiet_hours}
            onValueChange={v => change({ quiet_hours: v }, { ...prefs, quiet_hours: v })}
            trackColor={{ false: '#EDEFF4', true: G.blue }}
            thumbColor="#FFFFFF"
            accessibilityLabel="Quiet hours"
          />
        </GlassCard>
      </ScrollView>
    </GlassScreen>
  );
};

const styles = StyleSheet.create({
  first: { marginTop: 8 },
  topGap: { marginTop: 16 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14, minHeight: 66 },
  title: { color: G.ink, fontSize: 16, fontFamily: fonts.medium },
  sub: { color: G.muted, fontSize: 13, fontFamily: fonts.regular, marginTop: 2 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  warn: { backgroundColor: '#FFF6EE', borderRadius: 14, padding: 14, gap: 6, marginTop: 8 },
  warnText: { color: '#DB7A2E', fontSize: 14, lineHeight: 20, fontFamily: fonts.regular },
  link: { color: G.blue600, fontSize: 14, fontFamily: fonts.medium },
});
