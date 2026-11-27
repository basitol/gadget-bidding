import { useEffect, useMemo } from 'react';
import { Animated } from 'react-native';
import { duration, easing } from './tokens';
import { useReducedMotion } from './useReducedMotion';

/**
 * Fills progress steps one after another (dot, then the line to the next step).
 * Returns per-step values for the dot and the connector line, each 0 → 1.
 */
export function useSequentialFill(done: boolean[]) {
  const reduced = useReducedMotion();
  const key = done.map(d => (d ? 1 : 0)).join('');
  const values = useMemo(
    () => done.map(() => ({ dot: new Animated.Value(0), line: new Animated.Value(0) })),
    [done.length]
  );

  useEffect(() => {
    const steps: Animated.CompositeAnimation[] = [];
    done.forEach((d, i) => {
      if (!d) return;
      const t = (v: Animated.Value, ms: number) =>
        Animated.timing(v, { toValue: 1, duration: reduced ? 0 : ms, easing: easing.enter, useNativeDriver: true });
      steps.push(t(values[i].dot, duration.fast));
      if (i < done.length - 1) steps.push(t(values[i].line, duration.normal));
    });
    values.forEach(v => {
      v.dot.setValue(0);
      v.line.setValue(0);
    });
    const anim = Animated.sequence(steps);
    anim.start();
    return () => anim.stop();
  }, [key, reduced]);

  return values;
}
