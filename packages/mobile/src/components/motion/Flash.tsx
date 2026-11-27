import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet } from 'react-native';
import { duration, easing } from './tokens';

interface FlashProps {
  /** Change this value to fire the flash (e.g. a counter or the new price). */
  trigger: unknown;
  color: string;
  /** Peak opacity of the tint. */
  intensity?: number;
  borderRadius?: number;
}

/** A tint that washes over its parent and fades out. Parent needs overflow hidden or matching radius. */
export const Flash: React.FC<FlashProps> = ({ trigger, color, intensity = 0.22, borderRadius = 0 }) => {
  const opacity = useRef(new Animated.Value(0)).current;
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    opacity.setValue(intensity);
    Animated.timing(opacity, {
      toValue: 0,
      duration: duration.slow * 2,
      easing: easing.exit,
      useNativeDriver: true,
    }).start();
  }, [trigger, intensity, opacity]);

  return (
    <Animated.View
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, { backgroundColor: color, opacity, borderRadius }]}
    />
  );
};
