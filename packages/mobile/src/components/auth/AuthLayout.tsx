import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
  ViewStyle,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../hooks';
import { ThemeColors, fonts, spacing, borderRadius, shadows } from '../../constants';

const HERO_DARK = ['#030712', '#0A1628', '#0F1D32'];
const HERO_LIGHT = ['#F8FAFC', '#EFF6FF', '#F8FAFC'];
const CONTENT_MAX_WIDTH = 420;

interface AuthLayoutProps {
  children: React.ReactNode;
  footer?: React.ReactNode;
  onBack?: () => void;
  title?: string;
  subtitle?: string;
  showBrand?: boolean;
  contentStyle?: ViewStyle;
}

export const AuthLayout: React.FC<AuthLayoutProps> = ({
  children,
  footer,
  onBack,
  title,
  subtitle,
  showBrand = false,
  contentStyle,
}) => {
  const { mode, colors } = useTheme();
  const { height } = useWindowDimensions();
  const styles = useMemo(() => createStyles(colors, mode), [colors, mode]);

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={mode === 'dark' ? HERO_DARK : HERO_LIGHT}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.glowPrimary} />
      <View style={styles.glowSecondary} />

      <SafeAreaView style={styles.safeArea}>
        {onBack && (
          <TouchableOpacity
            onPress={onBack}
            style={styles.backButton}
            activeOpacity={0.8}
          >
            <Ionicons name="arrow-back" size={20} color={colors.text} />
          </TouchableOpacity>
        )}

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.keyboardView}
        >
          <ScrollView
            contentContainerStyle={[
              styles.scrollContent,
              { minHeight: height * 0.88 },
              onBack ? styles.scrollContentWithBack : undefined,
              contentStyle,
            ]}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            bounces={false}
          >
            <View style={styles.centeredColumn}>
              {showBrand && (
                <View style={styles.brandSection}>
                  <LinearGradient
                    colors={[colors.primary, colors.secondary]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.logoBadge}
                  >
                    <Text style={styles.logoText}>GB</Text>
                  </LinearGradient>
                  <Text style={styles.brandName}>GadgetBid</Text>
                  <Text style={styles.brandTagline}>
                    Nigeria's premier gadget auction platform
                  </Text>
                </View>
              )}

              {(title || subtitle) && (
                <View style={styles.header}>
                  {title && <Text style={styles.title}>{title}</Text>}
                  {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
                </View>
              )}

              <View style={styles.card}>{children}</View>

              {footer && <View style={styles.footer}>{footer}</View>}
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
};

const createStyles = (colors: ThemeColors, mode: 'light' | 'dark') =>
  StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: colors.background,
    },
    glowPrimary: {
      position: 'absolute',
      top: -80,
      right: -40,
      width: 220,
      height: 220,
      borderRadius: 110,
      backgroundColor: colors.primary,
      opacity: mode === 'dark' ? 0.18 : 0.12,
    },
    glowSecondary: {
      position: 'absolute',
      top: 120,
      left: -60,
      width: 180,
      height: 180,
      borderRadius: 90,
      backgroundColor: colors.secondary,
      opacity: mode === 'dark' ? 0.12 : 0.08,
    },
    safeArea: {
      flex: 1,
    },
    backButton: {
      position: 'absolute',
      top: spacing.sm,
      left: spacing.xl,
      zIndex: 10,
      width: 44,
      height: 44,
      borderRadius: borderRadius.full,
      backgroundColor:
        mode === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.9)',
      borderWidth: 1,
      borderColor: colors.border,
      justifyContent: 'center',
      alignItems: 'center',
      ...shadows.sm,
    },
    keyboardView: {
      flex: 1,
    },
    scrollContent: {
      flexGrow: 1,
      justifyContent: 'center',
      paddingHorizontal: spacing.xl,
      paddingVertical: spacing.xxl,
    },
    scrollContentWithBack: {
      paddingTop: spacing.xxxl + spacing.xl,
    },
    centeredColumn: {
      width: '100%',
      maxWidth: CONTENT_MAX_WIDTH,
      alignSelf: 'center',
      alignItems: 'center',
    },
    brandSection: {
      alignItems: 'center',
      marginBottom: spacing.xl,
    },
    logoBadge: {
      width: 72,
      height: 72,
      borderRadius: borderRadius.xxl,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: spacing.md,
      ...shadows.lg,
    },
    logoText: {
      fontSize: fonts.sizes.xxxl,
      fontWeight: '800',
      color: '#FFFFFF',
      letterSpacing: -1,
    },
    brandName: {
      fontSize: fonts.sizes.xxxl,
      fontWeight: '800',
      color: colors.text,
      letterSpacing: -0.5,
      marginBottom: spacing.xs,
      textAlign: 'center',
    },
    brandTagline: {
      fontSize: fonts.sizes.md,
      color: colors.textSecondary,
      textAlign: 'center',
      lineHeight: 22,
      maxWidth: 280,
    },
    header: {
      width: '100%',
      alignItems: 'center',
      marginBottom: spacing.lg,
    },
    title: {
      fontSize: fonts.sizes.xxl,
      fontWeight: '700',
      color: colors.text,
      letterSpacing: -0.5,
      marginBottom: spacing.xs,
      textAlign: 'center',
    },
    subtitle: {
      fontSize: fonts.sizes.md,
      color: colors.textSecondary,
      lineHeight: 22,
      textAlign: 'center',
      maxWidth: 320,
    },
    card: {
      width: '100%',
      backgroundColor:
        mode === 'dark' ? 'rgba(15, 29, 50, 0.85)' : 'rgba(255, 255, 255, 0.92)',
      borderRadius: borderRadius.xxl,
      padding: spacing.xl,
      borderWidth: 1,
      borderColor: colors.border,
      ...shadows.md,
    },
    footer: {
      width: '100%',
      alignItems: 'center',
      marginTop: spacing.lg,
    },
  });
