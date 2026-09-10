import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useColorScheme } from "react-native";

import { AnimatedSplashOverlay } from "@/components/animated-icon";
import { AuthProvider, useAuth } from "@/providers/auth-provider";
import { ToastProvider } from "@/providers/toast-provider";

SplashScreen.preventAutoHideAsync();

export const unstable_settings = {
  initialRouteName: "(auth)",
};

export default function RootLayout() {
  const colorScheme = useColorScheme();
  return (
    <AuthProvider>
      <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
        <ToastProvider>
          <AnimatedSplashOverlay />
          <RootNavigator />
        </ToastProvider>
      </ThemeProvider>
    </AuthProvider>
  );
}

function RootNavigator() {
  const { session, isLoading, isPasswordRecovery, needsEmailOtpChallenge } =
    useAuth();

  if (isLoading) {
    return null;
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={!session}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>

      <Stack.Protected guard={!!session && isPasswordRecovery}>
        <Stack.Screen name="reset-password" />
      </Stack.Protected>

      {/* Must come before the tabs guard and exclude it below - a session
          that hasn't cleared its emailed-code challenge yet is not allowed
          into the app, the same way a recovery session isn't. */}
      <Stack.Protected
        guard={!!session && !isPasswordRecovery && needsEmailOtpChallenge}
      >
        <Stack.Screen name="mfa-challenge" />
      </Stack.Protected>

      <Stack.Protected
        guard={!!session && !isPasswordRecovery && !needsEmailOtpChallenge}
      >
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="subscription"
          options={{
            presentation: "modal",
            headerShown: false,
          }}
        />
      </Stack.Protected>
    </Stack>
  );
}
