import React from 'react';
import { Text, TextInput } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useFonts } from 'expo-font';
import { RootNavigator } from './src/navigation';
import { ErrorBoundary, Toast } from './src/components';
import { OfflineOverlay } from './src/components/states';
import { AppGates } from './src/screens/buyer/GateScreens';
import { Sentry } from './src/config/sentry';

function App() {
  // Satoshi throughout (docs/DESIGN_GUIDE.md): Regular to read, Medium for anything you scan.
  const [fontsLoaded] = useFonts({
    'Satoshi-Regular': require('./assets/fonts/Satoshi-Regular.ttf'),
    'Satoshi-Medium': require('./assets/fonts/Satoshi-Medium.ttf'),
  });

  if (!fontsLoaded) {
    return null;
  }

  const defaultText = Text as typeof Text & {
    defaultProps?: { style?: unknown };
  };
  defaultText.defaultProps = defaultText.defaultProps || {};
  defaultText.defaultProps.style = [
    { fontFamily: 'Satoshi-Regular' },
    defaultText.defaultProps.style,
  ];

  const defaultTextInput = TextInput as typeof TextInput & {
    defaultProps?: { style?: unknown };
  };
  defaultTextInput.defaultProps = defaultTextInput.defaultProps || {};
  defaultTextInput.defaultProps.style = [
    { fontFamily: 'Satoshi-Regular' },
    defaultTextInput.defaultProps.style,
  ];

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar style="auto" />
        <ErrorBoundary>
          <RootNavigator />
        </ErrorBoundary>
        {/* "Time to update" (whole app) and maintenance (buyer app) cover everything underneath. */}
        <AppGates />
        <OfflineOverlay />
        <Toast />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

export default Sentry.wrap(App);
