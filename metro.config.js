const { getSentryExpoConfig } = require("@sentry/react-native/metro");

// Replaces the plain expo/metro-config default so every JS bundle gets a
// Sentry debug ID baked in — that's what lets a stack trace in the Sentry
// dashboard map back to real source lines instead of minified output.
const config = getSentryExpoConfig(__dirname);

module.exports = config;
