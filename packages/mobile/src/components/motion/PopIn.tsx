import React, { useEffect, useRef } from 'react';
import { Animated, ViewStyle } from 'react-native';
import { duration, easing } from './tokens';
import { useReducedMotion } from './useReducedMotion';

interface PopInProps {
  children: React.ReactNode;
  delay?: number;
  style?: ViewStyle;
  /** 'scale' grows from small; 'right' slides in from the right. */
  from?: 'scale' | 'right';
}

/** Entrance for celebrations (scale) and step changes inside a sheet (slide from right). */
export const PopIn: React.FC<PopInProps> = ({ children, delay = 0, style, from = 'scale' }) => {
  const v = useRef(new Animated.Value(0)).current;
  const reduced = useReducedMotion();

  useEffect(() => {
    const anim =
      from === 'scale' && !reduced
        ? Animated.spring(v, { toValue: 1, delay, useNativeDriver: true, speed: 12, bounciness: 10 })
        : Animated.timing(v, {
            toValue: 1,
            delay,
            duration: reduced ? duration.fast : duration.normal,
            easing: easing.enter,
            useNativeDriver: true,
          });
    anim.start();
  }, [v, delay, from, reduced]);

  const transform = reduced
    ? []
    : from === 'scale'
      ? [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) }]
      : [{ translateX: v.interpolate({ inputRange: [0, 1], outputRange: [40, 0] }) }];

  return <Animated.View style={[style, { opacity: v, transform }]}>{children}</Animated.View>;
};
