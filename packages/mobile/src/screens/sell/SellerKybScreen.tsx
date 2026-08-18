import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Button, Input } from '../../components';
import { useTheme } from '../../hooks';
import { ThemeColors, fonts, spacing, borderRadius } from '../../constants';
import { auctionService, authService } from '../../services';
import { useAuthStore } from '../../store';

type Props = {
  navigation: any;
};

type KybStatus = 'not_started' | 'pending' | 'approved' | 'rejected';

export const SellerKybScreen: React.FC<Props> = ({ navigation }) => {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { user, setUser } = useAuthStore();

  const [status, setStatus] = useState<KybStatus>(
    user?.seller_kyb_status || 'not_started'
  );
  const [rejectionReason, setRejectionReason] = useState(
    user?.seller_kyb_rejection_reason
  );
  const [businessName, setBusinessName] = useState(user?.business_name || '');
  const [cacNumber, setCacNumber] = useState(user?.cac_number || '');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isChecking, setIsChecking] = useState(true);

  const applyStatus = useCallback(
    async (data: {
      business_name: string | null;
      cac_number: string | null;
      status: KybStatus;
      rejection_reason: string | null;
    }) => {
      setStatus(data.status);
      setRejectionReason(data.rejection_reason || undefined);
      if (data.business_name) setBusinessName(data.business_name);
      if (data.cac_number) setCacNumber(data.cac_number);

      if (user) {
        const updatedUser = {
          ...user,
          business_name: data.business_name || user.business_name,
          cac_number: data.cac_number || user.cac_number,
          seller_kyb_status: data.status,
          seller_kyb_rejection_reason: data.rejection_reason || undefined,
        };
        setUser(updatedUser);
        await authService.persistUser(updatedUser);
      }
    },
    [user, setUser]
  );

  const refreshStatus = useCallback(async () => {
    try {
      const response = await auctionService.getSellerKyb();
      if (response.data) {
        await applyStatus(response.data as any);
      }
    } catch {
      // Keep whatever we already had locally; not worth blocking on this.
    } finally {
      setIsChecking(false);
    }
  }, [applyStatus]);

  useEffect(() => {
    refreshStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSubmit = async () => {
    setError('');

    if (businessName.trim().length < 2) {
      setError('Enter your business or shop name');
      return;
    }

    setIsLoading(true);
    try {
      const response = await auctionService.submitSellerKyb({
        business_name: businessName.trim(),
        cac_number: cacNumber.trim() || undefined,
      });

      if (response.data) {
        await applyStatus(response.data as any);
      }
    } catch (err) {
      Alert.alert(
        'Could not save',
        err instanceof Error ? err.message : 'Please try again'
      );
    } finally {
      setIsLoading(false);
    }
  };

  if (isChecking) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (status === 'approved') {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.centered}>
          <Ionicons
            name="checkmark-circle"
            size={56}
            color={colors.success}
          />
          <Text style={styles.title}>You're verified</Text>
          <Text style={styles.subtitle}>
            {businessName} is approved to sell on GadgetBid.
          </Text>
          <Button
            title="Start listing"
            onPress={() => navigation.replace('CreateGadget')}
            fullWidth
            size="lg"
          />
        </View>
      </SafeAreaView>
    );
  }

  if (status === 'pending') {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <ScrollView
          contentContainerStyle={styles.centered}
          refreshControl={
            <RefreshControl refreshing={false} onRefresh={refreshStatus} />
          }
        >
          <Ionicons name="time-outline" size={56} color={colors.primary} />
          <Text style={styles.title}>Under review</Text>
          <Text style={styles.subtitle}>
            We're reviewing {businessName || 'your business details'}. This
            is checked manually, so it can take a little while. Pull down to
            check again.
          </Text>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // not_started or rejected
  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.iconWrap}>
            <Ionicons name="storefront-outline" size={32} color={colors.primary} />
          </View>

          <Text style={styles.title}>Verify your business</Text>
          <Text style={styles.subtitle}>
            Tell us who's selling. An admin reviews this before you can list
            gadgets.
          </Text>

          {status === 'rejected' && (
            <View style={styles.rejectedBox}>
              <Ionicons name="alert-circle" size={18} color={colors.error} />
              <Text style={styles.rejectedText}>
                {rejectionReason ||
                  'Your last submission was not approved. Please review your details and try again.'}
              </Text>
            </View>
          )}

          <Input
            label="Business or shop name"
            placeholder="e.g. Bash Gadgets"
            value={businessName}
            onChangeText={setBusinessName}
            autoCapitalize="words"
            error={error}
            iconName="storefront-outline"
          />

          <Input
            label="CAC registration number (optional)"
            placeholder="e.g. BN1234567"
            value={cacNumber}
            onChangeText={setCacNumber}
            autoCapitalize="characters"
            iconName="document-text-outline"
          />

          <Text style={styles.hint}>
            Don't have a CAC number yet? You can still submit for review —
            add it later from your profile once you're registered.
          </Text>

          <Button
            title={status === 'rejected' ? 'Resubmit for review' : 'Submit for review'}
            onPress={handleSubmit}
            loading={isLoading}
            fullWidth
            size="lg"
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    centered: {
      flexGrow: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: spacing.xl,
      gap: spacing.md,
    },
    content: {
      padding: spacing.lg,
      paddingTop: spacing.xl,
    },
    iconWrap: {
      width: 64,
      height: 64,
      borderRadius: borderRadius.full,
      backgroundColor: colors.primary + '14',
      alignItems: 'center',
      justifyContent: 'center',
      alignSelf: 'center',
      marginBottom: spacing.lg,
    },
    title: {
      fontSize: fonts.sizes.xl,
      fontWeight: '700',
      color: colors.text,
      textAlign: 'center',
      marginBottom: spacing.sm,
    },
    subtitle: {
      fontSize: fonts.sizes.md,
      color: colors.textMuted,
      textAlign: 'center',
      lineHeight: 20,
      marginBottom: spacing.xl,
    },
    hint: {
      fontSize: fonts.sizes.sm,
      color: colors.textMuted,
      lineHeight: 18,
      marginTop: -spacing.xs,
      marginBottom: spacing.lg,
    },
    rejectedBox: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.sm,
      backgroundColor: colors.error + '15',
      padding: spacing.md,
      borderRadius: borderRadius.lg,
      marginBottom: spacing.lg,
      borderWidth: 1,
      borderColor: colors.error + '33',
    },
    rejectedText: {
      flex: 1,
      color: colors.error,
      fontSize: fonts.sizes.sm,
      lineHeight: 18,
    },
  });
