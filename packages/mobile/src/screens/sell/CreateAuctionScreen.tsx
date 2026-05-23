import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, fonts, spacing, borderRadius } from '../../constants';
import { Button, Input } from '../../components';
import { auctionService } from '../../services';
import { formatCurrency } from '../../utils';

type CreateAuctionScreenProps = {
  navigation: any;
  route: any;
};

const DURATION_OPTIONS = [
  { id: '1', label: '1 Day', hours: 24 },
  { id: '3', label: '3 Days', hours: 72 },
  { id: '5', label: '5 Days', hours: 120 },
  { id: '7', label: '7 Days', hours: 168 },
];

export const CreateAuctionScreen: React.FC<CreateAuctionScreenProps> = ({
  navigation,
  route,
}) => {
  const { gadgetId } = route.params || {};

  const [startingPrice, setStartingPrice] = useState('');
  const [reservePrice, setReservePrice] = useState('');
  const [buyNowPrice, setBuyNowPrice] = useState('');
  const [bidIncrement, setBidIncrement] = useState('2000');
  const [duration, setDuration] = useState('3');
  const [startNow, setStartNow] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    const startPrice = parseFloat(startingPrice);
    const reserve = parseFloat(reservePrice);
    const buyNow = parseFloat(buyNowPrice);
    const increment = parseFloat(bidIncrement);

    if (!startingPrice || isNaN(startPrice) || startPrice < 1000) {
      newErrors.startingPrice = 'Starting price must be at least ₦1,000';
    }

    if (reservePrice && !isNaN(reserve) && reserve < startPrice) {
      newErrors.reservePrice =
        'Reserve price must be higher than starting price';
    }

    if (buyNowPrice && !isNaN(buyNow) && buyNow <= startPrice) {
      newErrors.buyNowPrice =
        'Buy Now price must be higher than starting price';
    }

    if (!bidIncrement || isNaN(increment) || increment < 500) {
      newErrors.bidIncrement = 'Bid increment must be at least ₦500';
    }

    if (!duration) {
      newErrors.duration = 'Please select auction duration';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validateForm()) return;

    if (!gadgetId) {
      Alert.alert('Error', 'No gadget selected. Please create a gadget first.');
      return;
    }

    setIsLoading(true);
    try {
      const selectedDuration = DURATION_OPTIONS.find(d => d.id === duration);
      const startTime = startNow
        ? new Date()
        : new Date(Date.now() + 24 * 60 * 60 * 1000); // Start now or tomorrow
      const endTime = new Date(
        startTime.getTime() + (selectedDuration?.hours || 72) * 60 * 60 * 1000
      );

      await auctionService.createAuction({
        gadget_id: gadgetId,
        starting_price: parseFloat(startingPrice),
        reserve_price: reservePrice ? parseFloat(reservePrice) : undefined,
        buy_now_price: buyNowPrice ? parseFloat(buyNowPrice) : undefined,
        min_bid_increment: parseFloat(bidIncrement),
        start_time: startTime.toISOString(),
        end_time: endTime.toISOString(),
      });

      Alert.alert(
        'Success! 🎉',
        'Your auction has been created and is now live!',
        [
          {
            text: 'View My Auctions',
            onPress: () =>
              navigation.navigate('Profile', { screen: 'MyAuctions' }),
          },
          {
            text: 'Done',
            onPress: () => navigation.navigate('Home'),
          },
        ]
      );
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to create auction');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
        >
          <Text style={styles.backIcon}>←</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Create Auction</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
      >
        {/* Pricing Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Pricing</Text>
          <Text style={styles.sectionSubtitle}>
            Set your auction prices in Naira (₦)
          </Text>

          <Input
            label="Starting Price *"
            placeholder="e.g., 50000"
            value={startingPrice}
            onChangeText={setStartingPrice}
            keyboardType="number-pad"
            error={errors.startingPrice}
            leftIcon={<Text style={styles.currencyIcon}>₦</Text>}
          />

          <Input
            label="Reserve Price (Optional)"
            placeholder="Minimum price to sell"
            value={reservePrice}
            onChangeText={setReservePrice}
            keyboardType="number-pad"
            error={errors.reservePrice}
            leftIcon={<Text style={styles.currencyIcon}>₦</Text>}
          />

          <Input
            label="Buy Now Price (Optional)"
            placeholder="Instant purchase price"
            value={buyNowPrice}
            onChangeText={setBuyNowPrice}
            keyboardType="number-pad"
            error={errors.buyNowPrice}
            leftIcon={<Text style={styles.currencyIcon}>₦</Text>}
          />

          <Input
            label="Minimum Bid Increment *"
            placeholder="e.g., 2000"
            value={bidIncrement}
            onChangeText={setBidIncrement}
            keyboardType="number-pad"
            error={errors.bidIncrement}
            leftIcon={<Text style={styles.currencyIcon}>₦</Text>}
          />
        </View>

        {/* Duration Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Duration</Text>
          <Text style={styles.sectionSubtitle}>
            How long should the auction run?
          </Text>

          <View style={styles.durationGrid}>
            {DURATION_OPTIONS.map(opt => (
              <TouchableOpacity
                key={opt.id}
                style={[
                  styles.durationItem,
                  duration === opt.id ? styles.durationItemSelected : undefined,
                ]}
                onPress={() => setDuration(opt.id)}
              >
                <Text
                  style={[
                    styles.durationText,
                    duration === opt.id
                      ? styles.durationTextSelected
                      : undefined,
                  ]}
                >
                  {opt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          {errors.duration && (
            <Text style={styles.errorText}>{errors.duration}</Text>
          )}
        </View>

        {/* Start Time Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Start Time</Text>

          <TouchableOpacity
            style={[
              styles.startOption,
              startNow ? styles.startOptionSelected : undefined,
            ]}
            onPress={() => setStartNow(true)}
          >
            <View style={styles.radioOuter}>
              {startNow && <View style={styles.radioInner} />}
            </View>
            <View style={styles.startOptionContent}>
              <Text
                style={[
                  styles.startOptionTitle,
                  startNow ? styles.startOptionTitleSelected : undefined,
                ]}
              >
                Start Immediately
              </Text>
              <Text style={styles.startOptionSubtitle}>
                Auction goes live as soon as you create it
              </Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.startOption,
              !startNow ? styles.startOptionSelected : undefined,
            ]}
            onPress={() => setStartNow(false)}
          >
            <View style={styles.radioOuter}>
              {!startNow && <View style={styles.radioInner} />}
            </View>
            <View style={styles.startOptionContent}>
              <Text
                style={[
                  styles.startOptionTitle,
                  !startNow ? styles.startOptionTitleSelected : undefined,
                ]}
              >
                Schedule for Later
              </Text>
              <Text style={styles.startOptionSubtitle}>
                Auction starts tomorrow at the same time
              </Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* Summary */}
        <View style={styles.summaryCard}>
          <Text style={styles.summaryTitle}>Auction Summary</Text>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Starting Price</Text>
            <Text style={styles.summaryValue}>
              {startingPrice ? formatCurrency(parseFloat(startingPrice)) : '—'}
            </Text>
          </View>
          {reservePrice && (
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Reserve Price</Text>
              <Text style={styles.summaryValue}>
                {formatCurrency(parseFloat(reservePrice))}
              </Text>
            </View>
          )}
          {buyNowPrice && (
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Buy Now Price</Text>
              <Text style={styles.summaryValue}>
                {formatCurrency(parseFloat(buyNowPrice))}
              </Text>
            </View>
          )}
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Duration</Text>
            <Text style={styles.summaryValue}>
              {DURATION_OPTIONS.find(d => d.id === duration)?.label || '—'}
            </Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Starts</Text>
            <Text style={styles.summaryValue}>
              {startNow ? 'Immediately' : 'Tomorrow'}
            </Text>
          </View>
        </View>

        {/* Submit Button */}
        <View style={styles.submitContainer}>
          <Button
            title="Create Auction"
            onPress={handleSubmit}
            loading={isLoading}
            fullWidth
            size="lg"
          />
        </View>

        <View style={styles.bottomPadding} />
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backIcon: {
    fontSize: fonts.sizes.xl,
    color: colors.text,
  },
  title: {
    fontSize: fonts.sizes.xl,
    fontWeight: '700',
    color: colors.text,
  },
  placeholder: {
    width: 40,
  },
  content: {
    paddingHorizontal: spacing.lg,
  },
  section: {
    marginBottom: spacing.xl,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: fonts.sizes.lg,
    fontWeight: '700',
    marginBottom: spacing.xs,
  },
  sectionSubtitle: {
    color: colors.textSecondary,
    fontSize: fonts.sizes.sm,
    marginBottom: spacing.md,
  },
  currencyIcon: {
    color: colors.textSecondary,
    fontSize: fonts.sizes.md,
    fontWeight: '600',
  },
  durationGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  durationItem: {
    flex: 1,
    minWidth: '45%',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  durationItemSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  durationText: {
    color: colors.textSecondary,
    fontSize: fonts.sizes.md,
    fontWeight: '500',
  },
  durationTextSelected: {
    color: colors.text,
  },
  errorText: {
    color: colors.error,
    fontSize: fonts.sizes.sm,
    marginTop: spacing.xs,
  },
  startOption: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  startOptionSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primary + '10',
  },
  radioOuter: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  radioInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.primary,
  },
  startOptionContent: {
    flex: 1,
  },
  startOptionTitle: {
    color: colors.text,
    fontSize: fonts.sizes.md,
    fontWeight: '500',
  },
  startOptionTitleSelected: {
    color: colors.primary,
  },
  startOptionSubtitle: {
    color: colors.textSecondary,
    fontSize: fonts.sizes.sm,
    marginTop: 2,
  },
  summaryCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  summaryTitle: {
    color: colors.text,
    fontSize: fonts.sizes.md,
    fontWeight: '700',
    marginBottom: spacing.md,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  summaryLabel: {
    color: colors.textSecondary,
    fontSize: fonts.sizes.md,
  },
  summaryValue: {
    color: colors.text,
    fontSize: fonts.sizes.md,
    fontWeight: '500',
  },
  submitContainer: {
    marginTop: spacing.md,
  },
  bottomPadding: {
    height: 100,
  },
});

export default CreateAuctionScreen;
