import React, { useEffect, useRef, useState } from 'react';
import { View, Pressable, StyleSheet, Animated, LayoutChangeEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { G, BlurView, BLUR_INTENSITY } from '../components/glass';
import { useReducedMotion } from '../components/motion/useReducedMotion';

/**
 * Bottom nav spec: 64 high, padding 6, radius 32, fill #FFF 56%, border 1px #FFF 75%,
 * backdrop blur(22px) saturate(170%), 5 equal columns with gap 4, 22px stroke icons (1.8),
 * active icon #3E6AF0.
 *
 * The selected pill moves like a drop of water: its leading edge springs ahead, the trailing
 * edge follows a beat later, so it stretches towards the new tab, thins a little while it
 * travels, then settles with a small wobble. With "reduce motion" on it just moves.
 */
const ICONS: Record<string, [keyof typeof Ionicons.glyphMap, string]> = {
  Home: ['home-outline', 'Home'],
  Explore: ['search-outline', 'Explore'],
  Watchlist: ['heart-outline', 'Watchlist'],
  Bids: ['hammer-outline', 'My bids'],
  Profile: ['person-outline', 'Profile'],
  // Seller app
  Listings: ['list-outline', 'Listings'],
  Orders: ['cube-outline', 'Orders'],
  Payouts: ['wallet-outline', 'Payouts'],
  Store: ['storefront-outline', 'Store'],
};

const ACTIVE = '#3E6AF0';
const PAD = 6;
const GAP = 4;
const BORDER = 1;

/** Fast spring for the edge that leads, softer one for the edge that follows. */
const LEAD = { stiffness: 420, damping: 24, mass: 0.9 };
const TRAIL = { stiffness: 190, damping: 17, mass: 1 };

export const GlassTabBar: React.FC<BottomTabBarProps> = ({ state, navigation }) => {
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const count = state.routes.length;
  const [itemW, setItemW] = useState(0);

  // The pill's two edges, in px from the inner left edge of the bar.
  const left = useRef(new Animated.Value(0)).current;
  const right = useRef(new Animated.Value(0)).current;
  const prevIndex = useRef(state.index);
  const placed = useRef(false);

  const onLayout = (e: LayoutChangeEvent) => {
    const inner = e.nativeEvent.layout.width - 2 * (PAD + BORDER);
    setItemW((inner - GAP * (count - 1)) / count);
  };

  useEffect(() => {
    if (!itemW) return;
    const toL = state.index * (itemW + GAP);
    const toR = toL + itemW;
    const from = prevIndex.current;
    prevIndex.current = state.index;

    if (!placed.current || reduced || from === state.index) {
      placed.current = true;
      left.setValue(toL);
      right.setValue(toR);
      return;
    }
    const goingRight = state.index > from;
    const spring = (v: Animated.Value, toValue: number, cfg: typeof LEAD, delay = 0) =>
      Animated.spring(v, { toValue, ...cfg, delay, useNativeDriver: true });
    Animated.parallel([
      spring(goingRight ? right : left, goingRight ? toR : toL, LEAD),
      spring(goingRight ? left : right, goingRight ? toL : toR, TRAIL, 40),
    ]).start();
  }, [state.index, itemW, reduced, left, right]);

  // Width is (right − left); draw a pill one tab wide and stretch it around its centre.
  const w = itemW || 1;
  const stretch = Animated.divide(Animated.subtract(right, left), w);
  const pill = {
    width: itemW,
    transform: [
      { translateX: Animated.add(Animated.multiply(Animated.add(left, right), 0.5), -w / 2) },
      { scaleX: stretch },
      // Thins a little while it's stretched, like a drop in motion.
      { scaleY: stretch.interpolate({ inputRange: [1, 2.2], outputRange: [1, 0.84], extrapolate: 'clamp' }) },
    ],
  };

  return (
    <View style={[styles.wrap, { paddingBottom: Math.max(insets.bottom, 12) }]} pointerEvents="box-none">
      <View style={styles.bar} onLayout={onLayout} accessibilityRole="tablist">
        {BlurView ? (
          <>
            <BlurView intensity={BLUR_INTENSITY} tint="light" style={[StyleSheet.absoluteFill, styles.round]} pointerEvents="none" />
            <View style={[StyleSheet.absoluteFill, styles.round, styles.fill]} pointerEvents="none" />
          </>
        ) : null}
        {itemW ? <Animated.View pointerEvents="none" style={[styles.pill, pill]} /> : null}
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
              onLongPress={() => navigation.emit({ type: 'tabLongPress', target: route.key })}
              style={styles.item}
              accessibilityRole="tab"
              accessibilityLabel={label}
              accessibilityState={{ selected: focused }}
            >
              {({ pressed }) => <TabIcon name={icon} focused={focused} pressed={pressed} reduced={reduced} />}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
};

/** The icon dips when pressed and pops back with a little bounce when it becomes active. */
const TabIcon: React.FC<{
  name: keyof typeof Ionicons.glyphMap;
  focused: boolean;
  pressed: boolean;
  reduced: boolean;
}> = ({ name, focused, pressed, reduced }) => {
  const scale = useRef(new Animated.Value(1)).current;
  const first = useRef(true);

  useEffect(() => {
    if (reduced) return;
    Animated.spring(scale, { toValue: pressed ? 0.86 : 1, stiffness: 520, damping: 22, mass: 0.8, useNativeDriver: true }).start();
  }, [pressed, reduced, scale]);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (!focused || reduced) return;
    scale.setValue(0.8);
    Animated.spring(scale, { toValue: 1, stiffness: 300, damping: 10, mass: 0.7, useNativeDriver: true }).start();
  }, [focused, reduced, scale]);

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Ionicons name={name} size={22} color={focused ? ACTIVE : G.muted} />
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 16 },
  bar: {
    flexDirection: 'row',
    gap: GAP,
    height: 64,
    padding: PAD,
    borderRadius: 32,
    // Spec fill is #FFF 56% over a blur. Without the blur (older builds), content scrolling
    // underneath would read through, so stay near-opaque until the blur is there.
    backgroundColor: BlurView ? 'transparent' : 'rgba(255,255,255,0.92)',
    borderWidth: BORDER,
    borderColor: G.cardBorder,
    shadowColor: '#141C3C',
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  round: { borderRadius: 31, overflow: 'hidden' },
  fill: { backgroundColor: G.card },
  pill: {
    position: 'absolute',
    top: PAD,
    bottom: PAD,
    left: PAD,
    borderRadius: 26,
    backgroundColor: G.blueTint,
  },
  item: { flex: 1, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
});
