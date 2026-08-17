import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Button, Input } from '../../components';
import {
  AuthLayout,
  AuthFooterLink,
  SocialAuthButtons,
} from '../../components/auth';
import { SocialAuthResult } from '../../components/auth/SocialAuthButtons';
import { AuthStackParamList } from '../../navigation/AuthNavigator';
import { useTheme } from '../../hooks';
import { ThemeColors, fonts, spacing, borderRadius } from '../../constants';
import { useAuthStore } from '../../store';
import {
  isValidNigerianPhone,
  isValidEmail,
  formatToInternational,
} from '../../utils';
import { AppInterfaceType } from '../../utils/roles';

type LoginScreenProps = {
  navigation: NativeStackNavigationProp<AuthStackParamList, 'Login'>;
  route: RouteProp<AuthStackParamList, 'Login'>;
};

const COPY: Record<
  AppInterfaceType,
  {
    title: string;
    subtitle: string;
    features: Array<{ icon: keyof typeof Ionicons.glyphMap; label: string }>;
    registerLabel: string;
  }
> = {
  buyer: {
    title: 'Buyer sign in',
    subtitle: 'Sign in to browse auctions and place bids',
    features: [
      { icon: 'flash-outline', label: 'Live bidding' },
      { icon: 'shield-checkmark-outline', label: 'Secure wallet' },
    ],
    registerLabel: 'Create buyer account',
  },
  seller: {
    title: 'Seller sign in',
    subtitle: 'Sign in to manage listings and auctions',
    features: [
      { icon: 'storefront-outline', label: 'List gadgets' },
      { icon: 'stats-chart-outline', label: 'Track sales' },
    ],
    registerLabel: 'Create seller account',
  },
};

export const LoginScreen: React.FC<LoginScreenProps> = ({
  navigation,
  route,
}) => {
  const interfaceType = route.params.interfaceType;
  const copy = COPY[interfaceType];
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{
    identifier?: string;
    password?: string;
  }>({});

  const { login, socialLogin, isLoading, error, clearError } = useAuthStore();

  const validateForm = (): boolean => {
    const newErrors: { identifier?: string; password?: string } = {};

    const value = identifier.trim();
    if (!value) {
      newErrors.identifier = 'Email or phone number is required';
    } else if (value.includes('@')) {
      if (!isValidEmail(value)) {
        newErrors.identifier = 'Enter a valid email address';
      }
    } else if (!isValidNigerianPhone(value)) {
      newErrors.identifier = 'Enter a valid Nigerian phone number';
    }

    if (!password) {
      newErrors.password = 'Password is required';
    } else if (password.length < 8) {
      newErrors.password = 'Password must be at least 8 characters';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleLogin = async () => {
    clearError();
    if (!validateForm()) return;

    try {
      const value = identifier.trim();
      const formatted = value.includes('@')
        ? value.toLowerCase()
        : formatToInternational(value);
      await login(formatted, password, interfaceType);
    } catch (err) {
      Alert.alert(
        'Login Failed',
        err instanceof Error
          ? err.message
          : 'Please check your credentials and try again'
      );
    }
  };

  const handleSocialSuccess = useCallback(
    async (result: SocialAuthResult) => {
      clearError();
      try {
        await socialLogin(result.provider, result.idToken, interfaceType);
      } catch (err) {
        Alert.alert(
          'Login Failed',
          err instanceof Error
            ? err.message
            : 'Social login failed. Please try again.'
        );
      }
    },
    [clearError, socialLogin, interfaceType]
  );

  const handleSocialError = useCallback((message: string) => {
    Alert.alert('Sign in', message);
  }, []);

  const goBack = () => {
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      navigation.navigate('Splash');
    }
  };

  const switchInterface = () => {
    const nextType: AppInterfaceType =
      interfaceType === 'buyer' ? 'seller' : 'buyer';
    navigation.replace('Login', { interfaceType: nextType });
  };

  return (
    <AuthLayout
      onBack={goBack}
      title={copy.title}
      subtitle={copy.subtitle}
      footer={
        <>
          <AuthFooterLink
            text="Don't have an account?"
            linkText={copy.registerLabel}
            onPress={() => navigation.navigate('Register', { interfaceType })}
          />
          <TouchableOpacity
            style={styles.switchInterface}
            onPress={switchInterface}
            activeOpacity={0.7}
          >
            <Text style={styles.switchInterfaceText}>
              {interfaceType === 'buyer'
                ? 'Selling instead? Switch to seller login'
                : 'Buying instead? Switch to buyer login'}
            </Text>
          </TouchableOpacity>
        </>
      }
    >
      <View style={styles.interfaceBadge}>
        <Ionicons
          name={interfaceType === 'buyer' ? 'cart-outline' : 'storefront-outline'}
          size={16}
          color={colors.primary}
        />
        <Text style={styles.interfaceBadgeText}>
          {interfaceType === 'buyer' ? 'Buyer account' : 'Seller account'}
        </Text>
      </View>

      <View style={styles.featureRow}>
        {copy.features.map(feature => (
          <View key={feature.label} style={styles.featurePill}>
            <Ionicons name={feature.icon} size={14} color={colors.primary} />
            <Text style={styles.featureText}>{feature.label}</Text>
          </View>
        ))}
      </View>

      <Input
        label="Email or phone number"
        placeholder="you@example.com or 08012345678"
        value={identifier}
        onChangeText={setIdentifier}
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="email"
        textContentType="username"
        error={errors.identifier}
        iconName="mail-outline"
      />

      <Input
        label="Password"
        placeholder="Enter your password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        showPasswordToggle
        autoComplete="password"
        textContentType="password"
        error={errors.password}
        iconName="lock-closed-outline"
      />

      <TouchableOpacity style={styles.forgotPassword} activeOpacity={0.7}>
        <Text style={styles.forgotPasswordText}>Forgot password?</Text>
      </TouchableOpacity>

      <Button
        title="Sign in"
        onPress={handleLogin}
        loading={isLoading}
        fullWidth
        size="lg"
      />

      <SocialAuthButtons
        onSuccess={handleSocialSuccess}
        onError={handleSocialError}
      />

      {error && (
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle" size={18} color={colors.error} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}
    </AuthLayout>
  );
};

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    interfaceBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.xs,
      alignSelf: 'center',
      paddingVertical: spacing.xs,
      paddingHorizontal: spacing.md,
      borderRadius: borderRadius.full,
      backgroundColor: colors.primary + '14',
      borderWidth: 1,
      borderColor: colors.primary + '33',
      marginBottom: spacing.md,
    },
    interfaceBadgeText: {
      color: colors.primary,
      fontSize: fonts.sizes.sm,
      fontWeight: '700',
    },
    featureRow: {
      flexDirection: 'row',
      justifyContent: 'center',
      flexWrap: 'wrap',
      gap: spacing.sm,
      marginBottom: spacing.lg,
    },
    featurePill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      paddingVertical: spacing.xs,
      paddingHorizontal: spacing.sm,
      borderRadius: borderRadius.full,
      backgroundColor: colors.primary + '14',
      borderWidth: 1,
      borderColor: colors.primary + '33',
    },
    featureText: {
      color: colors.textSecondary,
      fontSize: fonts.sizes.xs,
      fontWeight: '600',
    },
    forgotPassword: {
      alignSelf: 'flex-end',
      marginBottom: spacing.lg,
      marginTop: -spacing.sm,
    },
    forgotPasswordText: {
      color: colors.primary,
      fontSize: fonts.sizes.sm,
      fontWeight: '600',
    },
    switchInterface: {
      marginTop: spacing.md,
    },
    switchInterfaceText: {
      color: colors.textMuted,
      fontSize: fonts.sizes.sm,
      textAlign: 'center',
      textDecorationLine: 'underline',
    },
    errorContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      backgroundColor: colors.error + '15',
      padding: spacing.md,
      borderRadius: borderRadius.lg,
      marginTop: spacing.md,
      borderWidth: 1,
      borderColor: colors.error + '33',
    },
    errorText: {
      flex: 1,
      color: colors.error,
      fontSize: fonts.sizes.sm,
    },
  });
