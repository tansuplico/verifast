import { useEffect } from "react";
import { StyleSheet, type ViewStyle } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

type SkeletonBlockProps = {
  width: ViewStyle["width"];
  height: number;
  radius?: number;
  style?: ViewStyle;
};

/**
 * A single pulsing placeholder block. Compose these into screen-specific
 * skeleton rows/cards that mirror the real content's layout.
 */
export function SkeletonBlock({
  width,
  height,
  radius = 6,
  style,
}: SkeletonBlockProps) {
  const opacity = useSharedValue(0.4);

  useEffect(() => {
    opacity.value = withRepeat(
      withTiming(1, { duration: 700, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
  }, [opacity]);

  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.View
      style={[
        styles.block,
        { width, height, borderRadius: radius },
        animatedStyle,
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  block: { backgroundColor: "#e4e6eb" },
});
