import * as Sentry from "@sentry/react-native";

const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;

if (!dsn) {
  console.warn(
    "[sentry] EXPO_PUBLIC_SENTRY_DSN is not set — crash reporting is disabled. Add it to .env once you have a Sentry project (sentry.io).",
  );
}

Sentry.init({
  dsn,
  enabled: Boolean(dsn) && !__DEV__,
  debug: __DEV__,
  environment: __DEV__ ? "development" : "production",
  // Deliberately minimal: no tracing, profiling, or session replay
  // integrations. This is crash/error visibility only, which keeps event
  // volume well inside Sentry's free tier (5k events/month) and avoids
  // collecting extra device/session data beyond what an error needs.
  sendDefaultPii: false,
});
