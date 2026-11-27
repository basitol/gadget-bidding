import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import {
  SplashScreen,
  LoginScreen,
  RegisterScreen,
  SignUpScreen,
  SignUpFlowScreen,
  OtpVerificationScreen,
  ResetPasswordScreen,
} from '../screens/auth';
import { PolicyScreen } from '../screens/profile';
import { AppInterfaceType } from '../utils/roles';

export type AuthStackParamList = {
  Splash: undefined;
  Login: { interfaceType: AppInterfaceType; email?: string };
  ResetPassword: { interfaceType: AppInterfaceType; email?: string };
  SignUp: undefined;
  SignUpFlow: undefined;
  Register: { interfaceType: AppInterfaceType };
  OtpVerification: {
    phone_number: string;
    email: string;
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
      <Stack.Screen name="ResetPassword" component={ResetPasswordScreen as any} />
      <Stack.Screen name="SignUp" component={SignUpScreen as any} />
      <Stack.Screen
        name="SignUpFlow"
        component={SignUpFlowScreen as any}
        options={{ gestureEnabled: false }}
      />
      <Stack.Screen name="Register" component={RegisterScreen as any} />
      <Stack.Screen
        name="OtpVerification"
        component={OtpVerificationScreen as any}
      />
      <Stack.Screen name="Policy" component={PolicyScreen as any} />
    </Stack.Navigator>
  );
};
