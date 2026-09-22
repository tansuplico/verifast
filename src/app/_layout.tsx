import "@/lib/sentry"; // side-effect import — runs Sentry.init() before anything else

import * as Sentry from "@sentry/react-native";
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import { useColorScheme } from "react-native";

import { AnimatedSplashOverlay } from "@/components/animated-icon";
import { CrashBoundary } from "@/components/crash-boundary";
import { reconcileReminderNotifications } from "@/hooks/use-push-notifications-toggle";
import { configureNotificationHandler } from "@/lib/notifications";
import { AlertProvider } from "@/providers/alert-provider";
import { AuthProvider, useAuth } from "@/providers/auth-provider";
import { ToastProvider } from "@/providers/toast-provider";

SplashScreen.preventAutoHideAsync();

// Must run at module load, before any notification can arrive - the handler
// applies globally and decides whether foreground notifications are shown.
configureNotificationHandler();

export const unstable_settings = {
  initialRouteName: "(auth)",
};

function RootLayout() {
  const colorScheme = useColorScheme();
  return (
    <CrashBoundary>
      <AuthProvider>
        <ThemeProvider
          value={colorScheme === "dark" ? DarkTheme : DefaultTheme}
        >
          <ToastProvider>
            <AlertProvider>
              <AnimatedSplashOverlay />
              <RootNavigator />
            </AlertProvider>
          </ToastProvider>
        </ThemeProvider>
      </AuthProvider>
    </CrashBoundary>
  );
}

export default Sentry.wrap(RootLayout);

function RootNavigator() {
  const { session, isLoading, isPasswordRecovery, needsEmailOtpChallenge } =
    useAuth();

  const isFullyAuthenticated =
    !!session && !isPasswordRecovery && !needsEmailOtpChallenge;

  // Runs once per sign-in / app launch while fully authenticated - the same
  // condition that gates the (tabs) stack below. Makes sure this device's
  // scheduled notifications catch up with anything that changed elsewhere
  // (a reminder added on another device, one edited while push was off,
  // etc.) without waiting for the user to happen to touch the toggle
  // again. Silently a no-op if the toggle is off or permission was never
  // granted - see reconcileReminderNotifications.
  useEffect(() => {
    if (!isFullyAuthenticated || !session) return;
    reconcileReminderNotifications(session.user.id);
  }, [isFullyAuthenticated, session]);

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

      <Stack.Protected guard={isFullyAuthenticated}>
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
