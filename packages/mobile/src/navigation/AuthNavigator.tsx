import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import {
  SplashScreen,
  LoginScreen,
  RegisterScreen,
  OtpVerificationScreen,
} from '../screens/auth';
import { PolicyScreen } from '../screens/profile';
import { AppInterfaceType } from '../utils/roles';

export type AuthStackParamList = {
  Splash: undefined;
  Login: { interfaceType: AppInterfaceType };
  Register: { interfaceType: AppInterfaceType };
  OtpVerification: {
    phone_number: string;
    verification_id: string;
    isNewUser: boolean;
    interfaceType: AppInterfaceType;
  };
  Policy: undefined;
};

const Stack = createNativeStackNavigator<AuthStackParamList>();

export const AuthNavigator: React.FC = () => {
  return (
    <Stack.Navigator
      initialRouteName="Splash"
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="Splash" component={SplashScreen as any} />
      <Stack.Screen name="Login" component={LoginScreen as any} />
      <Stack.Screen name="Register" component={RegisterScreen as any} />
      <Stack.Screen
        name="OtpVerification"
        component={OtpVerificationScreen as any}
      />
      <Stack.Screen name="Policy" component={PolicyScreen as any} />
    </Stack.Navigator>
  );
};
