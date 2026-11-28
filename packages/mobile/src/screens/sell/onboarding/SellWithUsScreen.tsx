import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { AuthShell, AuthButton, TextLink, A } from '../../../components/auth/GlassAuthKit';
import { GlassCard } from '../../../components/glass';
import { fonts } from '../../../constants';
import { HeroIcon, ICONS, IconImage, Label, ListRow, Note, Ticks } from './kit';

/** Before a business signs up: who can sell and what to have ready. */
export const SellWithUsScreen: React.FC<{ navigation: any }> = ({ navigation }) => (
  <AuthShell
    title="Sell with us"
    onBack={() => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate('Splash'))}
    footer={
      <>
        <AuthButton label="Start with business email" onPress={() => navigation.navigate('SellerSignUp')} />
        <TextLink
          label="I already have a seller account"
          muted
          onPress={() => navigation.navigate('Login', { interfaceType: 'seller' })}
          style={styles.login}
        />
        <TextLink label="I was added to a store team" muted onPress={() => navigation.navigate('StaffJoin')} style={styles.team} />
      </>
    }
  >
    <View style={styles.icon}>
      <HeroIcon source={ICONS.store} />
    </View>
    <Text style={styles.title} accessibilityRole="header">
      Sell on Gadgets Bidding
    </Text>
    <Text style={styles.sub}>
      Reach buyers across Lagos. We inspect, deliver and collect payment — you get paid after the buyer confirms.
    </Text>

    <Label style={styles.label}>Who can sell</Label>
    <Ticks
      items={[
        'A business registered with CAC (RC or BN number)',
        'A shop in Computer Village, Ikeja',
        'You can drop sold items at our hub within 24 hours',
      ]}
    />

    <Label style={styles.label}>Have these ready</Label>
    <GlassCard style={styles.card}>
      <ListRow icon={<IconImage source={ICONS.idcard} />} title="CAC certificate" sub="Photo or PDF" />
      <ListRow icon={<IconImage source={ICONS.shield} />} title="Owner's ID" sub="NIN slip, passport or driver's licence" />
      <ListRow
        icon={<IconImage source={ICONS.store} />}
        title="Proof of shop address"
        sub="Tenancy, shop receipt or utility bill"
        last
      />
    </GlassCard>

    <Note tone="amber" style={styles.note}>
      Seller accounts are separate from buyer accounts and can't bid or buy. Use your business email.
    </Note>
  </AuthShell>
);

const styles = StyleSheet.create({
  icon: { alignItems: 'center', marginTop: 4 },
  title: { color: A.ink, fontSize: 28, lineHeight: 34, letterSpacing: -0.5, fontFamily: fonts.medium },
  sub: { color: A.muted, fontSize: 15, lineHeight: 22, fontFamily: fonts.regular, marginTop: 8 },
  label: { marginTop: 24, marginBottom: 12 },
  card: { overflow: 'hidden' },
  note: { marginTop: 20 },
  login: { alignSelf: 'center', marginTop: 16, marginBottom: 4 },
  team: { alignSelf: 'center', marginTop: 12, marginBottom: 4 },
});
