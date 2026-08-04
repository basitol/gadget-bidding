import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  Modal,
  FlatList,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../hooks';
import { ThemeColors, fonts, borderRadius, spacing } from '../constants';
import { Input } from './Input';

interface OptionPickerProps {
  label: string;
  value: string;
  placeholder?: string;
  options: readonly string[];
  error?: string;
  onSelect: (value: string) => void;
  searchable?: boolean;
}

export const OptionPicker: React.FC<OptionPickerProps> = ({
  label,
  value,
  placeholder,
  options,
  error,
  onSelect,
  searchable = true,
}) => {
  const { mode, colors } = useTheme();
  const styles = useMemo(() => createStyles(colors, mode), [colors, mode]);
  const [open, setOpen] = useState(false);
  const [manual, setManual] = useState(false);
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(o => o.toLowerCase().includes(q));
  }, [options, query]);

  const pick = (next: string) => {
    onSelect(next);
    setOpen(false);
    setQuery('');
  };

  const openManual = () => {
    setOpen(false);
    setManual(true);
    setQuery('');
  };

  if (manual) {
    return (
      <Input
        label={label}
        value={value}
        onChangeText={onSelect}
        error={error}
        rightIcon={
          <TouchableOpacity
            onPress={() => setManual(false)}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="list-outline" size={20} color={colors.textMuted} />
          </TouchableOpacity>
        }
      />
    );
  }

  return (
    <>
      <View style={styles.container}>
        <Text style={styles.label}>{label}</Text>
        <TouchableOpacity
          style={[styles.field, error ? styles.fieldError : undefined]}
          onPress={() => setOpen(true)}
          activeOpacity={0.8}
        >
          <Text
            style={[styles.value, value ? undefined : styles.placeholder]}
            numberOfLines={1}
          >
            {value || placeholder || 'Select'}
          </Text>
          <Ionicons name="chevron-down" size={20} color={colors.textMuted} />
        </TouchableOpacity>
        {error && <Text style={styles.errorText}>{error}</Text>}
      </View>

      <Modal
        visible={open}
        transparent
        animationType="slide"
        onRequestClose={() => setOpen(false)}
      >
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)} />
        <View style={styles.sheet}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>{label}</Text>
            <TouchableOpacity
              onPress={() => setOpen(false)}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="close" size={24} color={colors.text} />
            </TouchableOpacity>
          </View>
          {searchable && (
            <TextInput
              style={styles.search}
              placeholder="Search options…"
              placeholderTextColor={colors.textMuted}
              value={query}
              onChangeText={setQuery}
              autoCapitalize="words"
              autoCorrect={false}
            />
          )}
          <FlatList
            data={filtered}
            keyExtractor={(item, index) => `${item}-${index}`}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <TouchableOpacity style={styles.option} onPress={() => pick(item)}>
                <Text
                  style={[
                    styles.optionText,
                    value === item ? styles.optionTextSelected : undefined,
                  ]}
                >
                  {item}
                </Text>
                {value === item && (
                  <Ionicons name="checkmark" size={20} color={colors.primary} />
                )}
              </TouchableOpacity>
            )}
            ListEmptyComponent={
              <Text style={styles.emptyText}>
                No matching options. You can still enter this manually.
              </Text>
            }
            ListFooterComponent={
              <TouchableOpacity style={styles.manualOption} onPress={openManual}>
                <Ionicons name="create-outline" size={18} color={colors.primary} />
                <Text style={styles.manualText}>Type manually instead</Text>
              </TouchableOpacity>
            }
          />
        </View>
      </Modal>
    </>
  );
};

const createStyles = (colors: ThemeColors, mode: 'light' | 'dark') =>
  StyleSheet.create({
    container: {
      marginBottom: spacing.lg,
    },
    label: {
      color: colors.text,
      fontSize: fonts.sizes.sm,
      fontFamily: fonts.semiBold,
      marginBottom: spacing.sm,
      letterSpacing: 0.2,
    },
    field: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      minHeight: 54,
      borderRadius: borderRadius.xl,
      borderWidth: 1.5,
      borderColor: colors.border,
      backgroundColor: mode === 'dark' ? colors.surfaceLight : colors.surfaceLight,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
    },
    fieldError: {
      borderColor: colors.error,
    },
    value: {
      flex: 1,
      color: colors.text,
      fontSize: fonts.sizes.md,
      fontFamily: fonts.medium,
    },
    placeholder: {
      color: colors.textMuted,
    },
    errorText: {
      color: colors.error,
      fontSize: fonts.sizes.sm,
      fontFamily: fonts.medium,
      marginTop: spacing.xs,
    },
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
    },
    sheet: {
      backgroundColor: mode === 'dark' ? colors.surface : colors.background,
      borderTopLeftRadius: borderRadius.xl,
      borderTopRightRadius: borderRadius.xl,
      paddingTop: spacing.md,
      maxHeight: '75%',
    },
    sheetHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.lg,
      paddingBottom: spacing.md,
    },
    sheetTitle: {
      color: colors.text,
      fontSize: fonts.sizes.lg,
      fontFamily: fonts.bold,
    },
    search: {
      marginHorizontal: spacing.lg,
      marginBottom: spacing.sm,
      backgroundColor: mode === 'dark' ? colors.surfaceLight : colors.backgroundLight,
      borderRadius: borderRadius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      color: colors.text,
      fontSize: fonts.sizes.md,
      fontFamily: fonts.medium,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
    },
    option: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
    },
    optionText: {
      color: colors.text,
      fontSize: fonts.sizes.md,
      fontFamily: fonts.regular,
      flex: 1,
    },
    optionTextSelected: {
      color: colors.primary,
      fontFamily: fonts.semiBold,
    },
    emptyText: {
      color: colors.textMuted,
      fontSize: fonts.sizes.md,
      fontFamily: fonts.regular,
      textAlign: 'center',
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.lg,
    },
    manualOption: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.sm,
      paddingVertical: spacing.lg,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    manualText: {
      color: colors.primary,
      fontSize: fonts.sizes.md,
      fontFamily: fonts.semiBold,
    },
  });
