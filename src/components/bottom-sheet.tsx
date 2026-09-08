import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { Dimensions, Modal, Pressable, StyleSheet, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";

import { Spacing } from "@/constants/theme";

const SCREEN_HEIGHT = Dimensions.get("window").height;

type BottomSheetProps = {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
};

// React Native's built-in <Modal animationType="slide"> slides the backdrop
// and the sheet content up together as one rigid unit - the dim overlay
// snaps to full opacity instantly instead of fading in, which reads as an
// abrupt "pop" rather than a smooth, native-feeling transition. This
// component fixes that by rendering the backdrop (animated opacity) and the
// sheet (animated translateY) as two independent layers, using Reanimated
// instead of the Modal's own animationType.
//
// translateY starts at the full screen height rather than a measured sheet
// height, so the sheet is always guaranteed to start fully off-screen no
// matter its actual (dynamic, content-dependent) height - no onLayout
// measuring step needed.
export function BottomSheet({ visible, onClose, children }: BottomSheetProps) {
  const [isMounted, setIsMounted] = useState(visible);
  const backdropOpacity = useSharedValue(0);
  const translateY = useSharedValue(SCREEN_HEIGHT);

  useEffect(() => {
    if (visible) {
      setIsMounted(true);
      backdropOpacity.value = withTiming(1, { duration: 220 });
      translateY.value = withTiming(0, {
        duration: 280,
        easing: Easing.out(Easing.cubic),
      });
      return;
    }

    // Closing: fade/slide out first, then unmount once the animation has
    // had time to finish. A plain setTimeout (rather than a withTiming
    // completion callback + runOnJS) sidesteps any worklet-callback API
    // churn between Reanimated versions and is simple enough here.
    backdropOpacity.value = withTiming(0, { duration: 180 });
    translateY.value = withTiming(SCREEN_HEIGHT, {
      duration: 220,
      easing: Easing.in(Easing.cubic),
    });
    const timeout = setTimeout(() => setIsMounted(false), 220);
    return () => clearTimeout(timeout);
  }, [visible, backdropOpacity, translateY]);

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
  }));
  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  if (!isMounted) return null;

  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose}>
      <View style={styles.container}>
        <Animated.View style={[styles.backdrop, backdropStyle]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        </Animated.View>

        <Animated.View style={sheetStyle}>
          <SafeAreaView edges={["bottom"]} style={styles.sheet}>
            <View style={styles.grabber} />
            {children}
          </SafeAreaView>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "flex-end" },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  sheet: {
    backgroundColor: "#ffffff",
    borderTopLeftRadius: Spacing.four,
    borderTopRightRadius: Spacing.four,
    padding: Spacing.four,
    gap: Spacing.one,
  },
  grabber: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#e4e5e9",
    alignSelf: "center",
    marginBottom: Spacing.two,
  },
});
