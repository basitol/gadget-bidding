import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../hooks';
import { ThemeColors, fonts, spacing, borderRadius } from '../../constants';
import { useErrorLogStore, ErrorLogEntry } from '../../store/errorLogStore';

type ErrorHistoryScreenProps = {
  navigation: NativeStackNavigationProp<any>;
};

const formatTime = (timestamp: number): string => {
  const d = new Date(timestamp);
  return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  })}`;
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
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerTitle: {
      flex: 1,
      textAlign: 'center',
      color: colors.text,
      fontSize: fonts.sizes.xl,
      fontFamily: fonts.bold,
    },
    headerSpacer: {
      width: 40,
    },
    listContent: {
      paddingHorizontal: spacing.lg,
      paddingBottom: 120,
    },
    entry: {
      backgroundColor: colors.surface,
      borderRadius: borderRadius.md,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.md,
      marginBottom: spacing.sm,
    },
    entryTop: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    entrySource: {
      color: colors.text,
      fontFamily: fonts.semiBold,
      fontSize: fonts.sizes.sm,
    },
    entryTime: {
      color: colors.textMuted,
      fontSize: fonts.sizes.xs,
    },
    entryMessage: {
      color: colors.text,
      fontSize: fonts.sizes.sm,
      marginTop: spacing.xs,
    },
    entryMeta: {
      color: colors.textMuted,
      fontSize: fonts.sizes.xs,
      marginTop: spacing.xs,
    },
    empty: {
      alignItems: 'center',
      paddingVertical: spacing.xl * 2,
    },
    emptyText: {
      color: colors.textMuted,
      fontSize: fonts.sizes.md,
      textAlign: 'center',
    },
    clearButton: {
      marginHorizontal: spacing.lg,
      marginBottom: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: borderRadius.md,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
    },
    clearButtonText: {
      color: colors.error || colors.text,
      fontFamily: fonts.semiBold,
      fontSize: fonts.sizes.sm,
    },
  });

export const ErrorHistoryScreen: React.FC<ErrorHistoryScreenProps> = ({
  navigation,
}) => {
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const { errors, clear, hydrate } = useErrorLogStore();
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    hydrate().finally(() => setInitialized(true));
  }, [hydrate]);

  const showDetail = (entry: ErrorLogEntry) => {
    Alert.alert(formatTime(entry.timestamp), [
      entry.message,
      entry.path ? `\nRequest: ${entry.path}` : '',
      entry.statusCode ? `\nStatus: ${entry.statusCode}` : '',
    ].join(''));
  };

  const confirmClear = () => {
    Alert.alert('Clear error history', 'Remove all recorded errors?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear', style: 'destructive', onPress: clear },
    ]);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Error history</Text>
        <View style={styles.headerSpacer} />
      </View>

      {errors.length > 0 && (
        <TouchableOpacity style={styles.clearButton} onPress={confirmClear}>
          <Text style={styles.clearButtonText}>Clear history</Text>
        </TouchableOpacity>
      )}

      <FlatList
        data={errors}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          initialized ? (
            <View style={styles.empty}>
              <Text style={styles.emptyText}>
                Errors from failed requests will show up here
              </Text>
            </View>
          ) : null
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.entry}
            onPress={() => showDetail(item)}
          >
            <View style={styles.entryTop}>
              <Text style={styles.entrySource}>{item.source}</Text>
              <Text style={styles.entryTime}>{formatTime(item.timestamp)}</Text>
            </View>
            <Text style={styles.entryMessage} numberOfLines={3}>
              {item.message}
            </Text>
            {(item.statusCode || item.path) && (
              <Text style={styles.entryMeta} numberOfLines={1}>
                {item.statusCode ? `HTTP ${item.statusCode}` : ''}
                {item.statusCode && item.path ? ' · ' : ''}
                {item.path || ''}
              </Text>
            )}
          </TouchableOpacity>
        )}
      />
    </SafeAreaView>
  );
};
