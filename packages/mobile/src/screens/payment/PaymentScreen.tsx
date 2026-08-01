import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView, WebViewNavigation } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, spacing, borderRadius } from '../../constants';
import { orderService } from '../../services';
import { formatCurrency } from '../../utils';

type PaymentScreenProps = {
  navigation: any;
  route: {
    params: {
      orderId: string;
      orderNumber: string;
      amount: number;
      gadgetTitle?: string;
    };
  };
};

export const PaymentScreen: React.FC<PaymentScreenProps> = ({
  navigation,
  route,
}) => {
  const { orderId, orderNumber, amount, gadgetTitle } = route.params;
  const [isLoading, setIsLoading] = useState(true);
  const [paymentUrl, setPaymentUrl] = useState<string | null>(null);
  const [paymentReference, setPaymentReference] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const webViewRef = useRef<WebView>(null);

  // Initialize payment on mount
  React.useEffect(() => {
    initializePayment();
  }, []);

  const initializePayment = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await orderService.initializePayment(orderId);

      if (response.data?.authorization_url) {
        setPaymentUrl(response.data.authorization_url);
        setPaymentReference(response.data.reference);
      } else {
        throw new Error('Failed to get payment URL');
      }
    } catch (err: any) {
      console.error('Payment initialization error:', err);
      setError(err.message || 'Failed to initialize payment');
      setIsLoading(false);
    }
  };

  const handleNavigationChange = async (navState: WebViewNavigation) => {
    const { url } = navState;

    // Check for cancel/close on Paystack pages
    if (url.includes('cancel') || url.includes('close')) {
      handleCancel();
    }
  };

  // Intercept navigation requests - this prevents loading non-Paystack URLs
  const handleShouldStartLoad = (request: any): boolean => {
    const { url } = request;

    // Allow Paystack URLs to load
    if (url.includes('paystack.co') || url.includes('paystack.com')) {
      return true;
    }

    // Allow initial blank/about pages
    if (url === 'about:blank' || url.startsWith('about:')) {
      return true;
    }

    // For any other URL (callback redirect), intercept and verify payment
    // This prevents the "Route not found" error from showing
    if (paymentReference) {
      verifyPayment(paymentReference);
    }

    // Block the navigation to prevent showing error page
    return false;
  };

  const verifyPayment = async (reference: string) => {
    try {
      setIsLoading(true);

      const response = await orderService.verifyPayment(orderId, reference);

      if (response.data?.payment_status === 'paid') {
        Alert.alert(
          'Payment Successful!',
          `Your payment for order #${orderNumber} was successful. The seller will be notified to ship your item.`,
          [
            {
              text: 'View Order',
              onPress: () => {
                navigation.replace('OrderDetail', { orderId });
              },
            },
          ]
        );
      } else {
        throw new Error('Payment verification failed');
      }
    } catch (err: any) {
      console.error('Payment verification error:', err);
      Alert.alert(
        'Verification Issue',
        'We could not verify your payment. If you were charged, please contact support.',
        [
          { text: 'Try Again', onPress: initializePayment },
          {
            text: 'Go Back',
            onPress: () => navigation.goBack(),
            style: 'cancel',
          },
        ]
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancel = () => {
    Alert.alert(
      'Cancel Payment',
      'Are you sure you want to cancel this payment?',
      [
        { text: 'Continue Payment', style: 'cancel' },
        {
          text: 'Cancel',
          style: 'destructive',
          onPress: () => navigation.goBack(),
        },
      ]
    );
  };

  const handleWebViewLoad = () => {
    setIsLoading(false);
  };

  const handleWebViewError = () => {
    setError('Failed to load payment page. Please try again.');
    setIsLoading(false);
  };

  if (error) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={styles.closeButton}
          >
            <Ionicons name="close" size={22} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.title}>Payment</Text>
          <View style={styles.placeholder} />
        </View>
        <View style={styles.errorContainer}>
          <Ionicons
            name="alert-circle-outline"
            size={56}
            color={colors.error}
            style={styles.errorIcon}
          />
          <Text style={styles.errorTitle}>Payment Error</Text>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity
            style={styles.retryButton}
            onPress={initializePayment}
          >
            <Text style={styles.retryButtonText}>Try Again</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.cancelButton}
            onPress={() => navigation.goBack()}
          >
            <Text style={styles.cancelButtonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={handleCancel} style={styles.closeButton}>
          <Ionicons name="close" size={22} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.title}>Pay {formatCurrency(amount)}</Text>
          <Text style={styles.subtitle}>Order #{orderNumber}</Text>
        </View>
        <View style={styles.placeholder} />
      </View>

      {/* Order Summary */}
      <View style={styles.summaryBar}>
        <Text style={styles.summaryText} numberOfLines={1}>
          {gadgetTitle || 'Your Order'}
        </Text>
        <Text style={styles.summaryAmount}>{formatCurrency(amount)}</Text>
      </View>

      {/* WebView */}
      {paymentUrl && (
        <WebView
          ref={webViewRef}
          source={{ uri: paymentUrl }}
          style={styles.webView}
          onNavigationStateChange={handleNavigationChange}
          onShouldStartLoadWithRequest={handleShouldStartLoad}
          onLoad={handleWebViewLoad}
          onError={handleWebViewError}
          startInLoadingState={true}
          renderLoading={() => (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={styles.loadingText}>Loading payment page...</Text>
            </View>
          )}
          javaScriptEnabled={true}
          domStorageEnabled={true}
          thirdPartyCookiesEnabled={true}
          sharedCookiesEnabled={true}
        />
      )}

      {/* Loading Overlay */}
      {isLoading && !paymentUrl && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Initializing payment...</Text>
        </View>
      )}

      {/* Security Notice */}
      <View style={styles.securityBar}>
        <Ionicons
          name="lock-closed-outline"
          size={16}
          color={colors.success}
          style={styles.securityIcon}
        />
        <Text style={styles.securityText}>Secured by Paystack</Text>
      </View>
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
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerCenter: {
    alignItems: 'center',
  },
  title: {
    fontSize: fonts.sizes.lg,
    fontWeight: '700',
    color: colors.text,
  },
  subtitle: {
    fontSize: fonts.sizes.sm,
    color: colors.textSecondary,
    marginTop: 2,
  },
  placeholder: {
    width: 40,
  },
  summaryBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  summaryText: {
    flex: 1,
    color: colors.textSecondary,
    fontSize: fonts.sizes.md,
    marginRight: spacing.md,
  },
  summaryAmount: {
    color: colors.primary,
    fontSize: fonts.sizes.lg,
    fontWeight: '700',
  },
  webView: {
    flex: 1,
    backgroundColor: colors.background,
  },
  loadingContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  loadingOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: colors.textSecondary,
    fontSize: fonts.sizes.md,
    marginTop: spacing.md,
  },
  securityBar: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: spacing.md,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  securityIcon: {
    marginRight: spacing.xs,
  },
  securityText: {
    color: colors.textMuted,
    fontSize: fonts.sizes.sm,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  errorIcon: {
    marginBottom: spacing.lg,
  },
  errorTitle: {
    color: colors.text,
    fontSize: fonts.sizes.xl,
    fontWeight: '700',
    marginBottom: spacing.sm,
  },
  errorText: {
    color: colors.textSecondary,
    fontSize: fonts.sizes.md,
    textAlign: 'center',
    marginBottom: spacing.xl,
  },
  retryButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.xxl,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.lg,
    marginBottom: spacing.md,
  },
  retryButtonText: {
    color: colors.text,
    fontSize: fonts.sizes.md,
    fontWeight: '600',
  },
  cancelButton: {
    paddingHorizontal: spacing.xxl,
    paddingVertical: spacing.md,
  },
  cancelButtonText: {
    color: colors.textSecondary,
    fontSize: fonts.sizes.md,
  },
});

export default PaymentScreen;
