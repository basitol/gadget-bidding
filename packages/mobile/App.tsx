import React from 'react';
import { Text, TextInput } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useFonts } from 'expo-font';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  Inter_800ExtraBold,
} from '@expo-google-fonts/inter';
import { RootNavigator } from './src/navigation';
import { Toast } from './src/components';

export default function App() {
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Inter_800ExtraBold,
  });

  if (!fontsLoaded) {
    return null;
  }

  const defaultText = Text as typeof Text & {
    defaultProps?: { style?: unknown };
  };
  defaultText.defaultProps = defaultText.defaultProps || {};
  defaultText.defaultProps.style = [
    { fontFamily: 'Inter_400Regular' },
    defaultText.defaultProps.style,
  ];

  const defaultTextInput = TextInput as typeof TextInput & {
    defaultProps?: { style?: unknown };
  };
  defaultTextInput.defaultProps = defaultTextInput.defaultProps || {};
  defaultTextInput.defaultProps.style = [
    { fontFamily: 'Inter_400Regular' },
    defaultTextInput.defaultProps.style,
  ];

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar style="auto" />
        <RootNavigator />
        <Toast />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
