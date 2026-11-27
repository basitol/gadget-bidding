import React, { useEffect, useRef } from 'react';
import { Animated } from 'react-native';
import { duration, easing } from './tokens';

interface DrawCheckProps {
  size?: number;
  color: string;
  background: string;
  onDone?: () => void;
}

/** A check mark that draws itself: circle pops in, then the short stroke, then the long stroke. */
export const DrawCheck: React.FC<DrawCheckProps> = ({ size = 72, color, background, onDone }) => {
  const circle = useRef(new Animated.Value(0)).current;
  const short = useRef(new Animated.Value(0)).current;
  const long = useRef(new Animated.Value(0)).current;
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    Animated.sequence([
      Animated.spring(circle, { toValue: 1, useNativeDriver: true, speed: 18, bounciness: 8 }),
      Animated.timing(short, { toValue: 1, duration: duration.fast, easing: easing.enter, useNativeDriver: true }),
      Animated.timing(long, { toValue: 1, duration: duration.normal, easing: easing.enter, useNativeDriver: true }),
    ]).start(() => onDoneRef.current?.());
  }, [circle, short, long]);

  const s = size;
  const stroke = Math.max(4, Math.round(s / 14));
  // Check path: A(0.28,0.52) → B(0.43,0.67) → C(0.74,0.34), in units of size.
  const A = { x: 0.28 * s, y: 0.52 * s };
  const B = { x: 0.43 * s, y: 0.67 * s };
  const C = { x: 0.74 * s, y: 0.34 * s };
  const seg = (p: { x: number; y: number }, q: { x: number; y: number }) => ({
    len: Math.hypot(q.x - p.x, q.y - p.y) + stroke / 2,
    angle: `${(Math.atan2(q.y - p.y, q.x - p.x) * 180) / Math.PI}deg`,
  });
  const ab = seg(A, B);
  const bc = seg(B, C);

  // Each stroke grows from its start point along its own direction.
  const strokeStyle = (p: { x: number; y: number }, sg: { len: number; angle: string }, v: Animated.Value) => ({
    position: 'absolute' as const,
    left: p.x - stroke / 2,
    top: p.y - stroke / 2,
    width: sg.len,
    height: stroke,
    borderRadius: stroke / 2,
    backgroundColor: color,
    transformOrigin: [stroke / 2, stroke / 2, 0],
    transform: [{ rotate: sg.angle }, { scaleX: v }],
  });

  return (
    <Animated.View
      style={{
        width: s,
        height: s,
        borderRadius: s / 2,
        backgroundColor: background,
        transform: [{ scale: circle }],
      }}
      accessibilityRole="image"
      accessibilityLabel="Done"
    >
      <Animated.View style={strokeStyle(A, ab, short)} />
      <Animated.View style={strokeStyle(B, bc, long)} />
    </Animated.View>
  );
};
