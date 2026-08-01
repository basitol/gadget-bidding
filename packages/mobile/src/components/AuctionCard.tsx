import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, fonts, borderRadius, spacing, shadows } from '../constants';
import { Auction } from '../types';
import { formatCurrency, formatCountdown, getConditionLabel, getConditionColor } from '../utils';
import { mediaUrl } from '../utils/images';

const { width } = Dimensions.get('window');
const CARD_WIDTH = (width - spacing.lg * 3) / 2;

interface AuctionCardProps {
  auction: Auction;
  onPress: () => void;
  variant?: 'grid' | 'list' | 'featured';
}

export const AuctionCard: React.FC<AuctionCardProps> = ({
  auction,
  onPress,
  variant = 'grid',
}) => {
  const [countdown, setCountdown] = useState(formatCountdown(auction.end_time));

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown(formatCountdown(auction.end_time));
    }, 1000);

    return () => clearInterval(timer);
  }, [auction.end_time]);

  const isEnding = countdown.includes('m') || countdown.includes('s');
  const isEnded = countdown === 'Ended';

  if (variant === 'featured') {
    return (
      <TouchableOpacity
        onPress={onPress}
        activeOpacity={0.9}
        style={styles.featuredContainer}
      >
        <Image
          source={{ uri: mediaUrl(auction.gadget?.images?.[0]) || 'https://via.placeholder.com/400' }}
          style={styles.featuredImage}
          resizeMode="cover"
        />
        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.9)']}
          style={styles.featuredGradient}
        >
          <View style={styles.featuredContent}>
            <View style={styles.featuredBadges}>
              {auction.gadget?.condition && (
                <View
                  style={[
                    styles.conditionBadge,
                    { backgroundColor: getConditionColor(auction.gadget.condition) },
                  ]}
                >
                  <Text style={styles.conditionText}>
                    {getConditionLabel(auction.gadget.condition)}
                  </Text>
                </View>
              )}
              <View style={[styles.timeBadge, isEnding ? styles.urgentBadge : undefined]}>
                <Text style={styles.timeText}>⏱️ {countdown}</Text>
              </View>
            </View>
            <Text style={styles.featuredTitle} numberOfLines={2}>
              {auction.gadget?.title}
            </Text>
            <View style={styles.featuredPriceRow}>
              <View>
                <Text style={styles.priceLabel}>Current Bid</Text>
                <Text style={styles.featuredPrice}>
                  {formatCurrency(auction.current_price)}
                </Text>
              </View>
              <View style={styles.bidCountContainer}>
                <Text style={styles.bidCount}>{auction.bid_count} bids</Text>
              </View>
            </View>
          </View>
        </LinearGradient>
      </TouchableOpacity>
    );
  }

  if (variant === 'list') {
    return (
      <TouchableOpacity
        onPress={onPress}
        activeOpacity={0.8}
        style={styles.listContainer}
      >
        <Image
          source={{ uri: mediaUrl(auction.gadget?.images?.[0]) || 'https://via.placeholder.com/150' }}
          style={styles.listImage}
          resizeMode="cover"
        />
        <View style={styles.listContent}>
          <Text style={styles.listTitle} numberOfLines={2}>
            {auction.gadget?.title}
          </Text>
          <View style={styles.listMeta}>
            {auction.gadget?.condition && (
              <View
                style={[
                  styles.smallConditionBadge,
                  { backgroundColor: getConditionColor(auction.gadget.condition) + '30' },
                ]}
              >
                <Text
                  style={[
                    styles.smallConditionText,
                    { color: getConditionColor(auction.gadget.condition) },
                  ]}
                >
                  {getConditionLabel(auction.gadget.condition)}
                </Text>
              </View>
            )}
            <Text style={styles.listBids}>{auction.bid_count} bids</Text>
          </View>
          <View style={styles.listPriceRow}>
            <Text style={styles.listPrice}>
              {formatCurrency(auction.current_price)}
            </Text>
            <View style={[styles.listTimeBadge, isEnding ? styles.urgentBadge : undefined]}>
              <Text style={[styles.listTimeText, isEnding ? styles.urgentText : undefined]}>
                {countdown}
              </Text>
            </View>
          </View>
        </View>
      </TouchableOpacity>
    );
  }

  // Grid variant (default)
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      style={styles.gridContainer}
    >
      <View style={styles.imageContainer}>
        <Image
          source={{ uri: mediaUrl(auction.gadget?.images?.[0]) || 'https://via.placeholder.com/200' }}
          style={styles.gridImage}
          resizeMode="cover"
        />
        {!isEnded && (
          <View style={[styles.gridTimeBadge, isEnding ? styles.urgentBadge : undefined]}>
            <Text style={[styles.gridTimeText, isEnding ? styles.urgentText : undefined]}>
              {countdown}
            </Text>
          </View>
        )}
        {isEnded && (
          <View style={styles.endedOverlay}>
            <Text style={styles.endedText}>ENDED</Text>
          </View>
        )}
      </View>
      <View style={styles.gridContent}>
        <Text style={styles.gridTitle} numberOfLines={2}>
          {auction.gadget?.title}
        </Text>
        <Text style={styles.gridPrice}>
          {formatCurrency(auction.current_price)}
        </Text>
        <Text style={styles.gridBids}>{auction.bid_count} bids</Text>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  // Featured variant
  featuredContainer: {
    width: width - spacing.lg * 2,
    height: 280,
    borderRadius: borderRadius.xl,
    overflow: 'hidden',
    marginRight: spacing.md,
    ...shadows.lg,
  },
  featuredImage: {
    width: '100%',
    height: '100%',
  },
  featuredGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '70%',
    justifyContent: 'flex-end',
    padding: spacing.lg,
  },
  featuredContent: {},
  featuredBadges: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  conditionBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.sm,
  },
  conditionText: {
    color: colors.text,
    fontSize: fonts.sizes.xs,
    fontWeight: '600',
  },
  timeBadge: {
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.sm,
  },
  urgentBadge: {
    backgroundColor: colors.error,
  },
  timeText: {
    color: colors.text,
    fontSize: fonts.sizes.xs,
    fontWeight: '600',
  },
  featuredTitle: {
    color: colors.text,
    fontSize: fonts.sizes.xl,
    fontWeight: '700',
    marginBottom: spacing.sm,
  },
  featuredPriceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  priceLabel: {
    color: colors.textSecondary,
    fontSize: fonts.sizes.xs,
  },
  featuredPrice: {
    color: colors.secondary,
    fontSize: fonts.sizes.xxl,
    fontWeight: '700',
  },
  bidCountContainer: {
    backgroundColor: colors.primary + '30',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
  },
  bidCount: {
    color: colors.primaryLight,
    fontSize: fonts.sizes.sm,
    fontWeight: '600',
  },

  // List variant
  listContainer: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
    marginBottom: spacing.md,
    ...shadows.sm,
  },
  listImage: {
    width: 120,
    height: 120,
  },
  listContent: {
    flex: 1,
    padding: spacing.md,
    justifyContent: 'space-between',
  },
  listTitle: {
    color: colors.text,
    fontSize: fonts.sizes.md,
    fontWeight: '600',
  },
  listMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  smallConditionBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
  },
  smallConditionText: {
    fontSize: fonts.sizes.xs,
    fontWeight: '600',
  },
  listBids: {
    color: colors.textSecondary,
    fontSize: fonts.sizes.xs,
  },
  listPriceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  listPrice: {
    color: colors.secondary,
    fontSize: fonts.sizes.lg,
    fontWeight: '700',
  },
  listTimeBadge: {
    backgroundColor: colors.surfaceLight,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.sm,
  },
  listTimeText: {
    color: colors.textSecondary,
    fontSize: fonts.sizes.xs,
    fontWeight: '600',
  },
  urgentText: {
    color: colors.text,
  },

  // Grid variant
  gridContainer: {
    width: CARD_WIDTH,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
    marginBottom: spacing.md,
    ...shadows.sm,
  },
  imageContainer: {
    position: 'relative',
  },
  gridImage: {
    width: '100%',
    height: CARD_WIDTH,
  },
  gridTimeBadge: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.sm,
  },
  gridTimeText: {
    color: colors.text,
    fontSize: fonts.sizes.xs,
    fontWeight: '600',
  },
  endedOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  endedText: {
    color: colors.text,
    fontSize: fonts.sizes.lg,
    fontWeight: '700',
  },
  gridContent: {
    padding: spacing.md,
  },
  gridTitle: {
    color: colors.text,
    fontSize: fonts.sizes.sm,
    fontWeight: '600',
    marginBottom: spacing.xs,
    height: 36,
  },
  gridPrice: {
    color: colors.secondary,
    fontSize: fonts.sizes.lg,
    fontWeight: '700',
  },
  gridBids: {
    color: colors.textSecondary,
    fontSize: fonts.sizes.xs,
    marginTop: spacing.xs,
  },
});

