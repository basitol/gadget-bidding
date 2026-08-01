import React from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../hooks';
import { tabBarStyles as styles } from './tabStyles';

type TabIconName =
  | 'home-outline'
  | 'search-outline'
  | 'wallet-outline'
  | 'person-outline'
  | 'pricetag-outline'
  | 'bag-outline'
  | 'storefront-outline';

export const TabIcon = ({
  name,
  focused,
}: {
  name: TabIconName;
  focused: boolean;
}) => {
  const { colors, mode } = useTheme();
  const filled = name.replace('-outline', '') as TabIconName;

  return (
    <View style={styles.tabIconWrap}>
      <View
        style={[
          styles.tabIconContainer,
          focused && {
            backgroundColor: colors.primary + (mode === 'dark' ? '22' : '14'),
          },
        ]}
      >
        <Ionicons
          name={focused ? (filled as any) : name}
          size={21}
          color={focused ? colors.primary : colors.textMuted}
        />
      </View>
    </View>
  );
};
