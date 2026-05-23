import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, fonts, borderRadius, spacing } from '../constants';
import { getCountdownParts } from '../utils';

interface CountdownTimerProps {
  endTime: string;
  onEnd?: () => void;
  size?: 'sm' | 'md' | 'lg';
}

export const CountdownTimer: React.FC<CountdownTimerProps> = ({
  endTime,
  onEnd,
  size = 'md',
}) => {
  const [parts, setParts] = useState(getCountdownParts(endTime));

  useEffect(() => {
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

  const isUrgent = parts.days === 0 && parts.hours === 0 && parts.minutes < 5;

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
    <Text style={[styles.separator, { fontSize: getFontSize() }]}>:</Text>
  );

  return (
    <View style={styles.container}>
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
    backgroundColor: colors.error + '20',
    borderColor: colors.error,
  },
  timeValue: {
    color: colors.text,
    fontWeight: '700',
  },
  urgentText: {
    color: colors.error,
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
});
