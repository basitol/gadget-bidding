import { useCallback, useRef } from 'react';
import { Animated } from 'react-native';
import { useReducedMotion } from './useReducedMotion';

/** Short horizontal shake — outbid, wrong code. Returns a transform style and a trigger. */
export function useShake(distance = 8) {
  const x = useRef(new Animated.Value(0)).current;
  const reduced = useReducedMotion();

  const shake = useCallback(() => {
    if (reduced) return;
    x.setValue(0);
    const step = (to: number) => Animated.timing(x, { toValue: to, duration: 50, useNativeDriver: true });
    Animated.sequence([
      step(distance),
      step(-distance),
      step(distance * 0.6),
      step(-distance * 0.6),
      step(distance * 0.3),
      step(0),
    ]).start();
  }, [distance, reduced, x]);

  return { shakeStyle: { transform: [{ translateX: x }] }, shake };
}
