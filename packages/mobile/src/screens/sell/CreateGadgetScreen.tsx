import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, fonts, spacing, borderRadius } from '../../constants';
import { Button, Input } from '../../components';
import { auctionService } from '../../services';

type CreateGadgetScreenProps = {
  navigation: any;
};

const CONDITIONS = [
  { id: 'new', label: 'New', description: 'Brand new, sealed' },
  {
    id: 'like_new',
    label: 'Like New',
    description: 'Barely used, excellent condition',
  },
  { id: 'good', label: 'Good', description: 'Minor wear, fully functional' },
  { id: 'fair', label: 'Fair', description: 'Visible wear, works well' },
];

export const CreateGadgetScreen: React.FC<CreateGadgetScreenProps> = ({
  navigation,
}) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [brand, setBrand] = useState('');
  const [model, setModel] = useState('');
  const [condition, setCondition] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    loadCategories();
  }, []);

  const loadCategories = async () => {
    try {
      const response = await auctionService.getCategories();
      setCategories(response.data || []);
    } catch (error) {
      console.error('Failed to load categories:', error);
      // Fallback categories
      setCategories([
        'smartphones',
        'laptops',
        'tablets',
        'gaming',
        'audio',
        'wearables',
        'cameras',
        'accessories',
      ]);
    }
  };

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!title.trim()) newErrors.title = 'Title is required';
    if (!description.trim()) newErrors.description = 'Description is required';
    if (!category) newErrors.category = 'Category is required';
    if (!condition) newErrors.condition = 'Condition is required';
    if (images.length === 0)
      newErrors.images = 'At least one image is required';

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleAddImage = () => {
    // For now, we'll use placeholder images
    // In production, this would open image picker
    Alert.prompt(
      'Add Image URL',
      'Enter the URL of the image:',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Add',
          onPress: url => {
            if (url && url.trim()) {
              setImages([...images, url.trim()]);
            }
          },
        },
      ],
      'plain-text'
    );
  };

  const handleRemoveImage = (index: number) => {
    setImages(images.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    if (!validateForm()) return;

    setIsLoading(true);
    try {
      const response = await auctionService.createGadget({
        title: title.trim(),
        description: description.trim(),
        category,
        brand: brand.trim() || undefined,
        model: model.trim() || undefined,
        condition,
        images,
      });

      Alert.alert(
        'Success',
        'Gadget created successfully! Now create an auction for it.',
        [
          {
            text: 'Create Auction',
            onPress: () =>
              navigation.navigate('CreateAuction', {
                gadgetId: response.data.id,
              }),
          },
          {
            text: 'Later',
            style: 'cancel',
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
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
        >
          <Text style={styles.backIcon}>←</Text>
        </TouchableOpacity>
        <Text style={styles.title}>List Gadget</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
      >
        {/* Images Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Photos</Text>
          <Text style={styles.sectionSubtitle}>
            Add up to 5 photos of your gadget
          </Text>

          <View style={styles.imagesContainer}>
            {images.map((uri, index) => (
              <View key={index} style={styles.imageWrapper}>
                <Image source={{ uri }} style={styles.image} />
                <TouchableOpacity
                  style={styles.removeImageButton}
                  onPress={() => handleRemoveImage(index)}
                >
                  <Text style={styles.removeImageIcon}>✕</Text>
                </TouchableOpacity>
              </View>
            ))}
            {images.length < 5 && (
              <TouchableOpacity
                style={styles.addImageButton}
                onPress={handleAddImage}
              >
                <Text style={styles.addImageIcon}>📷</Text>
                <Text style={styles.addImageText}>Add Photo</Text>
              </TouchableOpacity>
            )}
          </View>
          {errors.images && (
            <Text style={styles.errorText}>{errors.images}</Text>
          )}
        </View>

        {/* Basic Info */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Basic Information</Text>

          <Input
            label="Title"
            placeholder="e.g., iPhone 15 Pro Max 256GB"
            value={title}
            onChangeText={setTitle}
            error={errors.title}
          />

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Description</Text>
            <TextInput
              style={[
                styles.textArea,
                errors.description ? styles.inputError : undefined,
              ]}
              value={description}
              onChangeText={setDescription}
              placeholder="Describe your gadget in detail..."
              placeholderTextColor={colors.textMuted}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />
            {errors.description && (
              <Text style={styles.errorText}>{errors.description}</Text>
            )}
          </View>
        </View>

        {/* Category */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Category</Text>
          <View style={styles.categoryGrid}>
            {categories.map(cat => (
              <TouchableOpacity
                key={cat}
                style={[
                  styles.categoryItem,
                  category === cat ? styles.categoryItemSelected : undefined,
                ]}
                onPress={() => setCategory(cat)}
              >
                <Text
                  style={[
                    styles.categoryText,
                    category === cat ? styles.categoryTextSelected : undefined,
                  ]}
                >
                  {cat.charAt(0).toUpperCase() + cat.slice(1)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          {errors.category && (
            <Text style={styles.errorText}>{errors.category}</Text>
          )}
        </View>

        {/* Brand & Model */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Brand & Model (Optional)</Text>
          <View style={styles.row}>
            <View style={styles.halfInput}>
              <Input
                label="Brand"
                placeholder="e.g., Apple"
                value={brand}
                onChangeText={setBrand}
              />
            </View>
            <View style={styles.halfInput}>
              <Input
                label="Model"
                placeholder="e.g., iPhone 15"
                value={model}
                onChangeText={setModel}
              />
            </View>
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

        {/* Submit Button */}
        <View style={styles.submitContainer}>
          <Button
            title="Continue to Auction"
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
  removeImageIcon: {
    color: colors.text,
    fontSize: fonts.sizes.sm,
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
    fontSize: fonts.sizes.xxl,
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
  row: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  halfInput: {
    flex: 1,
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
  submitContainer: {
    marginTop: spacing.lg,
  },
  bottomPadding: {
    height: 100,
  },
});

export default CreateGadgetScreen;
