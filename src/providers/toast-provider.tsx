import Ionicons from "@expo/vector-icons/Ionicons";
import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Pressable, StyleSheet } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";

import { ThemedText } from "@/components/themed-text";
import { Spacing } from "@/constants/theme";

// First-pass scope is success confirmations only ("Reminder saved", "Document
// deleted", etc.) - deliberately no error variant. Errors still go through
// Alert.alert, since a toast can't interrupt the user while a BottomSheet
// (built on RN's own <Modal>) is still open - a toast rendered here lives in
// the main app tree, which is a separate native layer from any open Modal
// and can't visually stack above it. Only call showToast() after a modal has
// already closed, not while one is still up.
const DISPLAY_DURATION_MS = 2400;
const ANIMATE_IN_MS = 220;
const ANIMATE_OUT_MS = 180;

type ToastContextValue = {
  showToast: (message: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState<string | null>(null);
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(-40);
  const hideTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hide = useCallback(() => {
    opacity.value = withTiming(0, { duration: ANIMATE_OUT_MS });
    translateY.value = withTiming(-40, {
      duration: ANIMATE_OUT_MS,
      easing: Easing.in(Easing.cubic),
    });
    setTimeout(() => setMessage(null), ANIMATE_OUT_MS);
  }, [opacity, translateY]);

  const showToast = useCallback(
    (nextMessage: string) => {
      if (hideTimeout.current) clearTimeout(hideTimeout.current);
      setMessage(nextMessage);
      opacity.value = withTiming(1, { duration: ANIMATE_IN_MS });
      translateY.value = withTiming(0, {
        duration: ANIMATE_IN_MS,
        easing: Easing.out(Easing.cubic),
      });
      hideTimeout.current = setTimeout(hide, DISPLAY_DURATION_MS);
    },
    [opacity, translateY, hide],
  );

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {message && (
        <SafeAreaView
          edges={["top"]}
          pointerEvents="box-none"
          style={styles.overlay}
        >
          <Animated.View style={[styles.toast, animatedStyle]}>
            <Pressable
              style={styles.toastPressable}
              onPress={() => {
                if (hideTimeout.current) clearTimeout(hideTimeout.current);
                hide();
              }}
            >
              <Ionicons name="checkmark-circle" size={18} color="#0d9488" />
              <ThemedText type="small" style={styles.message} numberOfLines={2}>
                {message}
              </ThemedText>
            </Pressable>
          </Animated.View>
        </SafeAreaView>
      )}
    </ToastContext.Provider>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    alignItems: "center",
  },
  toast: {
    marginTop: Spacing.two,
    maxWidth: "90%",
    backgroundColor: "#1a1c20",
    borderRadius: Spacing.three,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  toastPressable: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two + 2,
  },
  message: { color: "#ffffff", flexShrink: 1 },
});
