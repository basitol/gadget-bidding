import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../hooks';
import { ThemeColors, fonts, spacing, borderRadius, shadows } from '../../constants';
import { Auction } from '../../types';
import { formatCurrency, formatCountdown } from '../../utils';

const { width } = Dimensions.get('window');

interface LiveAuctionCardProps {
  auction: Auction;
  onPress: () => void;
  onQuickBid?: () => void;
}

export const LiveAuctionCard: React.FC<LiveAuctionCardProps> = ({
  auction,
  onPress,
  onQuickBid,
}) => {
  const { colors, mode } = useTheme();
  const styles = useMemo(() => createStyles(colors, mode), [colors, mode]);
  const [countdown, setCountdown] = useState(formatCountdown(auction.end_time));

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown(formatCountdown(auction.end_time));
    }, 1000);
    return () => clearInterval(timer);
  }, [auction.end_time]);

  const imageUri =
    auction.gadget?.images?.[0] || 'https://via.placeholder.com/400x260';
  const subtitle = [
    auction.gadget?.brand,
    auction.gadget?.model,
    auction.gadget?.condition?.replace('_', ' '),
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <View style={styles.card}>
      <TouchableOpacity onPress={onPress} activeOpacity={0.92}>
        <View style={styles.imageWrap}>
        <Image source={{ uri: imageUri }} style={styles.image} resizeMode="cover" />
        <LinearGradient
          colors={['transparent', 'rgba(3,7,18,0.85)']}
          style={styles.imageGradient}
        />
        <View style={styles.imageBadges}>
          <View style={styles.liveBadge}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>LIVE</Text>
          </View>
          <View style={styles.timeBadge}>
            <Ionicons name="time-outline" size={12} color="#FFFFFF" />
            <Text style={styles.timeText}>{countdown} left</Text>
          </View>
        </View>
        <Text style={styles.bidsHour}>{auction.bid_count} bids this hour</Text>
        </View>
      </TouchableOpacity>

      <View style={styles.body}>
        <View style={styles.titleRow}>
          <View style={styles.titleCol}>
            <Text style={styles.title} numberOfLines={1}>
              {auction.gadget?.title}
            </Text>
            {!!subtitle && (
              <Text style={styles.subtitle} numberOfLines={1}>
                {subtitle}
              </Text>
            )}
          </View>
          <View style={styles.verifiedBadge}>
            <Ionicons name="shield-checkmark" size={12} color={colors.success} />
            <Text style={styles.verifiedText}>Verified</Text>
          </View>
        </View>

        <View style={styles.bidRow}>
          <View>
            <Text style={styles.bidLabel}>CURRENT BID</Text>
            <Text style={styles.bidAmount}>
              {formatCurrency(auction.current_price)}
            </Text>
          </View>
          <View style={styles.bidMeta}>
            <Text style={styles.bidCount}>{auction.bid_count}</Text>
            <Text style={styles.bidCountLabel}>Total Bids</Text>
          </View>
        </View>

        <View style={styles.footer}>
          <View style={styles.avatarRow}>
            {[0, 1, 2].map(i => (
              <View
                key={i}
                style={[styles.avatar, i > 0 && { marginLeft: -8 }]}
              >
                <Text style={styles.avatarText}>{String.fromCharCode(65 + i)}</Text>
              </View>
            ))}
          </View>
          <TouchableOpacity
            style={styles.quickBidBtn}
            activeOpacity={0.85}
            onPress={onQuickBid || onPress}
          >
            <Ionicons name="hammer-outline" size={16} color="#FFFFFF" />
            <Text style={styles.quickBidText}>Quick Bid</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

const createStyles = (colors: ThemeColors, mode: 'light' | 'dark') =>
  StyleSheet.create({
    card: {
      width: width - spacing.lg * 2,
      borderRadius: borderRadius.xxl,
      overflow: 'hidden',
      backgroundColor: mode === 'dark' ? colors.surface : colors.backgroundLight,
      borderWidth: 1,
      borderColor: colors.border,
      marginBottom: spacing.lg,
      ...shadows.md,
    },
    imageWrap: {
      height: 220,
      position: 'relative',
    },
    image: {
      width: '100%',
      height: '100%',
    },
    imageGradient: {
      ...StyleSheet.absoluteFillObject,
    },
    imageBadges: {
      position: 'absolute',
      top: spacing.md,
      left: spacing.md,
      right: spacing.md,
      flexDirection: 'row',
      justifyContent: 'space-between',
    },
    liveBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: colors.error,
      paddingHorizontal: spacing.sm,
      paddingVertical: 6,
      borderRadius: borderRadius.full,
    },
    liveDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: '#FFFFFF',
    },
    liveText: {
      color: '#FFFFFF',
      fontSize: fonts.sizes.xs,
      fontFamily: fonts.bold,
    },
    timeBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: 'rgba(0,0,0,0.55)',
      paddingHorizontal: spacing.sm,
      paddingVertical: 6,
      borderRadius: borderRadius.full,
    },
    timeText: {
      color: '#FFFFFF',
      fontSize: fonts.sizes.xs,
      fontFamily: fonts.semiBold,
    },
    bidsHour: {
      position: 'absolute',
      bottom: spacing.md,
      left: spacing.md,
      color: 'rgba(255,255,255,0.88)',
      fontSize: fonts.sizes.xs,
      fontFamily: fonts.medium,
    },
    body: {
      padding: spacing.lg,
    },
    titleRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      gap: spacing.sm,
      marginBottom: spacing.md,
    },
    titleCol: {
      flex: 1,
    },
    title: {
      color: colors.text,
      fontSize: fonts.sizes.lg,
      fontFamily: fonts.bold,
      letterSpacing: -0.3,
    },
    subtitle: {
      color: colors.textSecondary,
      fontSize: fonts.sizes.sm,
      fontFamily: fonts.medium,
      marginTop: 4,
      textTransform: 'capitalize',
    },
    verifiedBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: colors.success + '18',
      paddingHorizontal: spacing.sm,
      paddingVertical: 6,
      borderRadius: borderRadius.full,
      borderWidth: 1,
      borderColor: colors.success + '33',
    },
    verifiedText: {
      color: colors.success,
      fontSize: fonts.sizes.xs,
      fontFamily: fonts.semiBold,
    },
    bidRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-end',
      marginBottom: spacing.md,
    },
    bidLabel: {
      color: colors.textMuted,
      fontSize: fonts.sizes.xs,
      fontFamily: fonts.semiBold,
      letterSpacing: 0.8,
      marginBottom: 4,
    },
    bidAmount: {
      color: colors.primary,
      fontSize: 28,
      fontFamily: fonts.extraBold,
      letterSpacing: -1,
    },
    bidMeta: {
      alignItems: 'flex-end',
    },
    bidCount: {
      color: colors.text,
      fontSize: fonts.sizes.xl,
      fontFamily: fonts.bold,
    },
    bidCountLabel: {
      color: colors.textMuted,
      fontSize: fonts.sizes.xs,
      fontFamily: fonts.medium,
    },
    footer: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    avatarRow: {
      flexDirection: 'row',
    },
    avatar: {
      width: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: colors.primary + '33',
      borderWidth: 2,
      borderColor: mode === 'dark' ? colors.surface : colors.backgroundLight,
      justifyContent: 'center',
      alignItems: 'center',
    },
    avatarText: {
      color: colors.primary,
      fontSize: 10,
      fontFamily: fonts.bold,
    },
    quickBidBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      backgroundColor: colors.primary,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm,
      borderRadius: borderRadius.full,
    },
    quickBidText: {
      color: '#FFFFFF',
      fontSize: fonts.sizes.sm,
      fontFamily: fonts.semiBold,
    },
  });
