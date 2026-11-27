import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  ActivityIndicator,
  Image,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as AppleAuthentication from 'expo-apple-authentication';
import { useTheme } from '../../hooks';
import { ThemeColors, fonts, spacing, borderRadius } from '../../constants';
import {
  GOOGLE_CLIENT_ID,
  GOOGLE_IOS_CLIENT_ID,
  APPLE_CLIENT_ID,
} from '../../constants';

// The Web client ID is what verifies the ID token's audience server-side
// (see GOOGLE_CLIENT_IDS in the backend). The "Android"/"iOS" OAuth client
// types cannot be used with a browser-based auth flow — Google rejects that
// with "invalid_request" — so this must go through the native Credential
// Manager / Google Sign-In SDK instead, which is what this library wraps.
//
// Expo Go doesn't ship that native module, and loading it there crashes the app at launch, so it is
// only loaded in development and store builds.
const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
const GoogleSignin: typeof import('@react-native-google-signin/google-signin').GoogleSignin | null =
  isExpoGo ? null : require('@react-native-google-signin/google-signin').GoogleSignin;

GoogleSignin?.configure({
  webClientId: GOOGLE_CLIENT_ID,
  iosClientId: GOOGLE_IOS_CLIENT_ID || undefined,
});

export interface SocialAuthResult {
  provider: 'google' | 'apple';
  idToken: string;
  email?: string;
  fullName?: string;
}

interface SocialAuthButtonsProps {
  onSuccess: (result: SocialAuthResult) => void;
  onError: (message: string) => void;
  /**
   * Called before starting either native flow. Return false to block and
   * skip the native sign-in entirely (e.g. terms not yet accepted) — this
   * avoids sending the user through a whole Google/Apple round trip only
   * to reject them at the end.
   */
  canProceed?: () => boolean;
  /** 'row' = two small buttons under an "or continue with" divider (forms).
   *  'stacked' = full-width "Continue with …" buttons (sign-up chooser). */
  layout?: 'row' | 'stacked';
}

export const SocialAuthButtons: React.FC<SocialAuthButtonsProps> = ({
  onSuccess,
  onError,
  canProceed,
  layout = 'row',
}) => {
  const { colors } = useTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const [busy, setBusy] = useState<null | 'google' | 'apple'>(null);

  const handleGoogle = async () => {
    if (canProceed && !canProceed()) {
      return;
    }
    if (!GoogleSignin) {
      onError("Google sign-in isn't available in Expo Go. Use your email to log in.");
      return;
    }
    if (!GOOGLE_CLIENT_ID) {
      onError(
        'Google sign-in is not configured yet. Add your Google OAuth client IDs (see EXPO_PUBLIC_GOOGLE_*).'
      );
      return;
    }
    setBusy('google');
    try {
      if (Platform.OS === 'android') {
        await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
      }
      const result = await GoogleSignin.signIn();
      setBusy(null);
      if (result.type !== 'success') {
        return;
      }
      if (!result.data.idToken) {
        onError('Google sign-in did not return an identity token.');
        return;
      }
      onSuccess({
        provider: 'google',
        idToken: result.data.idToken,
        email: result.data.user.email,
        fullName: result.data.user.name || undefined,
      });
    } catch (error: any) {
      setBusy(null);
      // eslint-disable-next-line no-console
      console.error('Google sign-in error:', error?.code, error?.message, error);
      const detail = __DEV__
        ? ` (${error?.code || 'no code'}: ${error?.message || String(error)})`
        : '';
      onError(`Google sign-in failed. Please try again.${detail}`);
    }
  };

  const handleApple = async () => {
    if (canProceed && !canProceed()) {
      return;
    }
    if (Platform.OS !== 'ios') {
      onError('Sign in with Apple is only available on iOS.');
      return;
    }
    const available = await AppleAuthentication.isAvailableAsync();
    if (!available) {
      onError('Sign in with Apple is not available on this device.');
      return;
    }
    setBusy('apple');
    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
      if (!credential.identityToken) {
        setBusy(null);
        onError('Sign in with Apple did not return an identity token.');
        return;
      }
      const fullName =
        credential.fullName && credential.fullName.givenName
          ? [credential.fullName.givenName, credential.fullName.familyName]
              .filter(Boolean)
              .join(' ')
          : undefined;
      setBusy(null);
      onSuccess({
        provider: 'apple',
        idToken: credential.identityToken,
        email: credential.email || undefined,
        fullName,
      });
    } catch (error: any) {
      setBusy(null);
      if (error?.code === 'ERR_REQUEST_CANCELED') {
        return;
      }
      onError('Sign in with Apple failed.');
    }
  };

  if (layout === 'stacked') {
    const stacked = (
      key: 'google' | 'apple',
      label: string,
      logo: React.ReactNode,
      onPress: () => void
    ) => (
      <Pressable
        key={key}
        onPress={onPress}
        disabled={busy !== null}
        style={({ pressed }) => [stackedStyles.button, pressed && stackedStyles.pressed]}
        accessibilityRole="button"
        accessibilityLabel={label}
      >
        {busy === key ? (
          <ActivityIndicator size="small" color="#1C1F2A" />
        ) : (
          <>
            {logo}
            <Text style={stackedStyles.label}>{label}</Text>
          </>
        )}
      </Pressable>
    );
    return (
      <View style={stackedStyles.container}>
        {stacked(
          'google',
          'Continue with Google',
          <Image source={require('../../../assets/icons/google-g.png')} style={stackedStyles.logo} />,
          handleGoogle
        )}
        {Platform.OS === 'ios'
          ? stacked(
              'apple',
              'Continue with Apple',
              <Image source={require('../../../assets/icons/apple-logo.png')} style={stackedStyles.logo} />,
              handleApple
            )
          : null}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.dividerRow}>
        <View style={styles.dividerLine} />
        <Text style={styles.dividerText}>or continue with</Text>
        <View style={styles.dividerLine} />
      </View>

      <View style={styles.buttonsRow}>
        <TouchableOpacity
          style={[styles.socialButton, styles.googleButton]}
          activeOpacity={0.7}
          onPress={handleGoogle}
          disabled={busy !== null}
        >
          {busy === 'google' ? (
            <ActivityIndicator size="small" color={colors.text} />
          ) : (
            <>
              <Ionicons name="logo-google" size={18} color={colors.text} />
              <Text style={styles.socialButtonText}>Google</Text>
            </>
          )}
        </TouchableOpacity>

        {Platform.OS === 'ios' ? (
          <TouchableOpacity
            style={[styles.socialButton, styles.appleButton]}
            activeOpacity={0.7}
            onPress={handleApple}
            disabled={busy !== null}
          >
            {busy === 'apple' ? (
              <ActivityIndicator size="small" color={colors.text} />
            ) : (
              <>
                <Ionicons name="logo-apple" size={18} color={colors.text} />
                <Text style={styles.socialButtonText}>Apple</Text>
              </>
            )}
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
};

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: {
      marginTop: spacing.xl,
    },
    dividerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      marginBottom: spacing.lg,
    },
    dividerLine: {
      flex: 1,
      height: 1,
      backgroundColor: colors.border,
    },
    dividerText: {
      color: colors.textMuted,
      fontSize: fonts.sizes.sm,
    },
    buttonsRow: {
      flexDirection: 'row',
      gap: spacing.sm,
    },
    socialButton: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.sm,
      paddingVertical: spacing.md,
      borderRadius: borderRadius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    googleButton: {},
    appleButton: {
      flex: 1,
      height: 52,
    },
    socialButtonText: {
      color: colors.text,
      fontSize: fonts.sizes.md,
      fontWeight: '600',
    },
  });

const stackedStyles = StyleSheet.create({
  container: {
    gap: 12,
  },
  button: {
    height: 52,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    shadowColor: '#141C3C',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  pressed: {
    opacity: 0.85,
    transform: [{ scale: 0.99 }],
  },
  logo: {
    width: 20,
    height: 20,
    resizeMode: 'contain',
  },
  label: {
    color: '#1C1F2A',
    fontSize: 16,
    fontFamily: fonts.medium,
  },
});
