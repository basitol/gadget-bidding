import React, { useEffect, useRef } from 'react';
import { Animated, ViewStyle, Easing } from 'react-native';

interface FadeInViewProps {
  children: React.ReactNode;
  /** Stagger delay in ms — pass index * step for list items. */
  delay?: number;
  /** Vertical travel distance in px. */
  offset?: number;
  duration?: number;
  style?: ViewStyle;
}

/** Fades + slides content in on mount for a polished entrance. */
export const FadeInView: React.FC<FadeInViewProps> = ({
  children,
  delay = 0,
  offset = 12,
  duration = 380,
  style,
}) => {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(progress, {
      toValue: 1,
      duration,
      delay,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [progress, delay, duration]);

  return (
    <Animated.View
      style={[
        {
          opacity: progress,
          transform: [
            {
              translateY: progress.interpolate({
                inputRange: [0, 1],
                outputRange: [offset, 0],
              }),
            },
          ],
        },
        style,
      ]}
    >
      {children}
    </Animated.View>
  );
};
