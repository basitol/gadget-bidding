import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Alert, Image, TextInput } from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { BottomSheet } from '../../components';
import { SocialAuthButtons } from '../../components/auth';
import { SocialAuthResult } from '../../components/auth/SocialAuthButtons';
import {
  A,
  AuthButton,
  AuthShell,
  AuthTitle,
  CodeBoxes,
  Field,
  PasswordField,
  TextField,
  TextLink,
} from '../../components/auth/GlassAuthKit';
import { AuthStackParamList } from '../../navigation/AuthNavigator';
import { fonts } from '../../constants';
import { useAuthStore } from '../../store';
import type { TwoFactorChallenge } from '../../store/authStore';
import { useToastStore } from '../../store/toastStore';
import { authService } from '../../services';
import { isValidNigerianPhone, isValidEmail, formatToInternational } from '../../utils';

type LoginScreenProps = {
  navigation: NativeStackNavigationProp<AuthStackParamList, 'Login'>;
  route: RouteProp<AuthStackParamList, 'Login'>;
};

const toast = (m: string, t: 'success' | 'error' = 'error') => useToastStore.getState().show(m, t);

/** Accounts made before email sign-up used a phone number; still let those log in. */
const normalizeIdentifier = (value: string) => {
  const v = value.trim();
  return v.includes('@') ? v.toLowerCase() : formatToInternational(v);
};
const identifierError = (value: string): string | null => {
  const v = value.trim();
  if (!v) return null;
  if (v.includes('@')) return isValidEmail(v) ? null : 'Check your email address. It looks incomplete.';
  return isValidNigerianPhone(v) ? null : 'Enter the email you signed up with.';
};

export const LoginScreen: React.FC<LoginScreenProps> = ({ navigation, route }) => {
  const interfaceType = route.params.interfaceType;
  const seller = interfaceType === 'seller';

  const [identifier, setIdentifier] = useState(route.params.email ?? '');
  const [password, setPassword] = useState('');
  const [idError, setIdError] = useState<string | null>(null);
  const passwordRef = useRef<TextInput>(null);

  const { login, completeTwoFactor, socialLogin, isLoading, error, clearError } = useAuthStore();
  // 2-step sign-in: password accepted, waiting for the emailed code.
  const [challenge, setChallenge] = useState<TwoFactorChallenge | null>(null);
  const [code, setCode] = useState('');

  // authStore.error is global; show it once here, then clear it so it can't leak to another screen.
  useEffect(() => {
    if (error) {
      toast(error);
      clearError();
    }
  }, [error, clearError]);

  const canSubmit = !!identifier.trim() && password.length > 0 && !identifierError(identifier);

  const handleUnverifiedAccount = async (formatted: string) => {
    try {
      const response = await authService.resendOtp(formatted);
      if (!response.data?.verification_id) throw new Error("We couldn't send a code. Try again.");
      navigation.navigate('OtpVerification', {
        phone_number: response.data.phone_number,
        email: response.data.email || '',
        verification_id: response.data.verification_id,
        isNewUser: true,
        interfaceType,
      });
    } catch (err) {
      toast(err instanceof Error ? err.message : "We couldn't send a code. Try again.");
    }
  };

  const handleLogin = async () => {
    clearError();
    const problem = identifierError(identifier);
    setIdError(problem);
    if (problem || !canSubmit) return;

    const formatted = normalizeIdentifier(identifier);
    try {
      const pending = await login(formatted, password, interfaceType);
      if (pending) {
        setCode('');
        setChallenge(pending);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "That didn't work. Check your details and try again.";
      if (message.toLowerCase().includes('verify your account')) {
        Alert.alert('Confirm your account first', "We'll send you a new code to finish setting it up.", [
          { text: 'Not now', style: 'cancel' },
          { text: 'Send code', onPress: () => handleUnverifiedAccount(formatted) },
        ]);
        return;
      }
      toast(message);
    }
  };

  const submitCode = async (value = code) => {
    if (!challenge || value.length !== 6) return;
    try {
      await completeTwoFactor(challenge.verification_id, value, interfaceType);
      setChallenge(null);
    } catch (err) {
      setCode('');
      toast(err instanceof Error ? err.message : "That code didn't match. Try again.");
    }
  };

  const handleSocialSuccess = useCallback(
    async (result: SocialAuthResult) => {
      clearError();
      try {
        await socialLogin(result.provider, result.idToken, interfaceType);
      } catch (err) {
        toast(err instanceof Error ? err.message : "That didn't work. Try again.");
      }
    },
    [clearError, socialLogin, interfaceType]
  );

  const goBack = () => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate('Splash'));

  return (
    <AuthShell title="Log in" onBack={goBack}>
      <Image
        source={require('../../../assets/brand/logo-wordmark.png')}
        style={styles.wordmark}
        accessibilityLabel="Gadgets Bidding"
      />
      <AuthTitle
        title="Welcome back"
        sub={seller ? 'Log in to manage your listings and payouts.' : 'Log in to keep bidding and track your orders.'}
      />

      <Field label="Email" error={idError}>
        <TextField
          value={identifier}
          onChangeText={t => {
            setIdentifier(t);
            if (idError) setIdError(null);
          }}
          onBlur={() => setIdError(identifierError(identifier))}
          placeholder="you@example.com"
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          spellCheck={false}
          autoComplete="email"
          textContentType="username"
          returnKeyType="next"
          onSubmitEditing={() => passwordRef.current?.focus()}
          invalid={!!idError}
        />
      </Field>

      <Field label="Password">
        <PasswordField
          ref={passwordRef}
          value={password}
          onChangeText={setPassword}
          placeholder="Your password"
          autoComplete="password"
          textContentType="password"
          returnKeyType="go"
          onSubmitEditing={handleLogin}
        />
      </Field>

      <TextLink
        label="Forgot password?"
        onPress={() =>
          navigation.navigate('ResetPassword', {
            interfaceType,
            email: identifier.includes('@') ? identifier.trim() : undefined,
          })
        }
        style={styles.forgot}
      />

      <AuthButton label="Log in" onPress={handleLogin} disabled={!canSubmit} busy={isLoading && !challenge} />

      <Text style={styles.or}>or</Text>

      <SocialAuthButtons layout="stacked" onSuccess={handleSocialSuccess} onError={m => Alert.alert('Log in', m)} />

      <Text style={styles.newHere}>
        New here?{' '}
        <Text
          style={styles.newHereLink}
          accessibilityRole="link"
          onPress={() => (seller ? navigation.navigate('Register', { interfaceType: 'seller' }) : navigation.navigate('SignUp'))}
        >
          {seller ? 'Open a seller account' : 'Create an account'}
        </Text>
      </Text>
      {seller ? (
        <TextLink
          label="Buying instead? Log in as a buyer"
          muted
          onPress={() => navigation.replace('Login', { interfaceType: 'buyer' })}
          style={styles.switch}
        />
      ) : null}

      <BottomSheet visible={!!challenge} onClose={() => setChallenge(null)}>
        <Text style={styles.codeTitle}>Enter your sign-in code</Text>
        <Text style={styles.codeSub}>
          We emailed a 6-digit code to {challenge?.email_hint}. It works for 10 minutes.
        </Text>
        <CodeBoxes value={code} onChange={setCode} onComplete={submitCode} />
        <View style={styles.codeButton}>
          <AuthButton label="Log in" onPress={() => submitCode()} disabled={code.length !== 6} busy={isLoading && !!challenge} />
        </View>
      </BottomSheet>
    </AuthShell>
  );
};

const styles = StyleSheet.create({
  wordmark: { width: 170, height: 37, resizeMode: 'contain', alignSelf: 'center', marginTop: 4, marginBottom: 28 },
  forgot: { alignSelf: 'flex-end', marginTop: -4, marginBottom: 24 },
  or: { color: A.muted, fontSize: 13, fontFamily: fonts.regular, textAlign: 'center', marginVertical: 16 },
  newHere: { color: A.muted, fontSize: 14, fontFamily: fonts.regular, textAlign: 'center', marginTop: 20 },
  newHereLink: { color: A.blue600, fontFamily: fonts.medium },
  switch: { alignSelf: 'center', marginTop: 16 },
  codeTitle: { color: A.ink, fontSize: 19, fontFamily: fonts.medium },
  codeSub: { color: A.muted, fontSize: 14, lineHeight: 20, fontFamily: fonts.regular, marginTop: 6, marginBottom: 16 },
  codeButton: { marginTop: 20 },
});
