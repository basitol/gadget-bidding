import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { AuthLayout } from '../../components/auth';
import { AuthStackParamList } from '../../navigation/AuthNavigator';
import { useTheme } from '../../hooks';
import { ThemeColors, fonts, spacing, borderRadius, glow } from '../../constants';

type SplashScreenProps = {
  navigation: NativeStackNavigationProp<AuthStackParamList, 'Splash'>;
};

export const SplashScreen: React.FC<SplashScreenProps> = ({ navigation }) => {
  const { mode, colors } = useTheme();
  const styles = useMemo(() => createStyles(colors, mode), [colors, mode]);

  return (
    <AuthLayout frameless contentStyle={styles.contentStyle}>
      <View style={styles.hero}>
        <LinearGradient
          colors={[colors.primaryLight, colors.primary]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.logo}
        >
          <Text style={styles.logoText}>GB</Text>
        </LinearGradient>
        <Text style={styles.headline}>GadgetBid</Text>
        <Text style={styles.subheadline}>
          Nigeria's premier gadget auction platform
        </Text>
      </View>

      <View style={styles.actions}>
        <TouchableOpacity
          style={styles.primaryButtonWrap}
          onPress={() => navigation.navigate('Login', { interfaceType: 'buyer' })}
          activeOpacity={0.9}
        >
          <LinearGradient
            colors={[colors.primaryLight, colors.primary]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.primaryButton}
          >
            <Text style={styles.primaryButtonText}>Sign in</Text>
            <Ionicons name="arrow-forward" size={18} color="#FFFFFF" />
          </LinearGradient>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={() => navigation.navigate('Register', { interfaceType: 'buyer' })}
          activeOpacity={0.85}
        >
          <Text style={styles.secondaryButtonText}>Create account</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.note}>
        Buyers and sellers use separate secure account paths.
      </Text>
    </AuthLayout>
  );
};

const createStyles = (colors: ThemeColors, mode: 'light' | 'dark') =>
  StyleSheet.create({
    contentStyle: {
      alignItems: 'stretch',
      justifyContent: 'center',
    },
    hero: {
      alignItems: 'center',
      marginBottom: spacing.xxxl,
    },
    logo: {
      width: 88,
      height: 88,
      borderRadius: 28,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: spacing.lg,
      ...glow(colors.primary),
    },
    logoText: {
      color: '#FFFFFF',
      fontSize: 30,
      fontFamily: fonts.extraBold,
      letterSpacing: 0,
    },
    headline: {
      color: colors.text,
      fontSize: 32,
      fontFamily: fonts.extraBold,
      letterSpacing: 0,
      textAlign: 'center',
    },
    subheadline: {
      color: colors.textSecondary,
      fontSize: fonts.sizes.md,
      fontFamily: fonts.medium,
      marginTop: spacing.sm,
      textAlign: 'center',
      maxWidth: 260,
    },
    actions: {
      gap: spacing.md,
      width: '100%',
      marginTop: spacing.xxxl,
    },
    primaryButtonWrap: {
      borderRadius: borderRadius.full,
      ...glow(colors.primary),
    },
    primaryButton: {
      height: 56,
      borderRadius: borderRadius.full,
      flexDirection: 'row',
      gap: spacing.sm,
      justifyContent: 'center',
      alignItems: 'center',
    },
    primaryButtonText: {
      color: '#FFFFFF',
      fontSize: fonts.sizes.lg,
      fontFamily: fonts.bold,
    },
    secondaryButton: {
      height: 56,
      borderRadius: borderRadius.full,
      backgroundColor: mode === 'dark' ? colors.surface : colors.backgroundLight,
      justifyContent: 'center',
      alignItems: 'center',
      borderWidth: 1,
      borderColor: colors.border,
    },
    secondaryButtonText: {
      color: colors.text,
      fontSize: fonts.sizes.lg,
      fontFamily: fonts.bold,
    },
    note: {
      color: colors.textMuted,
      fontSize: fonts.sizes.sm,
      fontFamily: fonts.medium,
      textAlign: 'center',
      marginTop: spacing.xxl,
      lineHeight: 18,
    },
  });
