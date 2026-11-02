import React, { useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import { ThemeColors } from '../constants';
import { useTheme } from '../hooks';
import { EmptyState } from './EmptyState';

interface ErrorFallbackProps {
  onRetry: () => void;
}

export const ErrorFallback: React.FC<ErrorFallbackProps> = ({ onRetry }) => {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.container}>
      <EmptyState
        icon="alert-circle-outline"
        title="Something went wrong"
        message="An unexpected error occurred. Please try again."
        actionLabel="Try Again"
        onAction={onRetry}
      />
    </View>
  );
};

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
  });
