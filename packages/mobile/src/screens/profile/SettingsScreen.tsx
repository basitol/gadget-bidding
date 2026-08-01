import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  Alert,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../hooks';
import { ThemeColors, fonts, spacing, borderRadius } from '../../constants';
import { useAuthStore } from '../../store';

type SettingsScreenProps = {
  navigation: NativeStackNavigationProp<any>;
};

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
    },
    backButton: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerTitle: {
      flex: 1,
      textAlign: 'center',
      color: colors.text,
      fontSize: fonts.sizes.xl,
      fontFamily: fonts.bold,
    },
    headerSpacer: {
      width: 40,
    },
    content: {
      paddingHorizontal: spacing.lg,
      paddingBottom: 120,
    },
    sectionLabel: {
      color: colors.textMuted,
      fontSize: fonts.sizes.xs,
      fontFamily: fonts.semiBold,
      textTransform: 'uppercase',
      letterSpacing: 0.8,
      marginTop: spacing.lg,
      marginBottom: spacing.sm,
      marginLeft: spacing.xs,
    },
    card: {
      backgroundColor: colors.surface,
      borderRadius: borderRadius.xl,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: 'hidden',
    },
    logoutCard: {
      marginTop: spacing.xl,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.md,
      gap: spacing.md,
    },
    rowIcon: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: colors.primary + '14',
      alignItems: 'center',
      justifyContent: 'center',
    },
    rowText: {
      flex: 1,
    },
    rowTitle: {
      color: colors.text,
      fontSize: fonts.sizes.md,
      fontFamily: fonts.semiBold,
    },
    rowSubtitle: {
      color: colors.textSecondary,
      fontSize: fonts.sizes.sm,
      marginTop: 2,
      fontFamily: fonts.regular,
    },
    divider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: colors.border,
      marginLeft: 60,
    },
    footer: {
      textAlign: 'center',
      color: colors.textMuted,
      fontSize: fonts.sizes.xs,
      marginTop: spacing.xl,
      fontFamily: fonts.medium,
    },
  });

type SettingRowProps = {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle?: string;
  onPress?: () => void;
  right?: React.ReactNode;
  destructive?: boolean;
  colors: ThemeColors;
  styles: ReturnType<typeof createStyles>;
};

const SettingRow: React.FC<SettingRowProps> = ({
  icon,
  title,
  subtitle,
  onPress,
  right,
  destructive,
  colors,
  styles,
}) => {
  const content = (
    <>
      <View
        style={[
          styles.rowIcon,
          destructive && { backgroundColor: colors.error + '18' },
        ]}
      >
        <Ionicons
          name={icon}
          size={18}
          color={destructive ? colors.error : colors.primary}
        />
      </View>
      <View style={styles.rowText}>
        <Text style={[styles.rowTitle, destructive && { color: colors.error }]}>
          {title}
        </Text>
        {subtitle ? <Text style={styles.rowSubtitle}>{subtitle}</Text> : null}
      </View>
      {right ??
        (onPress ? (
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        ) : null)}
    </>
  );

  if (onPress) {
    return (
      <TouchableOpacity
        style={styles.row}
        onPress={onPress}
        activeOpacity={0.75}
      >
        {content}
      </TouchableOpacity>
    );
  }

  return <View style={styles.row}>{content}</View>;
};

export const SettingsScreen: React.FC<SettingsScreenProps> = ({
  navigation,
}) => {
  const { colors, mode } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { user, interfaceType, logout } = useAuthStore();
  const isSeller = interfaceType === 'seller';

  // Independent toggles — each has its own state
  const [bidAlerts, setBidAlerts] = useState(true);
  const [orderAlerts, setOrderAlerts] = useState(true);
  const [marketingAlerts, setMarketingAlerts] = useState(true);

  const switchColors = {
    trackColor: { false: colors.border, true: colors.primary },
    thumbColor: '#FFFFFF',
    ios_backgroundColor: colors.border,
  } as const;

  const handleLogout = () => {
    Alert.alert('Log out', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log out',
        style: 'destructive',
        onPress: () => logout(),
      },
    ]);
  };

  const rowProps = { colors, styles };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
          activeOpacity={0.8}
        >
          <Ionicons name="arrow-back" size={20} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Settings</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
      >
        <Text style={styles.sectionLabel}>Account</Text>
        <View style={styles.card}>
          <SettingRow
            {...rowProps}
            icon="person-outline"
            title={user?.full_name || 'Seller'}
            subtitle={user?.phone_number}
          />
          <View style={styles.divider} />
          <SettingRow
            {...rowProps}
            icon="storefront-outline"
            title={isSeller ? 'Seller account' : 'Buyer account'}
            subtitle={
              isSeller
                ? 'Listings, auctions, and payouts'
                : 'Bidding and purchases'
            }
          />
          <View style={styles.divider} />
          <SettingRow
            {...rowProps}
            icon="shield-checkmark-outline"
            title="Verification"
            subtitle={
              user?.is_verified ? 'Phone verified' : 'Verification required'
            }
          />
        </View>

        {isSeller ? (
          <>
            <Text style={styles.sectionLabel}>Selling</Text>
            <View style={styles.card}>
              <SettingRow
                {...rowProps}
                icon="pricetag-outline"
                title="My auctions"
                subtitle="Manage live and ended listings"
                onPress={() =>
                  navigation.navigate('MainTabs', { screen: 'Auctions' })
                }
              />
              <View style={styles.divider} />
              <SettingRow
                {...rowProps}
                icon="wallet-outline"
                title="Payout wallet"
                subtitle="Balance and withdrawals"
                onPress={() => navigation.navigate('Wallet')}
              />
              <View style={styles.divider} />
              <SettingRow
                {...rowProps}
                icon="bag-handle-outline"
                title="Sales orders"
                subtitle="Shipments and buyer fulfillment"
                onPress={() =>
                  navigation.navigate('MainTabs', { screen: 'Sales' })
                }
              />
            </View>
          </>
        ) : null}

        <Text style={styles.sectionLabel}>Notifications</Text>
        <View style={styles.card}>
          <SettingRow
            {...rowProps}
            icon="flash-outline"
            title={isSeller ? 'New bids & outbids' : 'Bid updates'}
            subtitle="Get notified when prices change"
            right={
              <Switch
                key="bid-alerts"
                value={bidAlerts}
                onValueChange={setBidAlerts}
                {...switchColors}
              />
            }
          />
          <View style={styles.divider} />
          <SettingRow
            {...rowProps}
            icon="cube-outline"
            title={isSeller ? 'Orders & shipping' : 'Order updates'}
            subtitle="Delivery and payment alerts"
            right={
              <Switch
                key="order-alerts"
                value={orderAlerts}
                onValueChange={setOrderAlerts}
                {...switchColors}
              />
            }
          />
          <View style={styles.divider} />
          <SettingRow
            {...rowProps}
            icon="mail-outline"
            title="Tips & offers"
            subtitle="Occasional product updates"
            right={
              <Switch
                key="marketing-alerts"
                value={marketingAlerts}
                onValueChange={setMarketingAlerts}
                {...switchColors}
              />
            }
          />
        </View>

        <Text style={styles.sectionLabel}>App</Text>
        <View style={styles.card}>
          <SettingRow
            {...rowProps}
            icon="moon-outline"
            title="Appearance"
            subtitle={`Following system · ${mode === 'dark' ? 'Dark' : 'Light'}`}
          />
          <View style={styles.divider} />
          <SettingRow
            {...rowProps}
            icon="help-circle-outline"
            title="Help & support"
            subtitle="support@gadgetbid.ng"
            onPress={() => Linking.openURL('mailto:support@gadgetbid.ng')}
          />
          <View style={styles.divider} />
          <SettingRow
            {...rowProps}
            icon="document-text-outline"
            title="Terms & privacy"
            subtitle="Bid commitment, fees, refunds, and delivery"
            onPress={() => navigation.navigate('Policy')}
          />
        </View>

        <View style={[styles.card, styles.logoutCard]}>
          <SettingRow
            {...rowProps}
            icon="log-out-outline"
            title="Log out"
            destructive
            onPress={handleLogout}
          />
        </View>

        <Text style={styles.footer}>
          GadgetBid · {isSeller ? 'Seller' : 'Buyer'} settings
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
};
