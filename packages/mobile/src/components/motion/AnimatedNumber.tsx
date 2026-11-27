import React, { useEffect, useRef, useState } from 'react';
import { Animated, Text, TextProps } from 'react-native';
import { duration, easing } from './tokens';
import { useReducedMotion } from './useReducedMotion';

interface AnimatedNumberProps extends TextProps {
  value: number;
  format: (n: number) => string;
}

/** Text that ticks from the previous value to the new one (new bid price). */
export const AnimatedNumber: React.FC<AnimatedNumberProps> = ({ value, format, ...textProps }) => {
  const anim = useRef(new Animated.Value(value)).current;
  const [shown, setShown] = useState(value);
  const reduced = useReducedMotion();

  useEffect(() => {
    const id = anim.addListener(({ value: v }) => setShown(Math.round(v)));
    return () => anim.removeListener(id);
  }, [anim]);

  useEffect(() => {
    if (reduced) {
      anim.setValue(value);
      return;
    }
    Animated.timing(anim, {
      toValue: value,
      duration: duration.slow,
      easing: easing.enter,
      useNativeDriver: false,
    }).start();
  }, [value, reduced, anim]);

  return <Text {...textProps}>{format(shown)}</Text>;
};
