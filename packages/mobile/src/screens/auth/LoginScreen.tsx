import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { Button, Input } from '../../components';
import {
  AuthLayout,
  AuthFooterLink,
} from '../../components/auth';
import { AuthStackParamList } from '../../navigation/AuthNavigator';
import { useTheme } from '../../hooks';
import { ThemeColors, fonts, spacing, borderRadius } from '../../constants';
import { useAuthStore } from '../../store';
import { isValidNigerianPhone, formatToInternational } from '../../utils';

type LoginScreenProps = {
  navigation: NativeStackNavigationProp<AuthStackParamList, 'Login'>;
};

export const LoginScreen: React.FC<LoginScreenProps> = ({ navigation }) => {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [phoneNumber, setPhoneNumber] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ phone?: string; password?: string }>(
    {}
  );

  const { login, isLoading, error, clearError } = useAuthStore();

  const validateForm = (): boolean => {
    const newErrors: { phone?: string; password?: string } = {};

    if (!phoneNumber.trim()) {
      newErrors.phone = 'Phone number is required';
    } else if (!isValidNigerianPhone(phoneNumber)) {
      newErrors.phone = 'Enter a valid Nigerian phone number';
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
      const formattedPhone = formatToInternational(phoneNumber);
      await login(formattedPhone, password);
    } catch {
      Alert.alert(
        'Login Failed',
        error || 'Please check your credentials and try again'
      );
    }
  };

  return (
    <AuthLayout
      showBrand
      title="Welcome back"
      subtitle="Sign in to continue bidding on premium gadgets"
      footer={
        <AuthFooterLink
          text="Don't have an account?"
          linkText="Create account"
          onPress={() => navigation.navigate('Register')}
        />
      }
    >
      <View style={styles.featureRow}>
        <View style={styles.featurePill}>
          <Ionicons name="flash-outline" size={14} color={colors.primary} />
          <Text style={styles.featureText}>Live bidding</Text>
        </View>
        <View style={styles.featurePill}>
          <Ionicons name="shield-checkmark-outline" size={14} color={colors.primary} />
          <Text style={styles.featureText}>Secure wallet</Text>
        </View>
      </View>

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
        label="Password"
        placeholder="Enter your password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        showPasswordToggle
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
