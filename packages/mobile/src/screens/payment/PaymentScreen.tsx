import React, { useState, useRef } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { WebView, WebViewNavigation } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import { fonts } from '../../constants';
import { G, GlassScreen, GlassHeader, FooterBar, PrimaryButton, TextButton } from '../../components/glass';
import { orderService } from '../../services';
import { formatCurrency } from '../../utils';
import { useToastStore } from '../../store/toastStore';

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

      const response = await orderService.initializePayment(orderId, undefined, (route.params as any)?.channel);

      if (response.data?.authorization_url) {
        setPaymentUrl(response.data.authorization_url);
        setPaymentReference(response.data.reference);
      } else {
        throw new Error('Failed to get payment URL');
      }
    } catch (err: any) {
      console.error('Payment initialization error:', err);
      setError(err.message || "We couldn't start the payment.");
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
        useToastStore.getState().show(
          `Payment for order #${orderNumber} received. The seller will be notified to ship your item.`,
          'success',
          { duration: 6000 }
        );
        const channel = (route.params as any)?.channel as string | undefined;
        navigation.replace('Paid', {
          orderId,
          paidWith:
            channel === 'bank_transfer' ? 'Bank transfer' : channel === 'ussd' ? 'USSD' : channel === 'card' ? 'Card' : undefined,
        });
      } else {
        throw new Error('Payment verification failed');
      }
    } catch (err: any) {
      console.error('Payment verification error:', err);
      useToastStore.getState().show(
        'We could not verify your payment. If you were charged, please contact support.',
        'error',
        { duration: 6000 }
      );
      Alert.alert('Payment not verified', 'How would you like to continue?', [
        { text: 'Try again', onPress: initializePayment },
        {
          text: 'Go back',
          onPress: () => navigation.goBack(),
          style: 'cancel',
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancel = () => {
    Alert.alert(
      'Leave without paying?',
      "Nothing has been charged. You can pay from your order before the deadline.",
      [
        { text: 'Keep paying', style: 'cancel' },
        {
          text: 'Leave',
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
    setError("The payment page didn't load.");
    setIsLoading(false);
  };

  if (error) {
    return (
      <GlassScreen>
        <GlassHeader title="Payment" onBack={() => navigation.goBack()} />
        <View style={styles.errorContainer}>
          <View style={styles.errorTile}>
            <Ionicons name="alert-circle-outline" size={36} color={G.red} />
          </View>
          <Text style={styles.errorTitle} accessibilityRole="header">
            We couldn't open the payment page
          </Text>
          <Text style={styles.errorText}>{error} No money was taken.</Text>
        </View>
        <FooterBar>
          <PrimaryButton label="Try again" onPress={initializePayment} />
          <TextButton label="Go back" onPress={() => navigation.goBack()} />
        </FooterBar>
      </GlassScreen>
    );
  }

  return (
    <GlassScreen>
      <GlassHeader title={`Pay ${formatCurrency(amount)}`} onBack={handleCancel} />
      <Text style={styles.summary} numberOfLines={1}>
        Order {orderNumber}
        {gadgetTitle ? ` · ${gadgetTitle}` : ''}
      </Text>

      {/* Paystack's page, on a white panel like the rest of the app's cards. */}
      <View style={styles.webWrap}>
        {paymentUrl ? (
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
                <ActivityIndicator color={G.blue} />
                <Text style={styles.loadingText}>Opening Paystack…</Text>
              </View>
            )}
            javaScriptEnabled={true}
            domStorageEnabled={true}
            thirdPartyCookiesEnabled={true}
            sharedCookiesEnabled={true}
          />
        ) : null}
        {isLoading && !paymentUrl ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator color={G.blue} />
            <Text style={styles.loadingText}>Getting your payment ready…</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.secure}>
        <Ionicons name="lock-closed-outline" size={13} color={G.muted} />
        <Text style={styles.secureText}>Payments are processed securely by Paystack</Text>
      </View>
    </GlassScreen>
  );
};

const styles = StyleSheet.create({
  summary: {
    color: G.slate,
    fontSize: 14,
    fontFamily: fonts.regular,
    textAlign: 'center',
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  webWrap: {
    flex: 1,
    marginHorizontal: 20,
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#EDEFF4',
  },
  webView: { flex: 1, backgroundColor: '#FFFFFF' },
  loadingContainer: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    gap: 12,
  },
  loadingText: { color: G.muted, fontSize: 14, fontFamily: fonts.regular },
  secure: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingTop: 12,
    paddingBottom: 8,
  },
  secureText: { color: G.muted, fontSize: 13, fontFamily: fonts.regular },
  errorContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  errorTile: {
    width: 72,
    height: 72,
    borderRadius: 20,
    backgroundColor: G.redTint,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  errorTitle: {
    color: G.ink,
    fontSize: 26,
    lineHeight: 32,
    letterSpacing: -0.52,
    fontFamily: fonts.medium,
    textAlign: 'center',
  },
  errorText: {
    color: G.slate,
    fontSize: 16,
    lineHeight: 24,
    fontFamily: fonts.regular,
    textAlign: 'center',
    marginTop: 8,
  },
});
