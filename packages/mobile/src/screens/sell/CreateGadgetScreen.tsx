import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  Image,
  ActionSheetIOS,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import {
  STORAGE_OPTIONS,
  RAM_OPTIONS,
  WARRANTY_OPTIONS,
  INCLUDED_OPTIONS,
  CHECK_STATUS_OPTIONS,
  MDM_STATUS_OPTIONS,
  UNLOCK_STATUS_OPTIONS,
  CHIP_REGION_OPTIONS,
  SIM_CONFIG_OPTIONS,
  suggestListingTitle,
  isApplePhoneListing,
  isAppleLaptopListing,
  type GadgetSpecifications,
} from '@gadget-bidding/shared';
import { colors, fonts, spacing, borderRadius } from '../../constants';
import { Button, Input, OptionPicker } from '../../components';
import { auctionService, GadgetCategory } from '../../services';
import { Gadget } from '../../types';
import { useAuthStore } from '../../store';
import { toJpegUri } from '../../utils/images';
import {
  formatCurrency,
  suggestedNamesForCategoryAndBrand,
  categoryKeyForName,
  BRAND_SUGGESTIONS,
} from '../../utils';
import { PLATFORM_FEE_PERCENTAGE } from '@gadget-bidding/shared';

const MAX_PHOTOS = 5;

const DURATION_OPTIONS = [
  { id: '1', label: '1 Day', hours: 24 },
  { id: '3', label: '3 Days', hours: 72 },
  { id: '5', label: '5 Days', hours: 120 },
  { id: '7', label: '7 Days', hours: 168 },
];

const formatMoneyInput = (value: string): string => {
  const digits = value.replace(/\D/g, '');
  if (!digits) return '';
  return Number(digits).toLocaleString('en-NG');
};

const parseMoneyInput = (value: string): number => {
  const digits = value.replace(/\D/g, '');
  return digits ? Number(digits) : NaN;
};

type CreateGadgetScreenProps = {
  navigation: any;
  route?: any;
};

const CONDITIONS = [
  { id: 'new', label: 'New', description: 'Brand new, sealed' },
  {
    id: 'like_new',
    label: 'Like New',
    description: 'Barely used, excellent condition',
  },
  {
    id: 'excellent',
    label: 'Excellent',
    description: 'Light use, looks great',
    submitAs: 'like_new',
  },
  { id: 'good', label: 'Good', description: 'Minor wear, fully functional' },
  { id: 'fair', label: 'Fair', description: 'Visible wear, works well' },
  {
    id: 'for_parts',
    label: 'For Parts',
    description: 'Not fully working',
    submitAs: 'fair',
  },
];

const getSubmittedCondition = (selectedCondition: string): string =>
  CONDITIONS.find(option => option.id === selectedCondition)?.submitAs ??
  selectedCondition;

type ChipOption = { id: string; label: string };

function ChipGroup({
  options,
  value,
  onChange,
}: {
  options: readonly ChipOption[] | readonly string[];
  value: string;
  onChange: (id: string) => void;
}) {
  const normalized = options.map(o =>
    typeof o === 'string' ? { id: o, label: o } : o
  );
  return (
    <View style={styles.chipRow}>
      {normalized.map(opt => (
        <TouchableOpacity
          key={opt.id}
          style={[
            styles.chip,
            value === opt.id ? styles.chipSelected : undefined,
          ]}
          onPress={() => onChange(opt.id)}
        >
          <Text
            style={[
              styles.chipText,
              value === opt.id ? styles.chipTextSelected : undefined,
            ]}
          >
            {opt.label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

function MultiChipGroup({
  options,
  values,
  onToggle,
}: {
  options: readonly ChipOption[];
  values: string[];
  onToggle: (id: string) => void;
}) {
  return (
    <View style={styles.chipRow}>
      {options.map(opt => {
        const selected = values.includes(opt.id);
        return (
          <TouchableOpacity
            key={opt.id}
            style={[styles.chip, selected ? styles.chipSelected : undefined]}
            onPress={() => onToggle(opt.id)}
          >
            <Text
              style={[
                styles.chipText,
                selected ? styles.chipTextSelected : undefined,
              ]}
            >
              {opt.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

export const CreateGadgetScreen: React.FC<CreateGadgetScreenProps> = ({
  navigation,
  route,
}) => {
  const editingGadget = route?.params?.gadget as
    | (Partial<Gadget> & { id: string })
    | undefined;
  const isEditing = Boolean(editingGadget);

  const [title, setTitle] = useState(editingGadget?.title || '');
  const [titleTouched, setTitleTouched] = useState(false);
  const [description, setDescription] = useState(
    editingGadget?.description || ''
  );
  const [categoryId, setCategoryId] = useState(editingGadget?.category_id || '');
  const [brand, setBrand] = useState(editingGadget?.brand || '');
  const [model, setModel] = useState(editingGadget?.model || '');
  const [condition, setCondition] = useState(editingGadget?.condition || '');
  const [color, setColor] = useState('');
  const [storage, setStorage] = useState('');
  const [ram, setRam] = useState('');
  const [warranty, setWarranty] = useState('');
  const [included, setIncluded] = useState<string[]>([]);
  const [batteryHealth, setBatteryHealth] = useState('');
  const [cycleCount, setCycleCount] = useState('');
  const [icloudStatus, setIcloudStatus] = useState('');
  const [mdmStatus, setMdmStatus] = useState('');
  const [imeiBlacklist, setImeiBlacklist] = useState('');
  const [unlockStatus, setUnlockStatus] = useState('');
  const [chipRegion, setChipRegion] = useState('');
  const [simConfig, setSimConfig] = useState('');
  const [images, setImages] = useState<string[]>(editingGadget?.images || []);
  const [startingPrice, setStartingPrice] = useState(
    editingGadget?.auction_starting_price
      ? String(editingGadget.auction_starting_price)
      : ''
  );
  const [reservePrice, setReservePrice] = useState(
    editingGadget?.auction_reserve_price
      ? String(editingGadget.auction_reserve_price)
      : ''
  );
  const [buyNowPrice, setBuyNowPrice] = useState(
    editingGadget?.auction_buy_now_price
      ? String(editingGadget.auction_buy_now_price)
      : ''
  );
  const [bidIncrement, setBidIncrement] = useState(
    editingGadget?.auction_bid_increment
      ? String(editingGadget.auction_bid_increment)
      : '2000'
  );
  const [duration, setDuration] = useState(
    editingGadget?.auction_duration_hours
      ? String(editingGadget.auction_duration_hours)
      : '3'
  );
  const [startNow, setStartNow] = useState(
    editingGadget?.auction_start_now ?? true
  );
  const [categories, setCategories] = useState<GadgetCategory[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const selectedCategory = useMemo(
    () => categories.find(c => c.id === categoryId),
    [categories, categoryId]
  );

  const modelOptions = useMemo(
    () =>
      suggestedNamesForCategoryAndBrand(
        categoryKeyForName(selectedCategory?.name),
        brand
      ),
    [selectedCategory, brand]
  );

  const startingAmount = parseMoneyInput(startingPrice);
  const reserveAmount = parseMoneyInput(reservePrice);
  const buyNowAmount = parseMoneyInput(buyNowPrice);
  const expectedSaleAmount = !isNaN(buyNowAmount)
    ? buyNowAmount
    : !isNaN(reserveAmount)
      ? reserveAmount
      : !isNaN(startingAmount)
        ? startingAmount
        : 0;
  const estimatedFee = (expectedSaleAmount * PLATFORM_FEE_PERCENTAGE) / 100;
  const estimatedPayout = Math.max(0, expectedSaleAmount - estimatedFee);

  const showApplePhone = isApplePhoneListing(
    selectedCategory?.name,
    brand,
    model
  );
  const showAppleLaptop = isAppleLaptopListing(
    selectedCategory?.name,
    brand,
    model
  );
  const showBatteryBlock = showApplePhone || showAppleLaptop;

  const user = useAuthStore(state => state.user);

  // New listings require admin-approved seller KYB. Editing an existing
  // listing is still allowed even if KYB isn't approved yet, so sellers who
  // listed before this gate existed aren't locked out of managing what they
  // already have.
  useEffect(() => {
    if (!isEditing && user && user.seller_kyb_status !== 'approved') {
      navigation.replace('SellerKyb');
    }
  }, [isEditing, user, navigation]);

  useEffect(() => {
    loadCategories();
  }, []);

  useEffect(() => {
    if (titleTouched) return;
    const suggested = suggestListingTitle(brand, model, storage);
    if (suggested) setTitle(suggested);
  }, [brand, model, storage, titleTouched]);

  useEffect(() => {
    if (!isEditing || !editingGadget) return;

    let cancelled = false;
    (async () => {
      try {
        const response = await auctionService.getGadget(editingGadget.id);
        const g = response.data;
        if (cancelled || !g) return;

        const specs = g.specifications || {};
        setTitle(g.title || '');
        setDescription(g.description || '');
        setCategoryId(g.category_id || '');
        setBrand(g.brand || '');
        setModel(g.model || '');
        setCondition(g.condition || '');
        setColor(typeof specs.color === 'string' ? specs.color : '');
        setStorage(typeof specs.storage === 'string' ? specs.storage : '');
        setRam(typeof specs.ram === 'string' ? specs.ram : '');
        setWarranty(typeof specs.warranty === 'string' ? specs.warranty : '');
        setIncluded(
          Array.isArray(specs.included) ? specs.included.map(String) : []
        );
        setBatteryHealth(
          typeof specs.battery_health === 'number'
            ? String(specs.battery_health)
            : ''
        );
        setCycleCount(
          typeof specs.cycle_count === 'number' ? String(specs.cycle_count) : ''
        );
        setIcloudStatus(
          typeof specs.icloud_status === 'string' ? specs.icloud_status : ''
        );
        setMdmStatus(typeof specs.mdm_status === 'string' ? specs.mdm_status : '');
        setImeiBlacklist(
          typeof specs.imei_blacklist === 'string' ? specs.imei_blacklist : ''
        );
        setUnlockStatus(
          typeof specs.unlock_status === 'string' ? specs.unlock_status : ''
        );
        setChipRegion(
          typeof specs.chip_region === 'string' ? specs.chip_region : ''
        );
        setSimConfig(typeof specs.sim_config === 'string' ? specs.sim_config : '');
        if (g.images?.length) setImages(g.images);
        if (g.auction_starting_price)
          setStartingPrice(String(g.auction_starting_price));
        if (g.auction_reserve_price)
          setReservePrice(String(g.auction_reserve_price));
        if (g.auction_buy_now_price)
          setBuyNowPrice(String(g.auction_buy_now_price));
        if (g.auction_bid_increment)
          setBidIncrement(String(g.auction_bid_increment));
        if (g.auction_duration_hours)
          setDuration(String(g.auction_duration_hours));
        setStartNow(g.auction_start_now ?? true);
      } catch (error) {
        console.error('Failed to load gadget for editing:', error);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isEditing, editingGadget]);

  const loadCategories = async () => {
    try {
      const response = await auctionService.getCategories();
      setCategories(response.data || []);
    } catch (error) {
      console.error('Failed to load categories:', error);
      setCategories([]);
    }
  };

  const toggleIncluded = (id: string) => {
    setIncluded(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!categoryId) newErrors.category = 'Category is required';
    if (!brand.trim()) newErrors.brand = 'Brand is required';
    if (!model.trim()) newErrors.model = 'Model is required';
    if (!title.trim()) newErrors.title = 'Listing title is required';
    else if (title.trim().length < 5)
      newErrors.title = 'Title must be at least 5 characters';
    if (!description.trim()) newErrors.description = 'Description is required';
    else if (description.trim().length < 20)
      newErrors.description = 'Description must be at least 20 characters';
    if (!condition) newErrors.condition = 'Condition is required';
    if (images.length === 0)
      newErrors.images = 'At least one image is required';

    if (batteryHealth.trim()) {
      const n = Number(batteryHealth);
      if (!Number.isFinite(n) || n < 0 || n > 100) {
        newErrors.batteryHealth = 'Battery health must be 0–100';
      }
    }
    if (cycleCount.trim()) {
      const n = Number(cycleCount);
      if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) {
        newErrors.cycleCount = 'Cycle count must be a whole number';
      }
    }

    const startPrice = parseMoneyInput(startingPrice);
    const reserve = parseMoneyInput(reservePrice);
    const buyNow = parseMoneyInput(buyNowPrice);
    const increment = parseMoneyInput(bidIncrement);

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

  const buildSpecifications = (): GadgetSpecifications => {
    const specs: GadgetSpecifications = {};
    const selectedCondition = CONDITIONS.find(
      option => option.id === condition
    );

    if (
      selectedCondition &&
      getSubmittedCondition(condition) !== selectedCondition.id
    ) {
      specs.seller_selected_condition = selectedCondition.label;
      specs.seller_selected_condition_value = selectedCondition.id;
    }

    if (color.trim()) specs.color = color.trim();
    if (storage) specs.storage = storage;
    if (showAppleLaptop && ram) specs.ram = ram;
    if (warranty) specs.warranty = warranty;
    if (included.length) specs.included = included;

    if (showBatteryBlock) {
      if (batteryHealth.trim()) {
        specs.battery_health = Number(batteryHealth);
      }
      if (cycleCount.trim()) {
        specs.cycle_count = Number(cycleCount);
      }
    }

    if (showApplePhone) {
      if (icloudStatus) specs.icloud_status = icloudStatus;
      if (mdmStatus) specs.mdm_status = mdmStatus;
      if (imeiBlacklist) specs.imei_blacklist = imeiBlacklist;
      if (unlockStatus) specs.unlock_status = unlockStatus;
      if (chipRegion) specs.chip_region = chipRegion;
      if (simConfig) specs.sim_config = simConfig;
    }

    return specs;
  };

  const appendPickedAssets = async (assets: ImagePicker.ImagePickerAsset[]) => {
    const remaining = MAX_PHOTOS - images.length;
    const next = assets.slice(0, remaining);
    const uris: string[] = [];
    for (const asset of next) {
      uris.push(await toJpegUri(asset.uri));
    }
    setImages(prev => [...prev, ...uris]);
  };

  const pickFromLibrary = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(
        'Permission needed',
        'Allow photo library access to add gadget photos.'
      );
      return;
    }

    const remaining = MAX_PHOTOS - images.length;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: remaining,
      quality: 0.8,
    });

    if (!result.canceled) {
      await appendPickedAssets(result.assets);
    }
  };

  const takePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(
        'Permission needed',
        'Allow camera access to photograph your gadget.'
      );
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.8,
    });

    if (!result.canceled) {
      await appendPickedAssets(result.assets);
    }
  };

  const handleAddImage = () => {
    if (images.length >= MAX_PHOTOS) {
      Alert.alert('Limit reached', `You can add up to ${MAX_PHOTOS} photos.`);
      return;
    }

    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: ['Cancel', 'Take Photo', 'Choose from Library'],
          cancelButtonIndex: 0,
        },
        buttonIndex => {
          if (buttonIndex === 1) takePhoto();
          if (buttonIndex === 2) pickFromLibrary();
        }
      );
      return;
    }

    Alert.alert('Add Photo', 'Choose a source', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Take Photo', onPress: takePhoto },
      { text: 'Choose from Library', onPress: pickFromLibrary },
    ]);
  };

  const handleRemoveImage = (index: number) => {
    setImages(images.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    if (!validateForm()) return;

    setIsLoading(true);
    try {
      const resolvedImages = await auctionService.resolveImageUrls(images);
      const specifications = buildSpecifications();
      const payload = {
        title: title.trim(),
        description: description.trim(),
        category_id: categoryId,
        brand: brand.trim(),
        model: model.trim(),
        condition: getSubmittedCondition(condition),
        images: resolvedImages,
        specifications:
          Object.keys(specifications).length > 0 ? specifications : undefined,
        auction_starting_price: parseMoneyInput(startingPrice),
        auction_reserve_price: reservePrice
          ? parseMoneyInput(reservePrice)
          : undefined,
        auction_buy_now_price: buyNowPrice
          ? parseMoneyInput(buyNowPrice)
          : undefined,
        auction_bid_increment: parseMoneyInput(bidIncrement),
        auction_duration_hours:
          DURATION_OPTIONS.find(d => d.id === duration)?.hours ?? 72,
        auction_start_now: startNow,
      };

      if (isEditing && editingGadget) {
        await auctionService.updateGadget(editingGadget.id, {
          ...payload,
          status: 'pending',
        });
        Alert.alert(
          'Resubmitted for review',
          'Your updated gadget was submitted for review. An admin will review it and your auction will go live once approved.',
          [
            {
              text: 'Done',
              onPress: () => navigation.goBack(),
            },
          ]
        );
        return;
      }

      await auctionService.createGadget(payload);

      Alert.alert(
        'Submitted for review',
        'Your gadget was listed successfully. An admin will review it and your auction will go live once approved.',
        [
          {
            text: 'Done',
            onPress: () => navigation.goBack(),
          },
        ]
      );
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to create gadget');
    } finally {
      setIsLoading(false);
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
        <Text style={styles.title}>
          {isEditing ? 'Edit Gadget' : 'List Gadget'}
        </Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        {/* Photos */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Photos</Text>
          <Text style={styles.sectionSubtitle}>
            Add up to {MAX_PHOTOS} photos from your camera or library
          </Text>

          <View style={styles.imagesContainer}>
            {images.map((uri, index) => (
              <View key={`${uri}-${index}`} style={styles.imageWrapper}>
                <Image source={{ uri }} style={styles.image} />
                <TouchableOpacity
                  style={styles.removeImageButton}
                  onPress={() => handleRemoveImage(index)}
                >
                  <Ionicons name="close" size={14} color={colors.text} />
                </TouchableOpacity>
              </View>
            ))}
            {images.length < MAX_PHOTOS && (
              <TouchableOpacity
                style={styles.addImageButton}
                onPress={handleAddImage}
              >
                <Ionicons
                  name="camera-outline"
                  size={28}
                  color={colors.textMuted}
                  style={styles.addImageIcon}
                />
                <Text style={styles.addImageText}>Add Photo</Text>
              </TouchableOpacity>
            )}
          </View>
          {errors.images && (
            <Text style={styles.errorText}>{errors.images}</Text>
          )}
        </View>

        {/* Category */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Category</Text>
          <View style={styles.categoryGrid}>
            {categories.map(cat => (
              <TouchableOpacity
                key={cat.id}
                style={[
                  styles.categoryItem,
                  categoryId === cat.id
                    ? styles.categoryItemSelected
                    : undefined,
                ]}
                onPress={() => setCategoryId(cat.id)}
              >
                <Text
                  style={[
                    styles.categoryText,
                    categoryId === cat.id
                      ? styles.categoryTextSelected
                      : undefined,
                  ]}
                >
                  {cat.name}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          {errors.category && (
            <Text style={styles.errorText}>{errors.category}</Text>
          )}
        </View>

        {/* Product identity */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Product</Text>
          <Text style={styles.sectionSubtitle}>
            Brand and model identify the device
          </Text>
          <OptionPicker
            label="Brand"
            placeholder="e.g., Apple"
            value={brand}
            options={BRAND_SUGGESTIONS}
            onSelect={setBrand}
            error={errors.brand}
          />
          <OptionPicker
            label="Model"
            placeholder="e.g., iPhone 15 Pro Max"
            value={model}
            options={modelOptions}
            onSelect={setModel}
            error={errors.model}
          />
        </View>

        {/* Specs common */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Details</Text>
          <Input
            label="Color"
            placeholder="e.g., Natural Titanium"
            value={color}
            onChangeText={setColor}
          />

          <Text style={styles.fieldLabel}>Storage</Text>
          <ChipGroup
            options={STORAGE_OPTIONS}
            value={storage}
            onChange={setStorage}
          />

          {showAppleLaptop && (
            <>
              <Text style={[styles.fieldLabel, styles.fieldLabelSpaced]}>
                RAM
              </Text>
              <ChipGroup options={RAM_OPTIONS} value={ram} onChange={setRam} />
            </>
          )}

          <Text style={[styles.fieldLabel, styles.fieldLabelSpaced]}>
            Warranty
          </Text>
          <ChipGroup
            options={WARRANTY_OPTIONS}
            value={warranty}
            onChange={setWarranty}
          />

          <Text style={[styles.fieldLabel, styles.fieldLabelSpaced]}>
            What&apos;s included
          </Text>
          <MultiChipGroup
            options={INCLUDED_OPTIONS}
            values={included}
            onToggle={toggleIncluded}
          />
        </View>

        {/* Battery (Apple phone / MacBook) */}
        {showBatteryBlock && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Battery</Text>
            <Text style={styles.sectionSubtitle}>
              From Settings → Battery (or System Settings on Mac)
            </Text>
            <Input
              label="Battery health (%)"
              placeholder="e.g., 89"
              value={batteryHealth}
              onChangeText={setBatteryHealth}
              keyboardType="number-pad"
              error={errors.batteryHealth}
            />
            <Input
              label="Cycle count"
              placeholder="e.g., 312"
              value={cycleCount}
              onChangeText={setCycleCount}
              keyboardType="number-pad"
              error={errors.cycleCount}
            />
          </View>
        )}

        {/* iPhone checks */}
        {showApplePhone && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>iPhone status checks</Text>
            <Text style={styles.sectionSubtitle}>
              iCloud, MDM, and IMEI / blacklist (online check)
            </Text>

            <Text style={styles.fieldLabel}>iCloud</Text>
            <ChipGroup
              options={CHECK_STATUS_OPTIONS}
              value={icloudStatus}
              onChange={setIcloudStatus}
            />

            <Text style={[styles.fieldLabel, styles.fieldLabelSpaced]}>
              MDM
            </Text>
            <ChipGroup
              options={MDM_STATUS_OPTIONS}
              value={mdmStatus}
              onChange={setMdmStatus}
            />

            <Text style={[styles.fieldLabel, styles.fieldLabelSpaced]}>
              IMEI / blacklist
            </Text>
            <ChipGroup
              options={CHECK_STATUS_OPTIONS}
              value={imeiBlacklist}
              onChange={setImeiBlacklist}
            />

            <Text style={[styles.fieldLabel, styles.fieldLabelSpaced]}>
              Unlock status
            </Text>
            <ChipGroup
              options={UNLOCK_STATUS_OPTIONS}
              value={unlockStatus}
              onChange={setUnlockStatus}
            />

            <Text style={[styles.fieldLabel, styles.fieldLabelSpaced]}>
              Chip region
            </Text>
            <ChipGroup
              options={CHIP_REGION_OPTIONS}
              value={chipRegion}
              onChange={setChipRegion}
            />

            <Text style={[styles.fieldLabel, styles.fieldLabelSpaced]}>
              SIM configuration
            </Text>
            <ChipGroup
              options={SIM_CONFIG_OPTIONS}
              value={simConfig}
              onChange={setSimConfig}
            />
          </View>
        )}

        {/* Listing title & description */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Listing</Text>
          <Input
            label="Listing title"
            placeholder="What buyers see first"
            value={title}
            onChangeText={text => {
              setTitleTouched(true);
              setTitle(text);
            }}
            error={errors.title}
          />
          <Text style={styles.helperText}>
            Suggested from brand, model, and storage — edit freely if needed
          </Text>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Description</Text>
            <TextInput
              style={[
                styles.textArea,
                errors.description ? styles.inputError : undefined,
              ]}
              value={description}
              onChangeText={setDescription}
              placeholder="Condition notes, defects, accessories, why you're selling…"
              placeholderTextColor={colors.textMuted}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />
            <Text style={styles.helperText}>
              {description.trim().length}/20 min characters
            </Text>
            {errors.description && (
              <Text style={styles.errorText}>{errors.description}</Text>
            )}
          </View>
        </View>

        {/* Condition */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Condition</Text>
          {CONDITIONS.map(cond => (
            <TouchableOpacity
              key={cond.id}
              style={[
                styles.conditionItem,
                condition === cond.id
                  ? styles.conditionItemSelected
                  : undefined,
              ]}
              onPress={() => setCondition(cond.id)}
            >
              <View style={styles.conditionRadio}>
                {condition === cond.id && (
                  <View style={styles.conditionRadioInner} />
                )}
              </View>
              <View style={styles.conditionContent}>
                <Text
                  style={[
                    styles.conditionLabel,
                    condition === cond.id
                      ? styles.conditionLabelSelected
                      : undefined,
                  ]}
                >
                  {cond.label}
                </Text>
                <Text style={styles.conditionDescription}>
                  {cond.description}
                </Text>
              </View>
            </TouchableOpacity>
          ))}
          {errors.condition && (
            <Text style={styles.errorText}>{errors.condition}</Text>
          )}
        </View>

        {/* Pricing */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Pricing</Text>
          <Text style={styles.sectionSubtitle}>
            Set your auction prices in Naira (₦)
          </Text>

          <Input
            label="Starting Price *"
            placeholder="e.g., 50,000"
            value={startingPrice}
            onChangeText={value => setStartingPrice(formatMoneyInput(value))}
            keyboardType="number-pad"
            error={errors.startingPrice}
            leftIcon={<Text style={styles.currencyIcon}>₦</Text>}
          />

          <Input
            label="Reserve Price (Optional)"
            placeholder="Minimum price to sell"
            value={reservePrice}
            onChangeText={value => setReservePrice(formatMoneyInput(value))}
            keyboardType="number-pad"
            error={errors.reservePrice}
            leftIcon={<Text style={styles.currencyIcon}>₦</Text>}
          />

          <Input
            label="Buy Now Price (Optional)"
            placeholder="Instant purchase price"
            value={buyNowPrice}
            onChangeText={value => setBuyNowPrice(formatMoneyInput(value))}
            keyboardType="number-pad"
            error={errors.buyNowPrice}
            leftIcon={<Text style={styles.currencyIcon}>₦</Text>}
          />

          <Input
            label="Minimum Bid Increment *"
            placeholder="e.g., 2000"
            value={bidIncrement}
            onChangeText={value => setBidIncrement(formatMoneyInput(value))}
            keyboardType="number-pad"
            error={errors.bidIncrement}
            leftIcon={<Text style={styles.currencyIcon}>₦</Text>}
          />

          {expectedSaleAmount > 0 ? (
            <View style={styles.feePreviewCard}>
              <View style={styles.feePreviewHeader}>
                <Text style={styles.feePreviewTitle}>
                  Seller payout estimate
                </Text>
                <Text style={styles.feePreviewBadge}>
                  {PLATFORM_FEE_PERCENTAGE}% fee
                </Text>
              </View>
              <View style={styles.feePreviewRow}>
                <Text style={styles.feePreviewLabel}>Estimated sale</Text>
                <Text style={styles.feePreviewValue}>
                  {formatCurrency(expectedSaleAmount)}
                </Text>
              </View>
              <View style={styles.feePreviewRow}>
                <Text style={styles.feePreviewLabel}>Platform fee</Text>
                <Text style={styles.feePreviewValueMuted}>
                  -{formatCurrency(estimatedFee)}
                </Text>
              </View>
              <View style={styles.feeDivider} />
              <View style={styles.feePreviewRow}>
                <Text style={styles.feePreviewNetLabel}>You receive</Text>
                <Text style={styles.feePreviewNetValue}>
                  {formatCurrency(estimatedPayout)}
                </Text>
              </View>
              <Text style={styles.feePreviewNote}>
                Final payout is calculated from the winning bid or buy-now
                price.
              </Text>
            </View>
          ) : null}
        </View>

        {/* Duration */}
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

        {/* Start Time */}
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
                Auction goes live as soon as an admin approves it
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
                Auction starts the day after it's approved
              </Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* Summary */}
        <View style={styles.summaryCard}>
          <Text style={styles.summaryTitle}>Listing Summary</Text>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Starting Price</Text>
            <Text style={styles.summaryValue}>
              {startingPrice
                ? formatCurrency(parseMoneyInput(startingPrice))
                : '—'}
            </Text>
          </View>
          {reservePrice && (
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Reserve Price</Text>
              <Text style={styles.summaryValue}>
                {formatCurrency(parseMoneyInput(reservePrice))}
              </Text>
            </View>
          )}
          {buyNowPrice && (
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Buy Now Price</Text>
              <Text style={styles.summaryValue}>
                {formatCurrency(parseMoneyInput(buyNowPrice))}
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
              {startNow ? 'After approval' : 'Day after approval'}
            </Text>
          </View>
        </View>

        <View style={styles.submitContainer}>
          <Button
            title={isEditing ? 'Resubmit for Review' : 'Submit for Review'}
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
  fieldLabel: {
    color: colors.textSecondary,
    fontSize: fonts.sizes.sm,
    marginBottom: spacing.sm,
    fontWeight: '500',
  },
  fieldLabelSpaced: {
    marginTop: spacing.md,
  },
  helperText: {
    color: colors.textMuted,
    fontSize: fonts.sizes.xs,
    marginTop: -spacing.sm,
    marginBottom: spacing.md,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  chipText: {
    color: colors.textSecondary,
    fontSize: fonts.sizes.sm,
  },
  chipTextSelected: {
    color: colors.text,
    fontWeight: '600',
  },
  imagesContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  imageWrapper: {
    width: 100,
    height: 100,
    borderRadius: borderRadius.md,
    overflow: 'hidden',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  removeImageButton: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.error,
    justifyContent: 'center',
    alignItems: 'center',
  },
  addImageButton: {
    width: 100,
    height: 100,
    borderRadius: borderRadius.md,
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.border,
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
  },
  addImageIcon: {
    marginBottom: spacing.xs,
  },
  addImageText: {
    color: colors.textSecondary,
    fontSize: fonts.sizes.xs,
  },
  inputGroup: {
    marginBottom: spacing.md,
  },
  inputLabel: {
    color: colors.textSecondary,
    fontSize: fonts.sizes.sm,
    marginBottom: spacing.xs,
  },
  textArea: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    color: colors.text,
    fontSize: fonts.sizes.md,
    minHeight: 120,
    borderWidth: 1,
    borderColor: colors.border,
  },
  inputError: {
    borderColor: colors.error,
  },
  errorText: {
    color: colors.error,
    fontSize: fonts.sizes.sm,
    marginTop: spacing.xs,
  },
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  categoryItem: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  categoryItemSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  categoryText: {
    color: colors.textSecondary,
    fontSize: fonts.sizes.sm,
  },
  categoryTextSelected: {
    color: colors.text,
    fontWeight: '600',
  },
  conditionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  conditionItemSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primary + '10',
  },
  conditionRadio: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  conditionRadioInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.primary,
  },
  conditionContent: {
    flex: 1,
  },
  conditionLabel: {
    color: colors.text,
    fontSize: fonts.sizes.md,
    fontWeight: '500',
  },
  conditionLabelSelected: {
    color: colors.primary,
  },
  conditionDescription: {
    color: colors.textSecondary,
    fontSize: fonts.sizes.sm,
    marginTop: 2,
  },
  currencyIcon: {
    color: colors.textSecondary,
    fontSize: fonts.sizes.md,
    fontWeight: '600',
  },
  feePreviewCard: {
    marginTop: spacing.sm,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    borderColor: colors.primary + '30',
    backgroundColor: colors.primary + '10',
    padding: spacing.md,
    gap: spacing.sm,
  },
  feePreviewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  feePreviewTitle: {
    color: colors.text,
    fontSize: fonts.sizes.md,
    fontFamily: fonts.semiBold,
  },
  feePreviewBadge: {
    color: colors.primary,
    backgroundColor: colors.primary + '18',
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    fontSize: fonts.sizes.xs,
    fontFamily: fonts.semiBold,
    overflow: 'hidden',
  },
  feePreviewRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.md,
  },
  feePreviewLabel: {
    color: colors.textSecondary,
    fontSize: fonts.sizes.sm,
    fontFamily: fonts.medium,
  },
  feePreviewValue: {
    color: colors.text,
    fontSize: fonts.sizes.sm,
    fontFamily: fonts.semiBold,
  },
  feePreviewValueMuted: {
    color: colors.textSecondary,
    fontSize: fonts.sizes.sm,
    fontFamily: fonts.semiBold,
  },
  feeDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.primary + '25',
  },
  feePreviewNetLabel: {
    color: colors.text,
    fontSize: fonts.sizes.md,
    fontFamily: fonts.semiBold,
  },
  feePreviewNetValue: {
    color: colors.primary,
    fontSize: fonts.sizes.lg,
    fontFamily: fonts.bold,
  },
  feePreviewNote: {
    color: colors.textMuted,
    fontSize: fonts.sizes.xs,
    fontFamily: fonts.regular,
    lineHeight: 18,
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
    marginTop: spacing.lg,
  },
  bottomPadding: {
    height: 100,
  },
});
export default CreateGadgetScreen;
