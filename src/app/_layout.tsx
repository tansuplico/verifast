import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useColorScheme } from "react-native";

import { AnimatedSplashOverlay } from "@/components/animated-icon";
import { AuthProvider, useAuth } from "@/providers/auth-provider";

SplashScreen.preventAutoHideAsync();

export const unstable_settings = {
  initialRouteName: "(auth)",
};

export default function RootLayout() {
  const colorScheme = useColorScheme();
  return (
    <AuthProvider>
      <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
        <AnimatedSplashOverlay />
        <RootNavigator />
      </ThemeProvider>
    </AuthProvider>
  );
}

function RootNavigator() {
  const { session, isLoading, isPasswordRecovery } = useAuth();

  if (isLoading) {
    return null;
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={!session}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>

      {/* A PASSWORD_RECOVERY session is still a real session, so this guard
          has to come before the normal "signed in" branch and exclude it -
          otherwise a user tapping a reset link would land straight in the
          app instead of the "set new password" screen. */}
      <Stack.Protected guard={!!session && isPasswordRecovery}>
        <Stack.Screen name="reset-password" />
      </Stack.Protected>

      <Stack.Protected guard={!!session && !isPasswordRecovery}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="subscription"
          options={{
            presentation: "modal",
            headerShown: true,
            title: "Subscription",
          }}
        />
      </Stack.Protected>
    </Stack>
  );
}
