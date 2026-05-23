import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../../hooks';
import { ThemeColors, fonts, spacing, borderRadius } from '../../constants';

interface BrandLogoProps {
  showTagline?: boolean;
  size?: 'sm' | 'md';
}

export const BrandLogo: React.FC<BrandLogoProps> = ({
  showTagline = false,
  size = 'md',
}) => {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors, size), [colors, size]);

  return (
    <View style={styles.wrap}>
      <LinearGradient
        colors={[colors.primary, colors.primaryDark]}
        style={styles.badge}
      >
        <Text style={styles.badgeText}>GB</Text>
      </LinearGradient>
      <View>
        <Text style={styles.name}>GadgetBid</Text>
        {showTagline && (
          <Text style={styles.tagline}>Auction. Escrow. Yours.</Text>
        )}
      </View>
    </View>
  );
};

const createStyles = (colors: ThemeColors, size: 'sm' | 'md') =>
  StyleSheet.create({
    wrap: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    badge: {
      width: size === 'sm' ? 36 : 42,
      height: size === 'sm' ? 36 : 42,
      borderRadius: borderRadius.lg,
      justifyContent: 'center',
      alignItems: 'center',
    },
    badgeText: {
      color: '#FFFFFF',
      fontSize: size === 'sm' ? 14 : 16,
      fontFamily: fonts.extraBold,
      letterSpacing: -0.5,
    },
    name: {
      color: colors.text,
      fontSize: size === 'sm' ? 16 : 18,
      fontFamily: fonts.bold,
      letterSpacing: -0.5,
    },
    tagline: {
      color: colors.textMuted,
      fontSize: fonts.sizes.xs,
      fontFamily: fonts.medium,
      marginTop: 2,
    },
  });
