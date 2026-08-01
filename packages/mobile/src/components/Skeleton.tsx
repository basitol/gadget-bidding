import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, StyleSheet, View, ViewStyle, Easing } from 'react-native';
import { useTheme } from '../hooks';
import { ThemeColors, borderRadius, spacing } from '../constants';

interface SkeletonProps {
  width?: number | `${number}%`;
  height?: number;
  radius?: number;
  style?: ViewStyle;
}

/** A single shimmering placeholder block. */
export const Skeleton: React.FC<SkeletonProps> = ({
  width = '100%',
  height = 16,
  radius = borderRadius.sm,
  style,
}) => {
  const { mode, colors } = useTheme();
  const shimmer = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(shimmer, {
        toValue: 1,
        duration: 1100,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: true,
      })
    );
    loop.start();
    return () => loop.stop();
  }, [shimmer]);

  const opacity = shimmer.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0.4, 0.85, 0.4],
  });

  return (
    <Animated.View
      style={[
        {
          width,
          height,
          borderRadius: radius,
          opacity,
          backgroundColor: mode === 'dark' ? colors.surfaceLight : colors.border,
        },
        style,
      ]}
    />
  );
};

/** Card-shaped skeleton matching LiveAuctionCard, for list loading states. */
export const AuctionCardSkeleton: React.FC = () => {
  const { mode, colors } = useTheme();
  const styles = useMemo(() => createStyles(colors, mode), [colors, mode]);

  return (
    <View style={styles.card}>
      <Skeleton height={220} radius={0} />
      <View style={styles.body}>
        <Skeleton width="70%" height={18} />
        <Skeleton width="45%" height={12} style={{ marginTop: spacing.sm }} />
        <View style={styles.row}>
          <Skeleton width={120} height={28} radius={borderRadius.md} />
          <Skeleton width={90} height={36} radius={borderRadius.full} />
        </View>
      </View>
    </View>
  );
};

const createStyles = (colors: ThemeColors, mode: 'light' | 'dark') =>
  StyleSheet.create({
    card: {
      borderRadius: borderRadius.xxl,
      overflow: 'hidden',
      backgroundColor: mode === 'dark' ? colors.surface : colors.backgroundLight,
      borderWidth: 1,
      borderColor: colors.border,
      marginBottom: spacing.lg,
    },
    body: {
      padding: spacing.lg,
    },
    row: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginTop: spacing.lg,
    },
  });
