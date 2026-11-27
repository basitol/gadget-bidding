import React from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { G, BlurView, BLUR_INTENSITY } from '../components/glass';

/**
 * Bottom nav spec: 64 high, padding 6, radius 32, fill #FFF 56%, border 1px #FFF 75%,
 * backdrop blur(22px) saturate(170%), 5 equal columns with gap 4, 22px stroke icons (1.8),
 * active icon #3E6AF0.
 */
const ICONS: Record<string, [keyof typeof Ionicons.glyphMap, string]> = {
  Home: ['home-outline', 'Home'],
  Explore: ['search-outline', 'Explore'],
  Watchlist: ['heart-outline', 'Watchlist'],
  Bids: ['hammer-outline', 'My bids'],
  Profile: ['person-outline', 'Profile'],
};

const ACTIVE = '#3E6AF0';

export const GlassTabBar: React.FC<BottomTabBarProps> = ({ state, navigation }) => {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.wrap, { paddingBottom: Math.max(insets.bottom, 12) }]} pointerEvents="box-none">
      <View style={styles.bar} accessibilityRole="tablist">
        {BlurView ? (
          <>
            <BlurView intensity={BLUR_INTENSITY} tint="light" style={[StyleSheet.absoluteFill, styles.round]} pointerEvents="none" />
            <View style={[StyleSheet.absoluteFill, styles.round, styles.fill]} pointerEvents="none" />
          </>
        ) : null}
        {state.routes.map((route, index) => {
          const focused = state.index === index;
          const [icon, label] = ICONS[route.name] ?? ['ellipse-outline', route.name];
          return (
            <Pressable
              key={route.key}
              onPress={() => {
                const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
                if (!focused && !event.defaultPrevented) navigation.navigate(route.name);
              }}
              style={({ pressed }) => [styles.item, focused && styles.itemOn, pressed && styles.pressed]}
              accessibilityRole="tab"
              accessibilityLabel={label}
              accessibilityState={{ selected: focused }}
            >
              <Ionicons name={icon} size={22} color={focused ? ACTIVE : G.muted} />
            </Pressable>
          );
        })}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 16 },
  bar: {
    flexDirection: 'row',
    gap: 4,
    height: 64,
    padding: 6,
    borderRadius: 32,
    // Spec fill is #FFF 56% over a blur. Without the blur (older builds), content scrolling
    // underneath would read through, so stay near-opaque until the blur is there.
    backgroundColor: BlurView ? 'transparent' : 'rgba(255,255,255,0.92)',
    borderWidth: 1,
    borderColor: G.cardBorder,
    shadowColor: '#141C3C',
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  round: { borderRadius: 31, overflow: 'hidden' },
  fill: { backgroundColor: G.card },
  item: { flex: 1, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  itemOn: { backgroundColor: G.blueTint },
  pressed: { opacity: 0.7 },
});
