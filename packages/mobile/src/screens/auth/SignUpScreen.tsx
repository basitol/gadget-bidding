import React, { useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, Pressable, Image, ScrollView, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { AuthStackParamList } from '../../navigation/AuthNavigator';
import { SocialAuthButtons } from '../../components/auth';
import { SocialAuthResult } from '../../components/auth/SocialAuthButtons';
import { FadeInView } from '../../components';
import { fonts } from '../../constants';
import { useAuthStore } from '../../store';
import { useToastStore } from '../../store/toastStore';

type SignUpScreenProps = {
  navigation: NativeStackNavigationProp<AuthStackParamList, 'SignUp'>;
};

const C = {
  blue: '#4F7BFF',
  blue600: '#3E6AF0',
  ink: '#1C1F2A',
  slate: '#5C6273',
  muted: '#7C8293',
  line: 'rgba(28,31,42,0.08)',
};

/** Buyer sign-up chooser: email, Google or Apple. Sellers branch off to their own flow. */
export const SignUpScreen: React.FC<SignUpScreenProps> = ({ navigation }) => {
  const { socialLogin, error, clearError } = useAuthStore();
  const showToast = useToastStore(state => state.show);

  useEffect(() => {
    if (error) {
      showToast(error, 'error');
      clearError();
    }
  }, [error, showToast, clearError]);

  // "By continuing you agree…" below covers consent for one-tap sign-up.
  const handleSocialSuccess = useCallback(
    async (result: SocialAuthResult) => {
      clearError();
      try {
        await socialLogin(result.provider, result.idToken, 'buyer', true);
      } catch (err) {
        Alert.alert(
          'Sign-up failed',
          err instanceof Error ? err.message : 'Social sign up failed. Please try again.'
        );
      }
    },
    [clearError, socialLogin]
  );

  const handleSocialError = useCallback((message: string) => {
    Alert.alert('Sign up', message);
  }, []);

  const openPolicy = () => navigation.navigate('Policy');

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />
      <Image source={require('../../../assets/backgrounds/glass-bg.jpg')} style={styles.bg} />

      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <Pressable
            onPress={() =>
              navigation.canGoBack() ? navigation.goBack() : navigation.navigate('Splash')
            }
            style={({ pressed }) => [styles.back, pressed && styles.pressed]}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Back"
          >
            <Ionicons name="chevron-back" size={20} color={C.ink} />
          </Pressable>
          <Text style={styles.headerTitle} accessibilityRole="header">
            Sign up
          </Text>
          <View style={styles.headerSpacer} />
        </View>

        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <FadeInView offset={12}>
            <Text style={styles.title}>Create your account</Text>
            <Text style={styles.sub}>Bid on inspected gadgets and pay safely through escrow.</Text>
          </FadeInView>

          <FadeInView delay={80} offset={12} style={styles.actions}>
            <Pressable
              onPress={() => navigation.navigate('SignUpFlow')}
              style={({ pressed }) => [styles.primary, pressed && styles.primaryPressed]}
              accessibilityRole="button"
            >
              <Text style={styles.primaryText}>Continue with email</Text>
            </Pressable>

            <View style={styles.dividerRow}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>or</Text>
              <View style={styles.dividerLine} />
            </View>

            <SocialAuthButtons
              layout="stacked"
              onSuccess={handleSocialSuccess}
              onError={handleSocialError}
            />
          </FadeInView>

          <FadeInView delay={160} offset={12}>
            <Text style={styles.loginRow}>
              Already have an account?{' '}
              <Text
                style={styles.link}
                onPress={() => navigation.navigate('Login', { interfaceType: 'buyer' })}
                accessibilityRole="link"
              >
                Log in
              </Text>
            </Text>

            <Pressable
              onPress={() => navigation.navigate('SellWithUs')}
              style={({ pressed }) => [styles.sellerCard, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel="Selling as a business? Create a seller account"
            >
              <Image source={require('../../../assets/icons/store.png')} style={styles.sellerIcon} />
              <View style={styles.sellerText}>
                <Text style={styles.sellerTitle}>Selling as a business?</Text>
                <Text style={styles.sellerSub}>Seller accounts are separate and can't buy</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={C.muted} />
            </Pressable>
          </FadeInView>

          <View style={styles.flex} />

          <Text style={styles.legal}>
            By continuing you agree to our{' '}
            <Text style={styles.legalLink} onPress={openPolicy}>
              Terms
            </Text>
            ,{' '}
            <Text style={styles.legalLink} onPress={openPolicy}>
              Auction rules
            </Text>{' '}
            and{' '}
            <Text style={styles.legalLink} onPress={openPolicy}>
              Privacy policy
            </Text>
            .
          </Text>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#EEF2FB',
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 8,
    height: 60,
  },
  back: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#141C3C',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  headerTitle: {
    color: C.ink,
    fontSize: 17,
    fontFamily: fonts.medium,
  },
  headerSpacer: {
    width: 44,
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
  },
  title: {
    color: C.ink,
    fontSize: 28,
    lineHeight: 34,
    fontFamily: fonts.medium,
    letterSpacing: -0.5,
  },
  sub: {
    color: C.muted,
    fontSize: 15,
    lineHeight: 22,
    fontFamily: fonts.regular,
    marginTop: 8,
  },
  actions: {
    marginTop: 24,
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
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginVertical: 20,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: C.line,
  },
  dividerText: {
    color: C.muted,
    fontSize: 13,
    fontFamily: fonts.regular,
  },
  loginRow: {
    textAlign: 'center',
    color: C.muted,
    fontSize: 15,
    fontFamily: fonts.regular,
    marginTop: 28,
  },
  link: {
    color: C.blue,
    fontFamily: fonts.medium,
  },
  sellerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 28,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.62)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.8)',
    shadowColor: '#141C3C',
    shadowOpacity: 0.05,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  sellerIcon: {
    width: 44,
    height: 44,
    resizeMode: 'contain',
  },
  sellerText: {
    flex: 1,
    gap: 2,
  },
  sellerTitle: {
    color: C.ink,
    fontSize: 16,
    fontFamily: fonts.medium,
  },
  sellerSub: {
    color: C.muted,
    fontSize: 13,
    fontFamily: fonts.regular,
  },
  pressed: {
    opacity: 0.7,
  },
  flex: {
    flex: 1,
    minHeight: 32,
  },
  legal: {
    textAlign: 'center',
    color: C.muted,
    fontSize: 13,
    lineHeight: 20,
    fontFamily: fonts.regular,
    paddingHorizontal: 12,
  },
  legalLink: {
    color: C.blue,
    textDecorationLine: 'underline',
  },
});
