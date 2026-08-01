import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Button, Input } from '../../components';
import { useTheme } from '../../hooks';
import { ThemeColors, fonts, spacing, borderRadius } from '../../constants';
import { addressService, orderService } from '../../services';
import { useAuthStore } from '../../store';
import { ShippingAddress, UserAddress } from '../../types';

type Props = {
  navigation: any;
  route: {
    params: {
      orderId: string;
      orderNumber?: string;
      returnToPayment?: boolean;
      amount?: number;
      gadgetTitle?: string;
    };
  };
};

const NIGERIAN_STATES = [
  'Abia',
  'Adamawa',
  'Akwa Ibom',
  'Anambra',
  'Bauchi',
  'Bayelsa',
  'Benue',
  'Borno',
  'Cross River',
  'Delta',
  'Ebonyi',
  'Edo',
  'Ekiti',
  'Enugu',
  'FCT',
  'Gombe',
  'Imo',
  'Jigawa',
  'Kaduna',
  'Kano',
  'Katsina',
  'Kebbi',
  'Kogi',
  'Kwara',
  'Lagos',
  'Nasarawa',
  'Niger',
  'Ogun',
  'Ondo',
  'Osun',
  'Oyo',
  'Plateau',
  'Rivers',
  'Sokoto',
  'Taraba',
  'Yobe',
  'Zamfara',
];

export const ShippingAddressScreen: React.FC<Props> = ({
  navigation,
  route,
}) => {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { user } = useAuthStore();
  const { orderId, orderNumber, returnToPayment, amount, gadgetTitle } =
    route.params;

  const [fullName, setFullName] = useState(user?.full_name || '');
  const [phoneNumber, setPhoneNumber] = useState(user?.phone_number || '');
  const [addressLine1, setAddressLine1] = useState('');
  const [addressLine2, setAddressLine2] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('Lagos');
  const [postalCode, setPostalCode] = useState('');
  const [label, setLabel] = useState('Home');
  const [savedAddresses, setSavedAddresses] = useState<UserAddress[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(
    null
  );
  const [saveAsDefault, setSaveAsDefault] = useState(true);
  const [isLoadingAddresses, setIsLoadingAddresses] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [showStates, setShowStates] = useState(false);

  const fillAddress = (address: UserAddress | ShippingAddress) => {
    setFullName(address.full_name || user?.full_name || '');
    setPhoneNumber(address.phone_number || user?.phone_number || '');
    setAddressLine1(address.address_line1 || '');
    setAddressLine2(address.address_line2 || '');
    setCity(address.city || '');
    setState(address.state || 'Lagos');
    setPostalCode(address.postal_code || '');
    if ('id' in address) {
      setSelectedAddressId(address.id);
      setLabel(address.label || 'Home');
      setSaveAsDefault(Boolean(address.is_default));
    }
  };

  const clearAddressForm = () => {
    setSelectedAddressId(null);
    setLabel('Home');
    setFullName(user?.full_name || '');
    setPhoneNumber(user?.phone_number || '');
    setAddressLine1('');
    setAddressLine2('');
    setCity('');
    setState('Lagos');
    setPostalCode('');
    setSaveAsDefault(savedAddresses.length === 0);
  };

  const handleDeleteAddress = (address: UserAddress) => {
    Alert.alert(
      'Delete address?',
      `Remove ${address.label} from your saved addresses?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await addressService.deleteAddress(address.id);
              setSavedAddresses(prev =>
                prev.filter(item => item.id !== address.id)
              );
              if (selectedAddressId === address.id) {
                clearAddressForm();
              }
            } catch (error: any) {
              Alert.alert('Error', error.message || 'Failed to delete address');
            }
          },
        },
      ]
    );
  };

  useEffect(() => {
    let mounted = true;

    const loadAddresses = async () => {
      try {
        const response = await addressService.listAddresses();
        if (!mounted) return;

        const addresses = response.data || [];
        setSavedAddresses(addresses);
        const defaultAddress = addresses.find(item => item.is_default);
        if (defaultAddress) {
          fillAddress(defaultAddress);
        }
      } catch (error) {
        console.warn('Failed to load saved addresses', error);
      } finally {
        if (mounted) setIsLoadingAddresses(false);
      }
    };

    loadAddresses();

    return () => {
      mounted = false;
    };
  }, []);

  const handleSave = async () => {
    if (!fullName.trim() || fullName.trim().length < 2) {
      Alert.alert('Missing info', 'Enter the recipient full name');
      return;
    }
    if (!phoneNumber.trim()) {
      Alert.alert('Missing info', 'Enter a phone number for delivery');
      return;
    }
    if (addressLine1.trim().length < 5) {
      Alert.alert('Missing info', 'Enter a full street address');
      return;
    }
    if (!city.trim()) {
      Alert.alert('Missing info', 'Enter your city');
      return;
    }
    if (!state.trim()) {
      Alert.alert('Missing info', 'Select your state');
      return;
    }

    const address: ShippingAddress = {
      full_name: fullName.trim(),
      phone_number: phoneNumber.trim(),
      address_line1: addressLine1.trim(),
      address_line2: addressLine2.trim() || undefined,
      city: city.trim(),
      state: state.trim(),
      postal_code: postalCode.trim() || undefined,
      country: 'Nigeria',
    };

    setIsSaving(true);
    try {
      const savePayload = {
        ...address,
        label: label.trim() || 'Delivery address',
        is_default: saveAsDefault,
      };
      const savedAddress = selectedAddressId
        ? await addressService.updateAddress(selectedAddressId, savePayload)
        : await addressService.createAddress(savePayload);

      setSelectedAddressId(savedAddress.data.id);
      setSavedAddresses(prev => {
        const next = prev.filter(item => item.id !== savedAddress.data.id);
        const updated = saveAsDefault
          ? next.map(item => ({ ...item, is_default: false }))
          : next;
        return [savedAddress.data, ...updated].sort(
          (a, b) => Number(b.is_default) - Number(a.is_default)
        );
      });

      await orderService.updateShippingAddress(orderId, address);

      if (returnToPayment) {
        navigation.replace('Payment', {
          orderId,
          orderNumber,
          amount,
          gadgetTitle,
        });
      } else {
        Alert.alert('Saved', 'Shipping address saved', [
          { text: 'OK', onPress: () => navigation.goBack() },
        ]);
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to save address');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
        >
          <Ionicons name="chevron-back" size={20} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Shipping address</Text>
        <View style={styles.placeholder} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.subtitle}>
            Where should we deliver order
            {orderNumber ? ` #${orderNumber}` : ''}?
          </Text>

          {isLoadingAddresses ? (
            <Text style={styles.helperText}>Loading saved addresses…</Text>
          ) : savedAddresses.length > 0 ? (
            <View style={styles.savedSection}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Saved addresses</Text>
                <TouchableOpacity onPress={clearAddressForm}>
                  <Text style={styles.sectionAction}>Add new</Text>
                </TouchableOpacity>
              </View>
              {savedAddresses.map(item => (
                <TouchableOpacity
                  key={item.id}
                  style={[
                    styles.addressCard,
                    selectedAddressId === item.id && styles.addressCardActive,
                  ]}
                  onPress={() => fillAddress(item)}
                  activeOpacity={0.85}
                >
                  <View style={styles.addressCardHeader}>
                    <Text style={styles.addressCardTitle}>{item.label}</Text>
                    <View style={styles.addressCardActions}>
                      {item.is_default ? (
                        <Text style={styles.defaultPill}>Default</Text>
                      ) : null}
                      <TouchableOpacity
                        onPress={() => handleDeleteAddress(item)}
                        hitSlop={10}
                      >
                        <Ionicons
                          name="trash-outline"
                          size={17}
                          color={colors.error}
                        />
                      </TouchableOpacity>
                    </View>
                  </View>
                  <Text style={styles.addressCardText}>
                    {item.address_line1}
                    {item.address_line2 ? `, ${item.address_line2}` : ''}
                  </Text>
                  <Text style={styles.addressCardMeta}>
                    {item.city}, {item.state} · {item.phone_number}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          ) : null}

          <Input
            label="Address label"
            value={label}
            onChangeText={setLabel}
            placeholder="Home, Work, Office..."
            autoCapitalize="words"
          />

          <Input
            label="Full name"
            value={fullName}
            onChangeText={setFullName}
            placeholder="Recipient name"
            autoCapitalize="words"
          />
          <Input
            label="Phone number"
            value={phoneNumber}
            onChangeText={setPhoneNumber}
            placeholder="08012345678"
            keyboardType="phone-pad"
          />
          <Input
            label="Street address"
            value={addressLine1}
            onChangeText={setAddressLine1}
            placeholder="House number and street"
          />
          <Input
            label="Apartment / landmark (optional)"
            value={addressLine2}
            onChangeText={setAddressLine2}
            placeholder="Estate, landmark, etc."
          />
          <Input
            label="City / LGA"
            value={city}
            onChangeText={setCity}
            placeholder="e.g. Ikeja"
          />

          <Text style={styles.label}>State</Text>
          <TouchableOpacity
            style={styles.statePicker}
            onPress={() => setShowStates(prev => !prev)}
          >
            <Text style={styles.stateValue}>{state}</Text>
            <Ionicons
              name={showStates ? 'chevron-up' : 'chevron-down'}
              size={18}
              color={colors.textMuted}
            />
          </TouchableOpacity>
          {showStates ? (
            <View style={styles.stateList}>
              {NIGERIAN_STATES.map(item => (
                <TouchableOpacity
                  key={item}
                  style={styles.stateOption}
                  onPress={() => {
                    setState(item);
                    setShowStates(false);
                  }}
                >
                  <Text
                    style={[
                      styles.stateOptionText,
                      item === state && styles.stateOptionActive,
                    ]}
                  >
                    {item}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          ) : null}

          <Input
            label="Postal code (optional)"
            value={postalCode}
            onChangeText={setPostalCode}
            placeholder="100001"
            keyboardType="number-pad"
          />

          <TouchableOpacity
            style={styles.defaultToggle}
            onPress={() => setSaveAsDefault(prev => !prev)}
            activeOpacity={0.85}
          >
            <View
              style={[styles.checkbox, saveAsDefault && styles.checkboxActive]}
            >
              {saveAsDefault ? (
                <Ionicons name="checkmark" size={14} color="#fff" />
              ) : null}
            </View>
            <Text style={styles.defaultToggleText}>
              Use as my default delivery address
            </Text>
          </TouchableOpacity>

          <Button
            title={
              returnToPayment ? 'Save & continue to payment' : 'Save address'
            }
            onPress={handleSave}
            loading={isSaving}
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
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
    },
    backButton: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    title: {
      flex: 1,
      textAlign: 'center',
      color: colors.text,
      fontSize: fonts.sizes.xl,
      fontFamily: fonts.bold,
    },
    placeholder: { width: 40 },
    content: {
      paddingHorizontal: spacing.lg,
      paddingBottom: 40,
      gap: spacing.sm,
    },
    subtitle: {
      color: colors.textSecondary,
      fontSize: fonts.sizes.md,
      fontFamily: fonts.regular,
      marginBottom: spacing.md,
    },
    helperText: {
      color: colors.textMuted,
      fontSize: fonts.sizes.sm,
      fontFamily: fonts.regular,
      marginBottom: spacing.sm,
    },
    savedSection: {
      gap: spacing.sm,
      marginBottom: spacing.md,
    },
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    sectionTitle: {
      color: colors.text,
      fontSize: fonts.sizes.md,
      fontFamily: fonts.semiBold,
    },
    sectionAction: {
      color: colors.primary,
      fontSize: fonts.sizes.sm,
      fontFamily: fonts.semiBold,
    },
    addressCard: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: borderRadius.lg,
      padding: spacing.md,
      gap: 6,
    },
    addressCardActive: {
      borderColor: colors.primary,
      backgroundColor: colors.primary + '12',
    },
    addressCardHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.sm,
    },
    addressCardTitle: {
      color: colors.text,
      fontSize: fonts.sizes.md,
      fontFamily: fonts.semiBold,
    },
    addressCardActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    defaultPill: {
      color: colors.primary,
      backgroundColor: colors.primary + '18',
      borderRadius: borderRadius.full,
      paddingHorizontal: spacing.sm,
      paddingVertical: 3,
      fontSize: fonts.sizes.xs,
      fontFamily: fonts.semiBold,
      overflow: 'hidden',
    },
    addressCardText: {
      color: colors.textSecondary,
      fontSize: fonts.sizes.sm,
      fontFamily: fonts.regular,
      lineHeight: 20,
    },
    addressCardMeta: {
      color: colors.textMuted,
      fontSize: fonts.sizes.xs,
      fontFamily: fonts.medium,
    },
    label: {
      color: colors.textSecondary,
      fontSize: fonts.sizes.sm,
      fontFamily: fonts.medium,
      marginBottom: 6,
      marginTop: spacing.xs,
    },
    statePicker: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: borderRadius.lg,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.md,
      marginBottom: spacing.sm,
    },
    stateValue: {
      color: colors.text,
      fontSize: fonts.sizes.md,
      fontFamily: fonts.medium,
    },
    stateList: {
      maxHeight: 220,
      backgroundColor: colors.surface,
      borderRadius: borderRadius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      marginBottom: spacing.md,
      overflow: 'hidden',
    },
    stateOption: {
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    stateOptionText: {
      color: colors.text,
      fontSize: fonts.sizes.md,
    },
    stateOptionActive: {
      color: colors.primary,
      fontFamily: fonts.semiBold,
    },
    defaultToggle: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      marginTop: spacing.xs,
      marginBottom: spacing.md,
    },
    checkbox: {
      width: 22,
      height: 22,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surface,
    },
    checkboxActive: {
      borderColor: colors.primary,
      backgroundColor: colors.primary,
    },
    defaultToggleText: {
      flex: 1,
      color: colors.text,
      fontSize: fonts.sizes.sm,
      fontFamily: fonts.medium,
    },
  });
