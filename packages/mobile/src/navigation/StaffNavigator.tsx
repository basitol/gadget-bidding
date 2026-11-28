import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { OfflineOverlay } from '../components/states';
import { StaffHomeScreen } from '../screens/sell/staff/StaffHomeScreen';

const Stack = createNativeStackNavigator();

/** Store staff accounts: one screen with their hub code, drop-offs and collections. */
export const StaffNavigator: React.FC = () => (
  <>
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="StaffHome" component={StaffHomeScreen as any} />
    </Stack.Navigator>
    <OfflineOverlay />
  </>
);
