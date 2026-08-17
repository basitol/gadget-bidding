import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
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
GoogleSignin.configure({
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
}

export const SocialAuthButtons: React.FC<SocialAuthButtonsProps> = ({
  onSuccess,
  onError,
}) => {
  const { colors } = useTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const [busy, setBusy] = useState<null | 'google' | 'apple'>(null);

  const handleGoogle = async () => {
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
    } catch (error) {
      setBusy(null);
      onError('Google sign-in failed. Please try again.');
    }
  };

  const handleApple = async () => {
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
