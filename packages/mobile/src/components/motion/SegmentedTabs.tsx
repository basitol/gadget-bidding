import React, { useEffect, useRef, useState } from 'react';
import { Animated, LayoutChangeEvent, Pressable, StyleSheet, Text, View, ViewStyle, TextStyle } from 'react-native';
import { duration, easing } from './tokens';

interface Tab<K extends string> {
  key: K;
  label: string;
}

interface SegmentedTabsProps<K extends string> {
  tabs: Tab<K>[];
  value: K;
  onChange: (key: K) => void;
  /** Container (track) style. */
  style?: ViewStyle;
  /** Moving indicator style (colour, radius). */
  indicatorStyle?: ViewStyle;
  textStyle?: TextStyle;
  activeTextStyle?: TextStyle;
  padding?: number;
}

/** Tabs whose selected indicator slides between options. */
export function SegmentedTabs<K extends string>({
  tabs,
  value,
  onChange,
  style,
  indicatorStyle,
  textStyle,
  activeTextStyle,
  padding = 4,
}: SegmentedTabsProps<K>) {
  const [width, setWidth] = useState(0);
  const index = Math.max(0, tabs.findIndex(t => t.key === value));
  const x = useRef(new Animated.Value(index)).current;
  const tabW = width > 0 ? (width - padding * 2) / tabs.length : 0;

  useEffect(() => {
    Animated.timing(x, { toValue: index, duration: duration.normal, easing: easing.enter, useNativeDriver: true }).start();
  }, [index, x]);

  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);

  return (
    <View style={[styles.track, { padding }, style]} onLayout={onLayout} accessibilityRole="tablist">
      {tabW > 0 && (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.indicator,
            { top: padding, bottom: padding, left: padding, width: tabW },
            indicatorStyle,
            { transform: [{ translateX: x.interpolate({ inputRange: [0, 1], outputRange: [0, tabW] }) }] },
          ]}
        />
      )}
      {tabs.map(t => {
        const active = t.key === value;
        return (
          <Pressable
            key={t.key}
            style={styles.tab}
            onPress={() => onChange(t.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
          >
            <Text style={[textStyle, active ? activeTextStyle : undefined]}>{t.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
  },
  indicator: {
    position: 'absolute',
  },
  tab: {
    flex: 1,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
