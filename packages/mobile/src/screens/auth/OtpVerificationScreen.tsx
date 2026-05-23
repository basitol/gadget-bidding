import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Alert,
  Keyboard,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Button } from '../../components';
import { AuthLayout } from '../../components/auth';
import { AuthStackParamList } from '../../navigation/AuthNavigator';
import { useTheme } from '../../hooks';
import { ThemeColors, fonts, spacing, borderRadius } from '../../constants';
import { useAuthStore } from '../../store';
import { authService } from '../../services';
import { formatPhoneNumber } from '../../utils';

type OtpVerificationScreenProps = {
  navigation: NativeStackNavigationProp<AuthStackParamList, 'OtpVerification'>;
  route: RouteProp<AuthStackParamList, 'OtpVerification'>;
};

const OTP_LENGTH = 6;

export const OtpVerificationScreen: React.FC<OtpVerificationScreenProps> = ({
  navigation,
  route,
}) => {
  const { phone_number, verification_id, isNewUser } = route.params;
  const { mode, colors } = useTheme();
  const styles = useMemo(() => createStyles(colors, mode), [colors, mode]);

  const [otp, setOtp] = useState<string[]>(Array(OTP_LENGTH).fill(''));
  const [focusedIndex, setFocusedIndex] = useState(0);
  const [resendTimer, setResendTimer] = useState(60);
  const [isResending, setIsResending] = useState(false);

  const inputRefs = useRef<(TextInput | null)[]>([]);
  const { verifyOtp, isLoading, error, clearError } = useAuthStore();

  useEffect(() => {
    inputRefs.current[0]?.focus();
  }, []);

  useEffect(() => {
    if (resendTimer > 0) {
      const timer = setTimeout(() => setResendTimer(resendTimer - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [resendTimer]);

  const handleOtpChange = (value: string, index: number) => {
    if (value && !/^\d$/.test(value)) return;

    const newOtp = [...otp];
    newOtp[index] = value;
    setOtp(newOtp);

    if (value && index < OTP_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus();
    }

    if (value && index === OTP_LENGTH - 1) {
      const fullOtp = newOtp.join('');
      if (fullOtp.length === OTP_LENGTH) {
        Keyboard.dismiss();
        handleVerify(fullOtp);
      }
    }
  };

  const handleKeyPress = (e: any, index: number) => {
    if (e.nativeEvent.key === 'Backspace' && !otp[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handleVerify = async (otpCode?: string) => {
    clearError();
    const code = otpCode || otp.join('');

    if (code.length !== OTP_LENGTH) {
      Alert.alert('Invalid OTP', 'Please enter the complete 6-digit code');
      return;
    }

    try {
      await verifyOtp(verification_id, code);
    } catch {
      Alert.alert(
        'Verification Failed',
        error || 'Invalid OTP code. Please try again.'
      );
      setOtp(Array(OTP_LENGTH).fill(''));
      inputRefs.current[0]?.focus();
    }
  };

  const handleResend = async () => {
    if (resendTimer > 0) return;

    setIsResending(true);
    try {
      await authService.resendOtp(phone_number);
      setResendTimer(60);
      setOtp(Array(OTP_LENGTH).fill(''));
      inputRefs.current[0]?.focus();
      Alert.alert(
        'OTP Sent',
        'A new verification code has been sent to your phone'
      );
    } catch {
      Alert.alert('Error', 'Failed to resend OTP. Please try again.');
    } finally {
      setIsResending(false);
    }
  };

  return (
    <AuthLayout
      onBack={() => navigation.goBack()}
      title="Verify your phone"
      subtitle="Enter the 6-digit code we sent to your number"
    >
      <View style={styles.phoneBadge}>
        <LinearGradient
          colors={[colors.primary + '22', colors.secondary + '18']}
          style={styles.phoneIconWrap}
        >
          <Ionicons name="chatbox-ellipses-outline" size={28} color={colors.primary} />
        </LinearGradient>
        <Text style={styles.phoneLabel}>Sent to</Text>
        <Text style={styles.phoneNumber}>{formatPhoneNumber(phone_number)}</Text>
      </View>

      <View style={styles.otpContainer}>
        {otp.map((digit, index) => (
          <TextInput
            key={index}
            ref={ref => {
              inputRefs.current[index] = ref;
            }}
            style={[
              styles.otpInput,
              digit ? styles.otpInputFilled : undefined,
              focusedIndex === index ? styles.otpInputFocused : undefined,
            ]}
            value={digit}
            onChangeText={value => handleOtpChange(value, index)}
            onKeyPress={e => handleKeyPress(e, index)}
            onFocus={() => setFocusedIndex(index)}
            keyboardType="number-pad"
            maxLength={1}
            selectTextOnFocus
          />
        ))}
      </View>

      {error && (
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle" size={18} color={colors.error} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      <Button
        title="Verify & continue"
        onPress={() => handleVerify()}
        loading={isLoading}
        fullWidth
        size="lg"
        disabled={otp.join('').length !== OTP_LENGTH}
      />

      <View style={styles.resendContainer}>
        <Text style={styles.resendText}>Didn't receive the code?</Text>
        {resendTimer > 0 ? (
          <View style={styles.timerBadge}>
            <Text style={styles.timerText}>Resend in {resendTimer}s</Text>
          </View>
        ) : (
          <TouchableOpacity onPress={handleResend} disabled={isResending}>
            <Text style={styles.resendLink}>
              {isResending ? 'Sending...' : 'Resend code'}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.infoContainer}>
        <Ionicons name="information-circle-outline" size={20} color={colors.primary} />
        <Text style={styles.infoText}>
          {isNewUser
            ? 'After verification, your account will be created and you can start bidding right away.'
            : 'Enter the code to complete your login securely.'}
        </Text>
      </View>
    </AuthLayout>
  );
};

const createStyles = (colors: ThemeColors, mode: 'light' | 'dark') =>
  StyleSheet.create({
    phoneBadge: {
      alignItems: 'center',
      marginBottom: spacing.xl,
      paddingVertical: spacing.lg,
      borderRadius: borderRadius.xl,
      backgroundColor: colors.surfaceLight,
      borderWidth: 1,
      borderColor: colors.border,
    },
    phoneIconWrap: {
      width: 56,
      height: 56,
      borderRadius: borderRadius.full,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: spacing.sm,
    },
    phoneLabel: {
      fontSize: fonts.sizes.sm,
      color: colors.textMuted,
    },
    phoneNumber: {
      fontSize: fonts.sizes.lg,
      fontWeight: '700',
      color: colors.text,
      marginTop: spacing.xs,
    },
    otpContainer: {
      flexDirection: 'row',
      justifyContent: 'center',
      marginBottom: spacing.xl,
      gap: spacing.sm,
    },
    otpInput: {
      flex: 1,
      maxWidth: 48,
      height: 56,
      backgroundColor:
        mode === 'dark' ? colors.backgroundLight : colors.surfaceLight,
      borderRadius: borderRadius.lg,
      borderWidth: 1.5,
      borderColor: colors.border,
      fontSize: fonts.sizes.xxl,
      fontWeight: '700',
      color: colors.text,
      textAlign: 'center',
    },
    otpInputFilled: {
      borderColor: colors.primary,
      backgroundColor: colors.primary + '10',
    },
    otpInputFocused: {
      borderColor: colors.primaryLight,
      shadowColor: colors.primary,
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.25,
      shadowRadius: 8,
      elevation: 4,
    },
    errorContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      backgroundColor: colors.error + '15',
      padding: spacing.md,
      borderRadius: borderRadius.lg,
      marginBottom: spacing.lg,
      borderWidth: 1,
      borderColor: colors.error + '33',
    },
    errorText: {
      flex: 1,
      color: colors.error,
      fontSize: fonts.sizes.sm,
    },
    resendContainer: {
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      gap: spacing.sm,
      marginTop: spacing.xl,
    },
    resendText: {
      color: colors.textSecondary,
      fontSize: fonts.sizes.md,
    },
    timerBadge: {
      paddingVertical: spacing.xs,
      paddingHorizontal: spacing.sm,
      borderRadius: borderRadius.full,
      backgroundColor: colors.surfaceLight,
    },
    timerText: {
      color: colors.textMuted,
      fontSize: fonts.sizes.sm,
      fontWeight: '600',
    },
    resendLink: {
      color: colors.primary,
      fontSize: fonts.sizes.md,
      fontWeight: '700',
    },
    infoContainer: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      backgroundColor: colors.primary + '10',
      padding: spacing.lg,
      borderRadius: borderRadius.lg,
      marginTop: spacing.xl,
      gap: spacing.md,
      borderWidth: 1,
      borderColor: colors.primary + '22',
    },
    infoText: {
      flex: 1,
      color: colors.textSecondary,
      fontSize: fonts.sizes.sm,
      lineHeight: 20,
    },
  });
