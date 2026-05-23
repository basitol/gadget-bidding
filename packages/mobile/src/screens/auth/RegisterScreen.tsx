import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Alert,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Button, Input } from '../../components';
import {
  AuthLayout,
  AuthFooterLink,
  PasswordRequirements,
} from '../../components/auth';
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

type RegisterScreenProps = {
  navigation: NativeStackNavigationProp<AuthStackParamList, 'Register'>;
};

export const RegisterScreen: React.FC<RegisterScreenProps> = ({
  navigation,
}) => {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [fullName, setFullName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const { register, isLoading, error, clearError } = useAuthStore();

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

    const passwordValidation = isValidPassword(password);
    if (!password) {
      newErrors.password = 'Password is required';
    } else if (!passwordValidation.valid) {
      newErrors.password = passwordValidation.message;
    }

    if (password !== confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleRegister = async () => {
    clearError();
    if (!validateForm()) return;

    try {
      const formattedPhone = formatToInternational(phoneNumber);
      const verification_id = await register({
        phone_number: formattedPhone,
        full_name: fullName.trim(),
        password,
        email: email || undefined,
      });

      navigation.navigate('OtpVerification', {
        phone_number: formattedPhone,
        verification_id,
        isNewUser: true,
      });
    } catch {
      Alert.alert('Registration Failed', error || 'Please try again');
    }
  };

  return (
    <AuthLayout
      onBack={() => navigation.goBack()}
      title="Create account"
      subtitle="Join thousands of Nigerians buying and selling gadgets"
      footer={
        <>
          <AuthFooterLink
            text="Already have an account?"
            linkText="Sign in"
            onPress={() => navigation.navigate('Login')}
          />
          <Text style={styles.terms}>
            By creating an account, you agree to our{' '}
            <Text style={styles.termsLink}>Terms of Service</Text> and{' '}
            <Text style={styles.termsLink}>Privacy Policy</Text>
          </Text>
        </>
      }
    >
      <Input
        label="Full name"
        placeholder="John Doe"
        value={fullName}
        onChangeText={setFullName}
        autoCapitalize="words"
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
        error={errors.phone}
        iconName="call-outline"
      />

      <Input
        label="Email (optional)"
        placeholder="john@example.com"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
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
        error={errors.confirmPassword}
        iconName="lock-closed-outline"
      />

      <PasswordRequirements password={password} />

      <Button
        title="Create account"
        onPress={handleRegister}
        loading={isLoading}
        fullWidth
        size="lg"
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
    terms: {
      color: colors.textMuted,
      fontSize: fonts.sizes.sm,
      textAlign: 'center',
      marginTop: spacing.lg,
      lineHeight: 20,
      paddingHorizontal: spacing.md,
    },
    termsLink: {
      color: colors.primary,
      fontWeight: '600',
    },
  });
