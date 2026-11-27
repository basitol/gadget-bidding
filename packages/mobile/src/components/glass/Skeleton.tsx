import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { Animated, DimensionValue, Easing, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { GlassCard } from './index';
import { useReducedMotion } from '../motion/useReducedMotion';

/**
 * Loading skeletons for the glass screens. Every bone in a group shares one clock, so a soft
 * band of light sweeps across them together (1.3s, short pause, repeat). With "reduce motion"
 * on the bones stay still.
 */
const Shimmer = createContext<Animated.Value | null>(null);

export const SkeletonGroup: React.FC<{ children: React.ReactNode; style?: StyleProp<ViewStyle> }> = ({ children, style }) => {
  const reduced = useReducedMotion();
  const t = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reduced) return;
    t.setValue(0);
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(t, { toValue: 1, duration: 1300, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.delay(300),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [reduced, t]);

  return (
    <Shimmer.Provider value={reduced ? null : t}>
      <View style={style} accessible accessibilityRole="progressbar" accessibilityLabel="Loading">
        <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
          {children}
        </View>
      </View>
    </Shimmer.Provider>
  );
};

type BoneProps = {
  w?: DimensionValue;
  h: number;
  r?: number;
  /** "card" for bones inside a glass card (a touch darker so they read on white). */
  tone?: 'bg' | 'card';
  style?: StyleProp<ViewStyle>;
};

export const Bone: React.FC<BoneProps> = ({ w = '100%', h, r = 10, tone = 'bg', style }) => {
  const t = useContext(Shimmer);
  const [width, setWidth] = useState(0);
  return (
    <View
      onLayout={e => setWidth(e.nativeEvent.layout.width)}
      style={[styles.bone, { width: w, height: h, borderRadius: r }, tone === 'card' ? styles.inCard : styles.onBg, style]}
    >
      {t && width ? (
        <Animated.View
          style={[
            styles.band,
            {
              width: Math.max(width * 0.6, 60),
              transform: [{ translateX: t.interpolate({ inputRange: [0, 1], outputRange: [-width * 0.6, width * 1.1] }) }],
            },
          ]}
        >
          <LinearGradient
            colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.7)', 'rgba(255,255,255,0)']}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
      ) : null}
    </View>
  );
};

/** A list row: thumbnail, three lines and a price on the right (My bids, Live now, Orders). */
export const SkeletonRow: React.FC = () => (
  <GlassCard style={styles.rowCard}>
    <View style={styles.row}>
      <Bone w={60} h={60} r={12} tone="card" />
      <View style={styles.rowBody}>
        <Bone w="70%" h={14} r={7} tone="card" />
        <Bone w="45%" h={12} r={6} tone="card" />
        <Bone w={64} h={20} r={10} tone="card" />
      </View>
      <Bone w={72} h={16} r={8} tone="card" />
    </View>
  </GlassCard>
);

/** Home while the first auctions load. */
export const HomeSkeleton: React.FC = () => (
  <SkeletonGroup>
    <View style={styles.spread}>
      <Bone w={128} h={28} r={14} />
      <View style={styles.inline}>
        <Bone w={40} h={40} r={12} />
        <Bone w={40} h={40} r={12} />
      </View>
    </View>
    <Bone w="82%" h={26} r={10} style={styles.mt20} />
    <Bone w="58%" h={26} r={10} style={styles.mt8} />
    <Bone h={48} r={14} style={styles.mt16} />
    <View style={[styles.inline, styles.mt14]}>
      {[78, 84, 70, 88].map((w, i) => (
        <Bone key={i} w={w} h={34} r={10} />
      ))}
    </View>
    <Bone h={52} r={16} style={styles.mt14} />
    <Bone h={300} r={22} style={styles.mt14} />
    <Bone h={86} r={18} style={styles.mt14} />
    <View style={[styles.list, styles.mt16]}>
      <SkeletonRow />
      <SkeletonRow />
    </View>
  </SkeletonGroup>
);

/** Auction detail while it loads: photo, title, chips, price card, seller card, description. */
export const AuctionDetailSkeleton: React.FC = () => (
  <SkeletonGroup>
    <Bone h={320} r={24} />
    <Bone w="74%" h={28} r={12} style={styles.mt20} />
    <View style={[styles.inline, styles.mt16]}>
      <Bone w={112} h={32} r={12} />
      <Bone w={104} h={32} r={12} />
      <Bone w={92} h={32} r={12} />
    </View>
    <GlassCard style={[styles.cardPad, styles.mt16]}>
      <View style={styles.inline}>
        <View style={[styles.flex, styles.stack]}>
          <Bone w="70%" h={12} r={6} tone="card" />
          <Bone w="90%" h={26} r={10} tone="card" />
        </View>
        <View style={[styles.flex, styles.stack]}>
          <Bone w="60%" h={12} r={6} tone="card" />
          <Bone w="80%" h={26} r={10} tone="card" />
        </View>
      </View>
    </GlassCard>
    <GlassCard style={[styles.cardPad, styles.mt14]}>
      <View style={styles.row}>
        <Bone w={48} h={48} r={14} tone="card" />
        <View style={styles.rowBody}>
          <Bone w="55%" h={14} r={7} tone="card" />
          <Bone w="85%" h={12} r={6} tone="card" />
        </View>
      </View>
    </GlassCard>
    <View style={[styles.stackLoose, styles.mt20]}>
      <Bone h={14} r={7} />
      <Bone h={14} r={7} />
      <Bone w="70%" h={14} r={7} />
    </View>
  </SkeletonGroup>
);

/** The footer buttons on auction detail while it loads. */
export const FooterSkeleton: React.FC = () => (
  <SkeletonGroup style={styles.inline}>
    <Bone h={50} r={14} tone="card" style={styles.flexSmall} />
    <Bone h={50} r={14} tone="card" style={styles.flex} />
  </SkeletonGroup>
);

/** My bids: the tab pills (first load only) and four rows. */
export const BidsSkeleton: React.FC<{ tabs?: boolean }> = ({ tabs }) => (
  <SkeletonGroup>
    {tabs ? (
      <View style={[styles.inline, styles.mb14]}>
        <Bone w={104} h={40} r={12} />
        <Bone w={88} h={40} r={12} />
        <Bone w={88} h={40} r={12} />
      </View>
    ) : null}
    <View style={styles.list}>
      <SkeletonRow />
      <SkeletonRow />
      <SkeletonRow />
      <SkeletonRow />
    </View>
  </SkeletonGroup>
);

const styles = StyleSheet.create({
  bone: { overflow: 'hidden' },
  onBg: { backgroundColor: 'rgba(255,255,255,0.55)' },
  inCard: { backgroundColor: 'rgba(28,31,42,0.05)' },
  band: { position: 'absolute', top: 0, bottom: 0, left: 0 },

  flex: { flex: 1 },
  flexSmall: { flex: 0.6 },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  spread: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  list: { gap: 10 },
  stack: { gap: 8 },
  stackLoose: { gap: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  rowBody: { flex: 1, gap: 7 },
  rowCard: { padding: 10 },
  cardPad: { padding: 16 },

  mt8: { marginTop: 8 },
  mt14: { marginTop: 14 },
  mt16: { marginTop: 16 },
  mt20: { marginTop: 20 },
  mb14: { marginBottom: 14 },
});
