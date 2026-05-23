import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useTheme } from '../../hooks';
import { ThemeColors, fonts, spacing } from '../../constants';

interface AuthFooterLinkProps {
  text: string;
  linkText: string;
  onPress: () => void;
}

export const AuthFooterLink: React.FC<AuthFooterLinkProps> = ({
  text,
  linkText,
  onPress,
}) => {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.container}>
      <Text style={styles.text}>{text}</Text>
      <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
        <Text style={styles.link}>{linkText}</Text>
      </TouchableOpacity>
    </View>
  );
};

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: {
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      gap: spacing.xs,
    },
    text: {
      color: colors.textSecondary,
      fontSize: fonts.sizes.md,
    },
    link: {
      color: colors.primary,
      fontSize: fonts.sizes.md,
      fontWeight: '700',
    },
  });
