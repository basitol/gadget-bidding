import React, { useEffect, useRef, useState } from 'react';
import { Animated, View, Text, StyleSheet } from 'react-native';
import { colors, fonts, borderRadius, spacing } from '../constants';
import { getCountdownParts } from '../utils';
import { duration, easing, useReducedMotion } from './motion';

interface CountdownTimerProps {
  endTime: string;
  onEnd?: () => void;
  size?: 'sm' | 'md' | 'lg';
}

/**
 * Motion (design guide):
 * - turns orange under 1 minute
 * - pulses gently under 10 seconds
 * - shows a "+N min" bump when anti-snipe pushes the end time back
 */
export const CountdownTimer: React.FC<CountdownTimerProps> = ({
  endTime,
  onEnd,
  size = 'md',
}) => {
  const [parts, setParts] = useState(getCountdownParts(endTime));
  const reduced = useReducedMotion();
  const pulse = useRef(new Animated.Value(1)).current;
  const pulseLoop = useRef<Animated.CompositeAnimation | null>(null);
  const bump = useRef(new Animated.Value(0)).current;
  const [bumpLabel, setBumpLabel] = useState<string | null>(null);
  const prevEnd = useRef(endTime);

  useEffect(() => {
    setParts(getCountdownParts(endTime));
    const timer = setInterval(() => {
      const newParts = getCountdownParts(endTime);
      setParts(newParts);

      if (newParts.isEnded && onEnd) {
        onEnd();
        clearInterval(timer);
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [endTime, onEnd]);

  // Anti-snipe extension → "+N min" bump
  useEffect(() => {
    const before = new Date(prevEnd.current).getTime();
    const after = new Date(endTime).getTime();
    prevEnd.current = endTime;
    if (!(after > before)) return;

    const mins = Math.max(1, Math.round((after - before) / 60000));
    setBumpLabel(`+${mins} min`);
    bump.setValue(0);
    Animated.sequence([
      Animated.spring(bump, { toValue: 1, useNativeDriver: true, speed: 14, bounciness: 10 }),
      Animated.delay(1400),
      Animated.timing(bump, { toValue: 2, duration: duration.normal, easing: easing.exit, useNativeDriver: true }),
    ]).start(() => setBumpLabel(null));
  }, [endTime, bump]);

  const totalSeconds =
    parts.days * 86400 + parts.hours * 3600 + parts.minutes * 60 + parts.seconds;
  const isUrgent = !parts.isEnded && totalSeconds < 60;
  const isCritical = !parts.isEnded && totalSeconds <= 10;

  // Gentle pulse in the last 10 seconds
  useEffect(() => {
    if (isCritical && !reduced) {
      pulseLoop.current = Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, { toValue: 1.06, duration: duration.slow, easing: easing.enter, useNativeDriver: true }),
          Animated.timing(pulse, { toValue: 1, duration: duration.slow, easing: easing.exit, useNativeDriver: true }),
        ])
      );
      pulseLoop.current.start();
    } else {
      pulseLoop.current?.stop();
      pulse.setValue(1);
    }
    return () => pulseLoop.current?.stop();
  }, [isCritical, reduced, pulse]);

  const getBoxSize = () => {
    switch (size) {
      case 'sm':
        return { width: 40, height: 40 };
      case 'lg':
        return { width: 70, height: 70 };
      default:
        return { width: 55, height: 55 };
    }
  };

  const getFontSize = () => {
    switch (size) {
      case 'sm':
        return fonts.sizes.md;
      case 'lg':
        return fonts.sizes.xxl;
      default:
        return fonts.sizes.xl;
    }
  };

  const getLabelSize = () => {
    switch (size) {
      case 'sm':
        return fonts.sizes.xs;
      case 'lg':
        return fonts.sizes.sm;
      default:
        return fonts.sizes.xs;
    }
  };

  if (parts.isEnded) {
    return (
      <View style={styles.endedContainer}>
        <Text style={[styles.endedText, { fontSize: getFontSize() }]}>
          Auction Ended
        </Text>
      </View>
    );
  }

  const TimeBox = ({ value, label }: { value: number; label: string }) => (
    <View style={styles.timeBoxContainer}>
      <View
        style={[
          styles.timeBox,
          getBoxSize(),
          isUrgent ? styles.urgentBox : undefined,
        ]}
      >
        <Text
          style={[
            styles.timeValue,
            { fontSize: getFontSize() },
            isUrgent ? styles.urgentText : undefined,
          ]}
        >
          {value.toString().padStart(2, '0')}
        </Text>
      </View>
      <Text style={[styles.timeLabel, { fontSize: getLabelSize() }]}>
        {label}
      </Text>
    </View>
  );

  const Separator = () => (
    <Text
      style={[
        styles.separator,
        { fontSize: getFontSize() },
        isUrgent ? styles.urgentText : undefined,
      ]}
    >
      :
    </Text>
  );

  return (
    <View>
      <Animated.View
        style={[styles.container, { transform: [{ scale: pulse }] }]}
        accessibilityRole="timer"
        accessibilityLabel={
          isUrgent ? `Ending soon, ${totalSeconds} seconds left` : undefined
        }
      >
        {parts.days > 0 && (
          <>
            <TimeBox value={parts.days} label="Days" />
            <Separator />
          </>
        )}
        <TimeBox value={parts.hours} label="Hours" />
        <Separator />
        <TimeBox value={parts.minutes} label="Mins" />
        <Separator />
        <TimeBox value={parts.seconds} label="Secs" />
      </Animated.View>

      {bumpLabel && (
        <Animated.View
          pointerEvents="none"
          accessibilityLiveRegion="polite"
          style={[
            styles.bump,
            {
              opacity: bump.interpolate({ inputRange: [0, 0.3, 1, 2], outputRange: [0, 1, 1, 0] }),
              transform: [
                {
                  translateY: bump.interpolate({
                    inputRange: [0, 1, 2],
                    outputRange: reduced ? [0, 0, 0] : [8, -6, -18],
                  }),
                },
                {
                  scale: bump.interpolate({
                    inputRange: [0, 1, 2],
                    outputRange: reduced ? [1, 1, 1] : [0.7, 1, 1],
                  }),
                },
              ],
            },
          ]}
        >
          <Text style={styles.bumpText}>{bumpLabel}</Text>
        </Animated.View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  timeBoxContainer: {
    alignItems: 'center',
  },
  timeBox: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  urgentBox: {
    backgroundColor: colors.warning + '20',
    borderColor: colors.warning,
  },
  timeValue: {
    color: colors.text,
    fontWeight: '700',
  },
  urgentText: {
    color: colors.warning,
  },
  timeLabel: {
    color: colors.textSecondary,
    marginTop: spacing.xs,
    textTransform: 'uppercase',
  },
  separator: {
    color: colors.textMuted,
    fontWeight: '700',
    marginHorizontal: spacing.xs,
    marginBottom: spacing.lg,
  },
  endedContainer: {
    padding: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
  },
  endedText: {
    color: colors.error,
    fontWeight: '700',
  },
  bump: {
    position: 'absolute',
    top: -14,
    right: -4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.full,
    backgroundColor: colors.warning + '22',
    borderWidth: 1,
    borderColor: colors.warning,
  },
  bumpText: {
    color: colors.warning,
    fontSize: fonts.sizes.xs,
    fontFamily: fonts.bold,
  },
});
