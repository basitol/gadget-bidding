import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { useReducedMotion } from './useReducedMotion';

interface ConfettiProps {
  /** Burst colours. */
  colors: string[];
  count?: number;
  onDone?: () => void;
}

/** A small one-shot confetti burst from the centre of its parent. Skipped with reduce motion. */
export const Confetti: React.FC<ConfettiProps> = ({ colors, count = 28, onDone }) => {
  const reduced = useReducedMotion();
  const progress = useRef(new Animated.Value(0)).current;
  const pieces = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => {
        const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.5;
        const dist = 90 + Math.random() * 90;
        return {
          dx: Math.cos(angle) * dist,
          dy: Math.sin(angle) * dist - 40,
          fall: 120 + Math.random() * 80,
          spin: `${(Math.random() > 0.5 ? 1 : -1) * (360 + Math.random() * 360)}deg`,
          color: colors[i % colors.length],
          w: 6 + Math.random() * 4,
          h: 10 + Math.random() * 6,
        };
      }),
    [colors, count]
  );

  useEffect(() => {
    if (reduced) {
      onDone?.();
      return;
    }
    Animated.timing(progress, {
      toValue: 1,
      duration: 1400,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start(() => onDone?.());
  }, [reduced]);

  if (reduced) return null;

  return (
    <View pointerEvents="none" style={styles.layer}>
      {pieces.map((p, i) => (
        <Animated.View
          key={i}
          style={{
            position: 'absolute',
            width: p.w,
            height: p.h,
            borderRadius: 2,
            backgroundColor: p.color,
            opacity: progress.interpolate({ inputRange: [0, 0.75, 1], outputRange: [1, 1, 0] }),
            transform: [
              { translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [0, p.dx] }) },
              {
                translateY: progress.interpolate({
                  inputRange: [0, 0.35, 1],
                  outputRange: [0, p.dy, p.dy + p.fall],
                }),
              },
              { rotate: progress.interpolate({ inputRange: [0, 1], outputRange: ['0deg', p.spin] }) },
            ],
          }}
        />
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  layer: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
