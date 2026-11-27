import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Image,
  ImageSourcePropType,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { AuthStackParamList } from '../../navigation/AuthNavigator';
import { FadeInView, PopIn } from '../../components';
import { fonts } from '../../constants';

type SplashScreenProps = {
  navigation: NativeStackNavigationProp<AuthStackParamList, 'Splash'>;
};

/** Design guide tokens (docs/DESIGN_GUIDE.md) — this screen is light by design. */
const C = {
  blue: '#4F7BFF',
  blue600: '#3E6AF0',
  ink: '#1C1F2A',
  slate: '#5C6273',
  muted: '#7C8293',
  canvas: '#EEF2FB',
  line: '#EDEFF4',
};

const TRUST: { label: string; icon: ImageSourcePropType }[] = [
  { label: 'Escrow', icon: require('../../../assets/icons/shield.png') },
  { label: 'IMEI checked', icon: require('../../../assets/icons/phonecheck.png') },
  { label: 'Hub inspected', icon: require('../../../assets/icons/box.png') },
];

export const SplashScreen: React.FC<SplashScreenProps> = ({ navigation }) => {
  return (
    <View style={styles.root}>
      <StatusBar style="dark" />

      {/* Soft blurred colour field (assets/backgrounds/glass-bg.jpg) for the glass cards to sit on */}
      <Image
        source={require('../../../assets/backgrounds/glass-bg.jpg')}
        style={styles.bg}
        resizeMode="cover"
      />

      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.hero}>
          <PopIn>
            <Image
              source={require('../../../assets/brand/logo-mark.png')}
              style={styles.mark}
              accessibilityLabel="Gadgets Bidding"
            />
          </PopIn>

          <FadeInView delay={120}>
            <Text style={styles.title} accessibilityRole="header">
              Bid on checked gadgets.{'\n'}
              <Text style={styles.titleBlue}>Pay what it's worth.</Text>
            </Text>
          </FadeInView>

          <FadeInView delay={200}>
            <Text style={styles.sub}>
              Every item is inspected at our Computer Village hub before it reaches you.
            </Text>
          </FadeInView>

          <View style={styles.trustRow}>
            {TRUST.map((t, i) => (
              <FadeInView key={t.label} delay={280 + i * 70} style={styles.trustCell}>
                <View style={styles.trustCard}>
                  <Image source={t.icon} style={styles.trustIcon} />
                  <Text style={styles.trustLabel}>{t.label}</Text>
                </View>
              </FadeInView>
            ))}
          </View>
        </View>
      </SafeAreaView>

      <FadeInView delay={420} offset={24}>
        <SafeAreaView style={styles.panel} edges={['bottom']}>
          <Pressable
            onPress={() => navigation.navigate('SignUp')}
            style={({ pressed }) => [styles.primary, pressed && styles.primaryPressed]}
            accessibilityRole="button"
          >
            <Text style={styles.primaryText}>Start shopping</Text>
          </Pressable>

          <Pressable
            onPress={() => navigation.navigate('Login', { interfaceType: 'buyer' })}
            style={({ pressed }) => [styles.textButton, pressed && styles.pressedText]}
            accessibilityRole="button"
          >
            <Text style={styles.secondaryText}>I already have an account</Text>
          </Pressable>

          <Pressable
            onPress={() => navigation.navigate('Register', { interfaceType: 'seller' })}
            style={({ pressed }) => [styles.textButton, pressed && styles.pressedText]}
            accessibilityRole="link"
          >
            <Text style={styles.sellerText}>I'm a business — sell on Gadgets Bidding</Text>
          </Pressable>
        </SafeAreaView>
      </FadeInView>
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: C.canvas,
    overflow: 'hidden',
  },
  bg: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
  },
  safe: {
    flex: 1,
  },
  hero: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  mark: {
    width: 84,
    height: 84,
    marginBottom: 24,
  },
  title: {
    color: C.ink,
    fontSize: 26,
    lineHeight: 32,
    fontFamily: fonts.medium,
    letterSpacing: -0.5,
    textAlign: 'center',
  },
  titleBlue: {
    color: C.blue,
  },
  sub: {
    color: C.muted,
    fontSize: 15,
    lineHeight: 22,
    fontFamily: fonts.regular,
    textAlign: 'center',
    marginTop: 12,
    paddingHorizontal: 16,
  },
  trustRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 24,
    alignSelf: 'stretch',
  },
  trustCell: {
    flex: 1,
  },
  trustCard: {
    alignItems: 'center',
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 4,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.62)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.8)',
    shadowColor: '#141C3C',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  trustIcon: {
    width: 34,
    height: 34,
    resizeMode: 'contain',
  },
  trustLabel: {
    color: C.slate,
    fontSize: 13,
    fontFamily: fonts.medium,
  },
  panel: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
    backgroundColor: 'rgba(255,255,255,0.6)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.8)',
  },
  primary: {
    height: 52,
    borderRadius: 14,
    backgroundColor: C.blue,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryPressed: {
    backgroundColor: C.blue600,
    transform: [{ scale: 0.99 }],
  },
  primaryText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontFamily: fonts.medium,
  },
  textButton: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  pressedText: {
    opacity: 0.6,
  },
  secondaryText: {
    color: C.slate,
    fontSize: 15,
    fontFamily: fonts.medium,
  },
  sellerText: {
    color: C.blue,
    fontSize: 14,
    fontFamily: fonts.medium,
  },
});
