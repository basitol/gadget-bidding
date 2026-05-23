import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  Modal,
  TextInput,
  Alert,
  FlatList,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, fonts, spacing, borderRadius } from '../../constants';
import { Ionicons } from '@expo/vector-icons';
import {
  WalletCard,
  Button,
  EmptyState,
  LoadingScreen,
} from '../../components';
import { useWalletStore } from '../../store';
import { walletService } from '../../services';
import {
  formatCurrency,
  formatDateTime,
  formatRelativeTime,
} from '../../utils';
import { WalletTransaction } from '../../types';

export const WalletScreen: React.FC = () => {
  const [showFundModal, setShowFundModal] = useState(false);
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [fundAmount, setFundAmount] = useState('');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  const {
    wallet,
    transactions,
    isLoading,
    isRefreshing,
    pagination,
    fetchWallet,
    fetchTransactions,
    loadMoreTransactions,
    refreshWallet,
  } = useWalletStore();

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    await Promise.all([fetchWallet(), fetchTransactions()]);
  };

  const handleFund = async () => {
    const amount = parseInt(fundAmount, 10);
    if (isNaN(amount) || amount < 100) {
      Alert.alert('Invalid Amount', 'Minimum deposit is ₦100');
      return;
    }

    setIsProcessing(true);
    try {
      const response = await walletService.initiateDeposit({
        amount,
        payment_method: 'paystack',
      });

      setShowFundModal(false);
      setFundAmount('');

      if (response.data.authorization_url) {
        // Open payment URL
        await Linking.openURL(response.data.authorization_url);
        Alert.alert(
          'Payment Initiated',
          'Complete your payment in the browser. Your wallet will be credited once payment is confirmed.'
        );
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to initiate deposit. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleWithdraw = async () => {
    const amount = parseInt(withdrawAmount, 10);
    const availableBalance =
      (wallet?.balance || 0) - (wallet?.held_balance || 0);

    if (isNaN(amount) || amount < 1000) {
      Alert.alert('Invalid Amount', 'Minimum withdrawal is ₦1,000');
      return;
    }

    if (amount > availableBalance) {
      Alert.alert(
        'Insufficient Balance',
        `You can only withdraw up to ${formatCurrency(availableBalance)}`
      );
      return;
    }

    // For now, show a message about withdrawal
    Alert.alert(
      'Withdrawal Request',
      'Withdrawal feature requires bank account verification. Please contact support to complete your withdrawal.',
      [{ text: 'OK', onPress: () => setShowWithdrawModal(false) }]
    );
  };

  const getTransactionIcon = (type: string): keyof typeof Ionicons.glyphMap => {
    const icons: Record<string, keyof typeof Ionicons.glyphMap> = {
      deposit: 'wallet-outline',
      withdrawal: 'cash-outline',
      bid_hold: 'lock-closed-outline',
      bid_release: 'lock-open-outline',
      bid_charge: 'trophy-outline',
      sale_credit: 'card-outline',
      refund: 'return-up-back-outline',
    };
    return icons[type] || 'card-outline';
  };

  const getTransactionColor = (type: string): string => {
    if (['deposit', 'sale_credit', 'bid_release', 'refund'].includes(type)) {
      return colors.success;
    }
    return colors.error;
  };

  const renderTransaction = ({ item }: { item: WalletTransaction }) => {
    const transactionType = item.type || 'transaction';
    const transactionStatus = item.status || 'pending';

    return (
      <TouchableOpacity style={styles.transactionItem} activeOpacity={0.7}>
        <View style={styles.transactionLeft}>
          <View style={styles.transactionIcon}>
            <Ionicons
              name={getTransactionIcon(transactionType)}
              size={20}
              color={colors.text}
            />
          </View>
          <View>
            <Text style={styles.transactionType}>
              {transactionType
                .replace(/_/g, ' ')
                .replace(/\b\w/g, l => l.toUpperCase())}
            </Text>
            <Text style={styles.transactionTime}>
              {formatRelativeTime(item.created_at)}
            </Text>
          </View>
        </View>
        <View style={styles.transactionRight}>
          <Text
            style={[
              styles.transactionAmount,
              { color: getTransactionColor(transactionType) },
            ]}
          >
            {['deposit', 'sale_credit', 'bid_release', 'refund'].includes(
              transactionType
            )
              ? '+'
              : '-'}
            {formatCurrency(item.amount)}
          </Text>
          <Text style={styles.transactionStatus}>{transactionStatus}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  if (isLoading && !wallet) {
    return <LoadingScreen message="Loading wallet..." />;
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={refreshWallet}
            tintColor={colors.primary}
          />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Wallet</Text>
        </View>

        {/* Wallet Card */}
        <View style={styles.walletCardContainer}>
          <WalletCard
            balance={wallet?.balance || 0}
            heldBalance={wallet?.held_balance || 0}
            onFund={() => setShowFundModal(true)}
            onWithdraw={() => setShowWithdrawModal(true)}
          />
        </View>

        {/* Quick Stats */}
        <View style={styles.statsContainer}>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>
              {formatCurrency(
                (wallet?.balance || 0) - (wallet?.held_balance || 0)
              )}
            </Text>
            <Text style={styles.statLabel}>Available</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statValue}>
              {formatCurrency(wallet?.held_balance || 0)}
            </Text>
            <Text style={styles.statLabel}>In Bids</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{transactions.length}</Text>
            <Text style={styles.statLabel}>Transactions</Text>
          </View>
        </View>

        {/* Transactions */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Recent Transactions</Text>
          </View>

          {transactions.length === 0 ? (
            <EmptyState
              icon="💳"
              title="No Transactions"
              message="Your transaction history will appear here once you fund your wallet or place bids."
              actionLabel="Fund Wallet"
              onAction={() => setShowFundModal(true)}
            />
          ) : (
            <FlatList
              data={transactions}
              keyExtractor={item => item.id}
              renderItem={renderTransaction}
              scrollEnabled={false}
              onEndReached={loadMoreTransactions}
              onEndReachedThreshold={0.5}
            />
          )}
        </View>

        <View style={styles.bottomPadding} />
      </ScrollView>

      {/* Fund Modal */}
      <Modal
        visible={showFundModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowFundModal(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowFundModal(false)}
        >
          <TouchableOpacity
            activeOpacity={1}
            onPress={e => e.stopPropagation()}
          >
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Fund Wallet</Text>
                <TouchableOpacity onPress={() => setShowFundModal(false)}>
                  <Text style={styles.modalClose}>✕</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.modalBody}>
                <Text style={styles.modalLabel}>Amount (₦)</Text>
                <TextInput
                  style={styles.amountInput}
                  value={fundAmount}
                  onChangeText={setFundAmount}
                  keyboardType="number-pad"
                  placeholder="Enter amount"
                  placeholderTextColor={colors.textMuted}
                />

                <View style={styles.quickAmounts}>
                  {[1000, 5000, 10000, 20000, 50000].map(amount => (
                    <TouchableOpacity
                      key={amount}
                      style={styles.quickAmountButton}
                      onPress={() => setFundAmount(amount.toString())}
                    >
                      <Text style={styles.quickAmountText}>
                        {formatCurrency(amount)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <View style={styles.paymentMethods}>
                  <Text style={styles.paymentLabel}>Payment Method</Text>
                  <View style={styles.paymentOption}>
                    <Text style={styles.paymentIcon}>💳</Text>
                    <Text style={styles.paymentName}>Paystack (Card/Bank)</Text>
                    <View style={styles.paymentSelected} />
                  </View>
                </View>

                <Button
                  title="Continue to Payment"
                  onPress={handleFund}
                  loading={isProcessing}
                  fullWidth
                  size="lg"
                />
              </View>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Withdraw Modal */}
      <Modal
        visible={showWithdrawModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowWithdrawModal(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowWithdrawModal(false)}
        >
          <TouchableOpacity
            activeOpacity={1}
            onPress={e => e.stopPropagation()}
          >
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Withdraw Funds</Text>
                <TouchableOpacity onPress={() => setShowWithdrawModal(false)}>
                  <Text style={styles.modalClose}>✕</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.modalBody}>
                <View style={styles.availableBalance}>
                  <Text style={styles.availableLabel}>Available Balance</Text>
                  <Text style={styles.availableAmount}>
                    {formatCurrency(
                      (wallet?.balance || 0) - (wallet?.held_balance || 0)
                    )}
                  </Text>
                </View>

                <Text style={styles.modalLabel}>Amount (₦)</Text>
                <TextInput
                  style={styles.amountInput}
                  value={withdrawAmount}
                  onChangeText={setWithdrawAmount}
                  keyboardType="number-pad"
                  placeholder="Enter amount"
                  placeholderTextColor={colors.textMuted}
                />

                <View style={styles.withdrawInfo}>
                  <Text style={styles.withdrawInfoIcon}>ℹ️</Text>
                  <Text style={styles.withdrawInfoText}>
                    Withdrawals are processed within 24 hours. Minimum
                    withdrawal is ₦1,000.
                  </Text>
                </View>

                <Button
                  title="Request Withdrawal"
                  onPress={handleWithdraw}
                  loading={isProcessing}
                  fullWidth
                  size="lg"
                />
              </View>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
  },
  title: {
    fontSize: fonts.sizes.xxxl,
    fontWeight: '700',
    color: colors.text,
  },
  walletCardContainer: {
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.lg,
  },
  statsContainer: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    marginHorizontal: spacing.lg,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginBottom: spacing.xl,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    color: colors.text,
    fontSize: fonts.sizes.lg,
    fontWeight: '700',
  },
  statLabel: {
    color: colors.textSecondary,
    fontSize: fonts.sizes.xs,
    marginTop: spacing.xs,
  },
  statDivider: {
    width: 1,
    backgroundColor: colors.border,
    marginHorizontal: spacing.md,
  },
  section: {
    paddingHorizontal: spacing.lg,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  sectionTitle: {
    fontSize: fonts.sizes.xl,
    fontWeight: '700',
    color: colors.text,
  },
  transactionItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    marginBottom: spacing.sm,
  },
  transactionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  transactionIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surfaceLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  transactionEmoji: {
    fontSize: fonts.sizes.xl,
  },
  transactionType: {
    color: colors.text,
    fontSize: fonts.sizes.md,
    fontWeight: '500',
  },
  transactionTime: {
    color: colors.textMuted,
    fontSize: fonts.sizes.xs,
    marginTop: 2,
  },
  transactionRight: {
    alignItems: 'flex-end',
  },
  transactionAmount: {
    fontSize: fonts.sizes.md,
    fontWeight: '700',
  },
  transactionStatus: {
    color: colors.textMuted,
    fontSize: fonts.sizes.xs,
    marginTop: 2,
    textTransform: 'capitalize',
  },
  bottomPadding: {
    height: 100,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: borderRadius.xxl,
    borderTopRightRadius: borderRadius.xxl,
    paddingBottom: spacing.xxl,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  modalTitle: {
    color: colors.text,
    fontSize: fonts.sizes.xl,
    fontWeight: '700',
  },
  modalClose: {
    color: colors.textSecondary,
    fontSize: fonts.sizes.xl,
  },
  modalBody: {
    padding: spacing.lg,
  },
  modalLabel: {
    color: colors.textSecondary,
    fontSize: fonts.sizes.sm,
    marginBottom: spacing.sm,
  },
  amountInput: {
    backgroundColor: colors.surfaceLight,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    fontSize: fonts.sizes.xxl,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  quickAmounts: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  quickAmountButton: {
    backgroundColor: colors.surfaceLight,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
  },
  quickAmountText: {
    color: colors.primary,
    fontSize: fonts.sizes.sm,
    fontWeight: '600',
  },
  paymentMethods: {
    marginBottom: spacing.lg,
  },
  paymentLabel: {
    color: colors.textSecondary,
    fontSize: fonts.sizes.sm,
    marginBottom: spacing.sm,
  },
  paymentOption: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceLight,
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    borderWidth: 2,
    borderColor: colors.primary,
  },
  paymentIcon: {
    fontSize: fonts.sizes.xl,
    marginRight: spacing.md,
  },
  paymentName: {
    flex: 1,
    color: colors.text,
    fontSize: fonts.sizes.md,
  },
  paymentSelected: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.primary,
  },
  availableBalance: {
    backgroundColor: colors.primary + '20',
    padding: spacing.lg,
    borderRadius: borderRadius.lg,
    marginBottom: spacing.lg,
    alignItems: 'center',
  },
  availableLabel: {
    color: colors.textSecondary,
    fontSize: fonts.sizes.sm,
  },
  availableAmount: {
    color: colors.primary,
    fontSize: fonts.sizes.xxl,
    fontWeight: '700',
  },
  withdrawInfo: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: colors.surfaceLight,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    marginBottom: spacing.lg,
    gap: spacing.sm,
  },
  withdrawInfoIcon: {
    fontSize: fonts.sizes.lg,
  },
  withdrawInfoText: {
    flex: 1,
    color: colors.textSecondary,
    fontSize: fonts.sizes.sm,
    lineHeight: 20,
  },
});
