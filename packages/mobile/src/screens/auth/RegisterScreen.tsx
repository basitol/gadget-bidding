import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Alert,
  TouchableOpacity,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Button, Input } from '../../components';
import {
  AuthLayout,
  AuthFooterLink,
  PasswordRequirements,
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
  isValidPassword,
  isValidFullName,
  formatToInternational,
} from '../../utils';
import { AppInterfaceType } from '../../utils/roles';

type RegisterScreenProps = {
  navigation: NativeStackNavigationProp<AuthStackParamList, 'Register'>;
  route: RouteProp<AuthStackParamList, 'Register'>;
};

const COPY: Record<
  AppInterfaceType,
  { title: string; subtitle: string; signInLabel: string }
> = {
  buyer: {
    title: 'Create buyer account',
    subtitle: 'Join GadgetBid to discover deals and bid on gadgets',
    signInLabel: 'Sign in as buyer',
  },
  seller: {
    title: 'Create seller account',
    subtitle: 'Start listing gadgets and running auctions on GadgetBid',
    signInLabel: 'Sign in as seller',
  },
};

export const RegisterScreen: React.FC<RegisterScreenProps> = ({
  navigation,
  route,
}) => {
  const interfaceType = route.params.interfaceType;
  const copy = COPY[interfaceType];
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [fullName, setFullName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const { register, socialLogin, isLoading, error, clearError } =
    useAuthStore();

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!fullName.trim()) {
      newErrors.fullName = 'Full name is required';
    } else if (!isValidFullName(fullName)) {
      newErrors.fullName = 'Enter your first and last name';
    }

    if (!phoneNumber.trim()) {
      newErrors.phone = 'Phone number is required';
    } else if (!isValidNigerianPhone(phoneNumber)) {
      newErrors.phone = 'Enter a valid Nigerian phone number';
    }

    if (email && !isValidEmail(email)) {
      newErrors.email = 'Enter a valid email address';
    }

    if (!email.trim()) {
      newErrors.email = 'Email is required';
    }

    const passwordValidation = isValidPassword(password);
    if (!password) {
      newErrors.password = 'Password is required';
    } else if (!passwordValidation.valid) {
      newErrors.password = passwordValidation.message;
    }

    if (password !== confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match';
    }

    if (!acceptedTerms) {
      newErrors.terms = 'You must accept the Terms of Service and Privacy Policy';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleRegister = async () => {
    clearError();
    if (!validateForm()) return;

    try {
      const formattedPhone = formatToInternational(phoneNumber);
      const verification_id = await register(
        {
          phone_number: formattedPhone,
          full_name: fullName.trim(),
          password,
          email: email || undefined,
          accepted_terms: acceptedTerms,
        },
        interfaceType
      );

      navigation.navigate('OtpVerification', {
        phone_number: formattedPhone,
        email: email.trim(),
        verification_id,
        isNewUser: true,
        interfaceType,
      });
    } catch (err) {
      Alert.alert(
        'Registration Failed',
        err instanceof Error ? err.message : 'Please try again'
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
          'Sign up Failed',
          err instanceof Error
            ? err.message
            : 'Social sign up failed. Please try again.'
        );
      }
    },
    [clearError, socialLogin, interfaceType]
  );

  const handleSocialError = useCallback((message: string) => {
    Alert.alert('Sign up', message);
  }, []);

  return (
    <AuthLayout
      onBack={() => navigation.goBack()}
      title={copy.title}
      subtitle={copy.subtitle}
      footer={
        <>
          <AuthFooterLink
            text="Already have an account?"
            linkText={copy.signInLabel}
            onPress={() => navigation.navigate('Login', { interfaceType })}
          />
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
          {interfaceType === 'buyer' ? 'Buyer registration' : 'Seller registration'}
        </Text>
      </View>

      <Input
        label="Full name"
        placeholder="John Doe"
        value={fullName}
        onChangeText={setFullName}
        autoCapitalize="words"
        autoComplete="name"
        textContentType="name"
        error={errors.fullName}
        iconName="person-outline"
      />

      <Input
        label="Phone number"
        placeholder="08012345678"
        value={phoneNumber}
        onChangeText={setPhoneNumber}
        keyboardType="phone-pad"
        autoCapitalize="none"
        autoComplete="tel"
        textContentType="telephoneNumber"
        error={errors.phone}
        iconName="call-outline"
      />

      <Input
        label="Email"
        placeholder="john@example.com"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
        textContentType="emailAddress"
        error={errors.email}
        iconName="mail-outline"
      />

      <Input
        label="Password"
        placeholder="Create a strong password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        showPasswordToggle
        autoComplete="password-new"
        textContentType="newPassword"
        error={errors.password}
        iconName="lock-closed-outline"
      />

      <Input
        label="Confirm password"
        placeholder="Confirm your password"
        value={confirmPassword}
        onChangeText={setConfirmPassword}
        secureTextEntry
        showPasswordToggle
        autoComplete="password-new"
        textContentType="newPassword"
        error={errors.confirmPassword}
        iconName="lock-closed-outline"
      />

      <PasswordRequirements password={password} />

      <View style={styles.consentRow}>
        <TouchableOpacity
          style={styles.checkboxTouchable}
          onPress={() => setAcceptedTerms(prev => !prev)}
          activeOpacity={0.7}
          hitSlop={8}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: acceptedTerms }}
        >
          <View
            style={[
              styles.checkbox,
              acceptedTerms && styles.checkboxChecked,
            ]}
          >
            {acceptedTerms && (
              <Ionicons name="checkmark" size={16} color="#FFFFFF" />
            )}
          </View>
        </TouchableOpacity>
        <Text style={styles.consentText}>
          I agree to the{' '}
          <Text
            style={styles.termsLink}
            onPress={() => navigation.navigate('Policy')}
          >
            Terms of Service
          </Text>{' '}
          and{' '}
          <Text
            style={styles.termsLink}
            onPress={() => navigation.navigate('Policy')}
          >
            Privacy Policy
          </Text>
        </Text>
      </View>
      {errors.terms && <Text style={styles.termsError}>{errors.terms}</Text>}

      <Button
        title="Create account"
        onPress={handleRegister}
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
      marginBottom: spacing.lg,
    },
    interfaceBadgeText: {
      color: colors.primary,
      fontSize: fonts.sizes.sm,
      fontWeight: '700',
    },
    errorContainer: {
      backgroundColor: colors.error + '15',
      padding: spacing.md,
      borderRadius: borderRadius.lg,
      marginTop: spacing.md,
      borderWidth: 1,
      borderColor: colors.error + '33',
    },
    errorText: {
      color: colors.error,
      fontSize: fonts.sizes.sm,
      textAlign: 'center',
    },
    termsLink: {
      color: colors.primary,
      fontWeight: '600',
    },
    consentRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.sm,
      marginTop: spacing.md,
    },
    checkboxTouchable: {
      marginTop: 2,
    },
    checkbox: {
      width: 22,
      height: 22,
      borderRadius: borderRadius.sm,
      borderWidth: 2,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surface,
    },
    checkboxChecked: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    consentText: {
      flex: 1,
      color: colors.textMuted,
      fontSize: fonts.sizes.sm,
      lineHeight: 20,
    },
    termsError: {
      color: colors.error,
      fontSize: fonts.sizes.sm,
      marginTop: spacing.xs,
    },
  });
