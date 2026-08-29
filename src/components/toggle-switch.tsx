import { useEffect } from "react";
import { Pressable, StyleSheet } from "react-native";
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

const TRACK_WIDTH = 52;
const TRACK_HEIGHT = 30;
const THUMB_SIZE = 24;
const THUMB_INSET = (TRACK_HEIGHT - THUMB_SIZE) / 2;

type ToggleSwitchProps = {
  value: boolean;
  onValueChange: (value: boolean) => void;
  trackColorOn?: string;
  trackColorOff?: string;
};

// Custom pill toggle: the native RN <Switch> ignores width/height styling
// entirely (its track-to-thumb ratio is hardcoded per platform), so a
// "thick body" design like this one isn't achievable with the built-in
// component - this replaces it with an equivalent Reanimated-driven view.
export function ToggleSwitch({
  value,
  onValueChange,
  trackColorOn = "#14b8a6",
  trackColorOff = "#d7dade",
}: ToggleSwitchProps) {
  const progress = useSharedValue(value ? 1 : 0);

  useEffect(() => {
    progress.value = withTiming(value ? 1 : 0, { duration: 150 });
  }, [value, progress]);

  const trackStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      progress.value,
      [0, 1],
      [trackColorOff, trackColorOn],
    ),
  }));

  const thumbStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateX:
          progress.value * (TRACK_WIDTH - THUMB_SIZE - THUMB_INSET * 2),
      },
    ],
  }));

  return (
    <Pressable
      onPress={() => onValueChange(!value)}
      hitSlop={8}
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
    >
      <Animated.View style={[styles.track, trackStyle]}>
        <Animated.View style={[styles.thumb, thumbStyle]} />
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  track: {
    width: TRACK_WIDTH,
    height: TRACK_HEIGHT,
    borderRadius: TRACK_HEIGHT / 2,
    padding: THUMB_INSET,
    justifyContent: "center",
  },
  thumb: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: THUMB_SIZE / 2,
    backgroundColor: "#ffffff",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
});
