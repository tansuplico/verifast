import Ionicons from "@expo/vector-icons/Ionicons";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
} from "react";
import { Alert, Modal, Pressable, StyleSheet, View } from "react-native";
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import { ThemedText } from "@/components/themed-text";
import { Spacing } from "@/constants/theme";

// A drop-in replacement for React Native's Alert.alert - same
// (title, message, buttons) shape, so migrating a call site is mostly a
// rename - rendered as a centered card in the app's own visual language.
//
// It renders inside its own transparent <Modal> on purpose: an overlay in
// the main app tree (like the toast) can't appear above a BottomSheet that's
// already open, and many alerts fire from inside one (delete confirmations,
// save errors). A Modal of its own can.
//
// showAlert is a plain module-level function (not a hook) so it can be
// called from anywhere - components, async callbacks, and module-level
// helpers like showComingSoon - the way Alert.alert could be.

export type AlertButton = {
  text: string;
  style?: "default" | "cancel" | "destructive";
  onPress?: () => void | Promise<void>;
};

export type AlertTone = "danger" | "warning" | "info" | "success";

type IoniconName = ComponentProps<typeof Ionicons>["name"];

export type AlertOptions = {
  // Colors the icon badge. When omitted, it's "danger" if any button is
  // destructive and "info" otherwise - pass it explicitly for errors
  // ("danger") or to keep a destructive-button prompt calm ("info").
  tone?: AlertTone;
  // Overrides the tone's default icon.
  icon?: IoniconName;
};

type AlertRequest = {
  title: string;
  message?: string;
  buttons: AlertButton[];
  tone: AlertTone;
  icon: IoniconName;
  // Resolves showAlert's promise once the alert has fully closed.
  onClosed: () => void;
};

const TONE_STYLE: Record<
  AlertTone,
  { badgeBackground: string; iconColor: string; icon: IoniconName }
> = {
  danger: {
    badgeBackground: "#fef2f2",
    iconColor: "#dc2626",
    icon: "alert-circle-outline",
  },
  warning: {
    badgeBackground: "#fffbeb",
    iconColor: "#d97706",
    icon: "warning-outline",
  },
  info: {
    badgeBackground: "#e0f5f1",
    iconColor: "#0d9488",
    icon: "information-circle-outline",
  },
  success: {
    badgeBackground: "#e0f5f1",
    iconColor: "#0d9488",
    icon: "checkmark-circle-outline",
  },
};

const OPEN_MS = 220;
const CLOSE_MS = 160;

// Side-by-side buttons only when there are exactly two and both labels are
// short enough to fit on one line inside the card - otherwise they stack.
const MAX_ROW_LABEL_LENGTH = 14;

let presentAlert: ((request: AlertRequest) => void) | null = null;

// Returns a promise that resolves once the alert has closed (after any
// button's onPress has been started). Most call sites ignore it; await it
// when something must wait until the alert is gone - e.g. add-document-modal
// keeps its sheet hidden until then.
export function showAlert(
  title: string,
  message?: string,
  buttons?: AlertButton[],
  options?: AlertOptions,
): Promise<void> {
  const resolvedButtons =
    buttons && buttons.length > 0 ? buttons : [{ text: "OK" }];

  // AlertProvider isn't mounted (shouldn't happen once it's in the root
  // layout) - fall back to the native alert so the message is never lost.
  const present = presentAlert;
  if (!present) {
    Alert.alert(title, message, resolvedButtons);
    return Promise.resolve();
  }

  const tone: AlertTone =
    options?.tone ??
    (resolvedButtons.some((b) => b.style === "destructive")
      ? "danger"
      : "info");

  return new Promise<void>((resolve) => {
    present({
      title,
      message,
      buttons: resolvedButtons,
      tone,
      icon: options?.icon ?? TONE_STYLE[tone].icon,
      onClosed: resolve,
    });
  });
}

// One shared "not built yet" alert, instead of a copy in every screen.
export function showComingSoon(feature: string) {
  return showAlert("Coming soon", `${feature} isn't set up yet.`, undefined, {
    tone: "info",
    icon: "time-outline",
  });
}

export function AlertProvider({ children }: { children: ReactNode }) {
  const [current, setCurrent] = useState<AlertRequest | null>(null);
  const currentRef = useRef<AlertRequest | null>(null);
  const queue = useRef<AlertRequest[]>([]);
  const isClosing = useRef(false);
  const closeTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const progress = useSharedValue(0);

  const open = useCallback(
    (request: AlertRequest) => {
      currentRef.current = request;
      setCurrent(request);
      progress.value = withTiming(1, {
        duration: OPEN_MS,
        easing: Easing.out(Easing.cubic),
      });
    },
    [progress],
  );

  // Fades the card out, unmounts it, then runs `after` (a button's onPress).
  // Running it only once the modal is fully gone means a handler that opens
  // another modal or alert never has to stack on top of this one.
  const close = useCallback(
    (after?: () => void | Promise<void>) => {
      if (isClosing.current) return;
      isClosing.current = true;
      const closingRequest = currentRef.current;

      progress.value = withTiming(0, {
        duration: CLOSE_MS,
        easing: Easing.in(Easing.cubic),
      });

      closeTimeout.current = setTimeout(() => {
        currentRef.current = null;
        setCurrent(null);
        isClosing.current = false;

        void after?.();
        closingRequest?.onClosed();

        // If `after` opened its own alert, currentRef is set again and
        // whatever was queued behind this one keeps waiting its turn.
        if (!currentRef.current) {
          const next = queue.current.shift();
          if (next) open(next);
        }
      }, CLOSE_MS);
    },
    [progress, open],
  );

  useEffect(() => {
    presentAlert = (request) => {
      if (currentRef.current || isClosing.current) {
        queue.current.push(request);
        return;
      }
      open(request);
    };
    return () => {
      presentAlert = null;
      if (closeTimeout.current) clearTimeout(closeTimeout.current);
    };
  }, [open]);

  const backdropStyle = useAnimatedStyle(() => ({ opacity: progress.value }));
  const cardStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ scale: interpolate(progress.value, [0, 1], [0.92, 1]) }],
  }));

  // Back button / backdrop tap only dismiss when that can't be mistaken for
  // a choice: a lone button, or a real cancel button. A multi-choice prompt
  // with no cancel option (e.g. "Take photo" / "Choose from library") must
  // be answered explicitly.
  const isDismissible =
    !!current &&
    (current.buttons.length <= 1 ||
      current.buttons.some((b) => b.style === "cancel"));

  const handleDismiss = () => {
    if (isDismissible) close();
  };

  return (
    <>
      {children}
      {current && (
        <Modal
          visible
          transparent
          animationType="none"
          statusBarTranslucent
          onRequestClose={handleDismiss}
        >
          <View style={styles.container}>
            <Animated.View style={[styles.backdrop, backdropStyle]}>
              <Pressable
                style={StyleSheet.absoluteFill}
                onPress={handleDismiss}
                accessible={false}
              />
            </Animated.View>

            <Animated.View
              accessibilityViewIsModal
              accessibilityRole="alert"
              style={[styles.card, cardStyle]}
            >
              <AlertCard request={current} onPressButton={close} />
            </Animated.View>
          </View>
        </Modal>
      )}
    </>
  );
}

function AlertCard({
  request,
  onPressButton,
}: {
  request: AlertRequest;
  onPressButton: (after?: () => void | Promise<void>) => void;
}) {
  const tone = TONE_STYLE[request.tone];
  const { buttons } = request;

  const isRow =
    buttons.length === 2 &&
    buttons.every((b) => b.text.length <= MAX_ROW_LABEL_LENGTH);

  // In a stack, a cancel button drops to the bottom as quiet text - the
  // actual choices read first, the way they do in the native sheets.
  const ordered = isRow
    ? buttons
    : [
        ...buttons.filter((b) => b.style !== "cancel"),
        ...buttons.filter((b) => b.style === "cancel"),
      ];

  // Exactly one button gets the teal primary fill: the first plain one.
  // When there isn't one (Cancel / Delete), the destructive button is the
  // filled action instead and turns red.
  const primaryButton = ordered.find(
    (b) => b.style !== "cancel" && b.style !== "destructive",
  );

  function variantFor(button: AlertButton) {
    if (button === primaryButton) return "primary" as const;
    if (button.style === "destructive") {
      return isRow && !primaryButton
        ? ("destructiveFilled" as const)
        : ("destructiveTint" as const);
    }
    if (button.style === "cancel") {
      return isRow ? ("secondary" as const) : ("ghost" as const);
    }
    return "secondary" as const;
  }

  return (
    <>
      <View style={[styles.badge, { backgroundColor: tone.badgeBackground }]}>
        <Ionicons name={request.icon} size={26} color={tone.iconColor} />
      </View>

      <ThemedText type="smallBold" style={styles.title}>
        {request.title}
      </ThemedText>

      {request.message ? (
        <ThemedText type="small" style={styles.message}>
          {request.message}
        </ThemedText>
      ) : null}

      <View style={isRow ? styles.buttonRow : styles.buttonStack}>
        {ordered.map((button, index) => {
          const variant = variantFor(button);
          return (
            <Pressable
              key={`${button.text}-${index}`}
              accessibilityRole="button"
              onPress={() => onPressButton(button.onPress)}
              style={({ pressed }) => [
                styles.button,
                isRow && styles.buttonRowItem,
                BUTTON_BACKGROUND[variant],
                pressed && styles.buttonPressed,
              ]}
            >
              <ThemedText
                type="smallBold"
                style={[styles.buttonText, BUTTON_TEXT[variant]]}
                numberOfLines={1}
              >
                {button.text}
              </ThemedText>
            </Pressable>
          );
        })}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Spacing.four,
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  card: {
    width: "100%",
    maxWidth: 320,
    backgroundColor: "#ffffff",
    borderRadius: 20,
    paddingTop: Spacing.four,
    paddingHorizontal: Spacing.three + 4,
    paddingBottom: Spacing.three + 4,
    alignItems: "center",
  },
  badge: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.three - 2,
  },
  title: {
    color: "#1a1c20",
    fontSize: 17,
    lineHeight: 24,
    textAlign: "center",
    marginBottom: Spacing.one + 2,
  },
  message: {
    color: "#60646c",
    lineHeight: 20,
    textAlign: "center",
    marginBottom: Spacing.three + 4,
  },
  buttonRow: {
    flexDirection: "row",
    gap: Spacing.two + 2,
    alignSelf: "stretch",
  },
  buttonStack: { gap: Spacing.two, alignSelf: "stretch" },
  button: {
    borderRadius: 12,
    paddingVertical: Spacing.three - 4,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonRowItem: { flex: 1 },
  buttonPressed: { opacity: 0.8 },
  buttonText: { fontSize: 15 },
});

const BUTTON_BACKGROUND = StyleSheet.create({
  primary: { backgroundColor: "#0d9488" },
  secondary: { backgroundColor: "#f0f0f3" },
  destructiveFilled: { backgroundColor: "#dc2626" },
  destructiveTint: { backgroundColor: "#fef2f2" },
  ghost: { backgroundColor: "transparent" },
});

const BUTTON_TEXT = StyleSheet.create({
  primary: { color: "#ffffff" },
  secondary: { color: "#1a1c20" },
  destructiveFilled: { color: "#ffffff" },
  destructiveTint: { color: "#dc2626" },
  ghost: { color: "#60646c" },
});
