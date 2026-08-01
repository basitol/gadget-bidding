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
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../hooks';
import { ThemeColors, fonts, spacing, borderRadius, shadows } from '../../constants';
import { FadeInView } from '../FadeInView';

const HERO_DARK = ['#030712', '#0A1628', '#0F1D32'] as const;
const HERO_LIGHT = ['#F8FAFC', '#EFF6FF', '#F8FAFC'] as const;
const CONTENT_MAX_WIDTH = 420;

interface AuthLayoutProps {
  children: React.ReactNode;
  footer?: React.ReactNode;
  onBack?: () => void;
  title?: string;
  subtitle?: string;
  showBrand?: boolean;
  frameless?: boolean;
  contentStyle?: ViewStyle;
}

export const AuthLayout: React.FC<AuthLayoutProps> = ({
  children,
  footer,
  onBack,
  title,
  subtitle,
  showBrand = false,
  frameless = false,
  contentStyle,
}) => {
  const { mode, colors } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors, mode), [colors, mode]);

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={mode === 'dark' ? HERO_DARK : HERO_LIGHT}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.glowPrimary} />
      <View style={styles.glowSecondary} />

      {onBack && (
        <TouchableOpacity
          onPress={onBack}
          style={[styles.backButton, { top: insets.top + spacing.xxl }]}
          activeOpacity={0.8}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Ionicons name="arrow-back" size={20} color={colors.text} />
        </TouchableOpacity>
      )}

      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.keyboardView}
        >
          <ScrollView
            contentContainerStyle={[
              styles.scrollContent,
              onBack ? styles.scrollContentWithBack : undefined,
              contentStyle,
            ]}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            bounces={false}
          >
            <FadeInView style={styles.centeredColumn} offset={16}>
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

              {frameless ? (
                <View style={styles.framelessContent}>{children}</View>
              ) : (
                <View style={styles.card}>{children}</View>
              )}

              {footer && <View style={styles.footer}>{footer}</View>}
            </FadeInView>
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
      left: spacing.xl,
      zIndex: 20,
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
      elevation: 20,
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
      paddingTop: spacing.xxxl + spacing.xxl,
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
      fontFamily: fonts.extraBold,
      color: '#FFFFFF',
      letterSpacing: 0,
    },
    brandName: {
      fontSize: fonts.sizes.xxxl,
      fontFamily: fonts.extraBold,
      color: colors.text,
      letterSpacing: 0,
      marginBottom: spacing.xs,
      textAlign: 'center',
    },
    brandTagline: {
      fontSize: fonts.sizes.md,
      fontFamily: fonts.regular,
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
      fontFamily: fonts.bold,
      color: colors.text,
      letterSpacing: 0,
      marginBottom: spacing.xs,
      textAlign: 'center',
    },
    subtitle: {
      fontSize: fonts.sizes.md,
      fontFamily: fonts.regular,
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
    framelessContent: {
      width: '100%',
    },
    footer: {
      width: '100%',
      alignItems: 'center',
      marginTop: spacing.lg,
    },
  });
