import React, { useCallback, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, Alert, RefreshControl } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useReloadOnReconnect } from '../../store/networkStore';
import Constants from 'expo-constants';
import { G, GlassScreen, GlassHeader, GlassCard, SectionLabel, MenuRow } from '../../components/glass';
import { fonts } from '../../constants';
import { meService, ProfileSummary } from '../../services';
import { useAuthStore } from '../../store';
import { contactLabel } from '../../utils';
import { initialsOf } from './categories';

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export const BuyerProfileScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const { user, logout } = useAuthStore();
  const [s, setS] = useState<ProfileSummary | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setS(await meService.summary());
    } catch {
      // rows fall back to generic subtitles
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );
  useReloadOnReconnect(load);

  const handle = [s?.username ? `@${s.username}` : contactLabel(user as any), s?.location].filter(Boolean).join(' · ');

  const orders = s
    ? [s.orders.to_pay && `${s.orders.to_pay} to pay`, s.orders.to_confirm && `${s.orders.to_confirm} to confirm`]
        .filter(Boolean)
        .join(' · ') || 'Track your purchases'
    : null;

  const confirmLogout = () =>
    Alert.alert('Log out', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log out', style: 'destructive', onPress: () => logout() },
    ]);

  const version = Constants.expoConfig?.version ?? '1.0';

  return (
    <GlassScreen>
      <GlassHeader title="Profile" />
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
        <View style={styles.identity}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initialsOf(user?.full_name)}</Text>
          </View>
          <View style={styles.flex}>
            <Text style={styles.name} numberOfLines={1}>
              {user?.full_name}
            </Text>
            {handle ? (
              <Text style={styles.handle} numberOfLines={1}>
                {handle}
              </Text>
            ) : null}
          </View>
          <Pressable onPress={() => navigation.navigate('PersonalDetails')} style={styles.edit} accessibilityRole="button">
            <Text style={styles.editText}>Edit</Text>
          </Pressable>
        </View>

        <View style={styles.stats}>
          {[
            { value: s ? String(s.stats.won) : '–', label: 'Won' },
            { value: s ? String(s.stats.bidding) : '–', label: 'Bidding' },
            { value: s?.stats.rating != null ? s.stats.rating.toFixed(1) : '–', label: 'Rating' },
          ].map(st => (
            <GlassCard key={st.label} style={styles.stat}>
              <Text style={styles.statValue}>{st.value}</Text>
              <Text style={styles.statLabel}>{st.label}</Text>
            </GlassCard>
          ))}
        </View>

        <SectionLabel plain>Shopping</SectionLabel>
        <GlassCard style={styles.group}>
          <MenuRow icon="cube-outline" title="My orders" subtitle={orders} onPress={() => navigation.navigate('Orders')} />
          <MenuRow
            icon="heart-outline"
            title="Watchlist"
            subtitle={s ? plural(s.watchlist_count, 'auction') : null}
            onPress={() => navigation.navigate('Watchlist')}
          />
          <MenuRow
            icon="location-outline"
            title="Delivery addresses"
            subtitle={s ? s.addresses.join(', ') || 'Add where we should deliver' : null}
            onPress={() => navigation.navigate('DeliveryAddresses')}
          />
          <MenuRow
            icon="card-outline"
            title="Payment methods"
            subtitle={s ? s.default_card || 'Wallet and saved cards' : null}
            onPress={() => navigation.navigate('PaymentMethods')}
          />
          <MenuRow
            icon="notifications-outline"
            title="Alerts & saved searches"
            subtitle={s ? s.saved_searches.join(', ') || 'Get told when something is listed' : null}
            onPress={() => navigation.navigate('Alerts')}
            last
          />
        </GlassCard>

        <SectionLabel plain>Account</SectionLabel>
        <GlassCard style={styles.group}>
          <MenuRow
            icon="person-outline"
            title="Personal details"
            subtitle="Name, email, phone"
            onPress={() => navigation.navigate('PersonalDetails')}
          />
          <MenuRow
            icon="notifications-outline"
            title="Notifications"
            subtitle="Outbid, ending soon, orders"
            onPress={() => navigation.navigate('NotificationSettings')}
          />
          <MenuRow
            icon="shield-outline"
            title="Password & security"
            subtitle={s ? (s.two_factor_enabled ? '2-step sign-in is on' : '2-step sign-in is off') : null}
            onPress={() => navigation.navigate('Security')}
            last
          />
        </GlassCard>

        <SectionLabel plain>Support</SectionLabel>
        <GlassCard style={styles.group}>
          <MenuRow
            icon="help-circle-outline"
            title="Help centre"
            subtitle="Buying, paying, disputes"
            onPress={() => navigation.navigate('Help')}
          />
          <MenuRow
            icon="document-outline"
            title="Terms & buyer protection"
            onPress={() => navigation.navigate('Terms')}
          />
          <MenuRow icon="document-outline" title="Privacy & your data" onPress={() => navigation.navigate('PrivacyData')} />
          <MenuRow icon="log-out-outline" title="Log out" danger onPress={confirmLogout} last />
        </GlassCard>

        <Text style={styles.version}>Gadgets Bidding · version {version}</Text>
      </ScrollView>
    </GlassScreen>
  );
};

const styles = StyleSheet.create({
  content: { paddingHorizontal: 20, paddingBottom: 120 },
  flex: { flex: 1 },
  identity: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 8 },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderWidth: 1,
    borderColor: 'rgba(28,31,42,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: G.blue, fontSize: 22, fontFamily: fonts.medium },
  name: { color: G.ink, fontSize: 21, fontFamily: fonts.medium, letterSpacing: -0.3 },
  handle: { color: G.muted, fontSize: 14, fontFamily: fonts.regular, marginTop: 3 },
  edit: {
    height: 36,
    paddingHorizontal: 16,
    borderRadius: 11,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(28,31,42,0.06)',
    justifyContent: 'center',
  },
  editText: { color: G.ink, fontSize: 13, fontFamily: fonts.medium },
  stats: { flexDirection: 'row', gap: 8, marginTop: 10, marginBottom: 22 },
  stat: { flex: 1, paddingVertical: 12, paddingHorizontal: 14 },
  statValue: { color: G.ink, fontSize: 22, fontFamily: fonts.medium },
  statLabel: { color: G.muted, fontSize: 12, fontFamily: fonts.regular, marginTop: 2 },
  group: { marginBottom: 22, overflow: 'hidden' },
  version: { color: G.faint, fontSize: 12, fontFamily: fonts.regular, textAlign: 'center' },
});
