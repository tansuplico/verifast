import Ionicons from "@expo/vector-icons/Ionicons";
import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import Animated, { FadeInUp, FadeOutUp } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ThemedText } from "@/components/themed-text";
import { useIsOnline } from "@/hooks/use-network-status";
import { getPendingChangeCount } from "@/lib/offline-db";
import { subscribeToSync } from "@/lib/sync";
import { useAuth } from "@/providers/auth-provider";

// How long the connection has to stay down before the pill first appears,
// so a half-second dropout (switching between wifi and cellular, walking
// past a dead spot) doesn't flash it on and off.
const SHOW_DELAY_MS = 1500;

// How long the pill stays up when you first go offline, and how long it
// stays when it comes back to confirm a newly queued edit. Tapping it
// dismisses it sooner.
const FIRST_VISIBLE_MS = 4000;
const REAPPEAR_VISIBLE_MS = 3000;

// While offline, re-check the queue this often. Edits made offline don't
// notify sync listeners (a sync that can't reach the network exits before
// it does), so the count has to be polled. It's four tiny COUNT queries on
// a local database, and it only runs while offline.
const COUNT_POLL_MS = 2000;

// When the connection comes back after the pill was shown, it confirms the
// recovery: "Back online" straight away if nothing was queued, or - if
// edits were waiting - "Back online · synced" once the queue has emptied.
// The queue is checked this often, for at most SYNC_WAIT_MAX_MS; if it never
// empties (the server is down, say) nothing is claimed and the pill just
// stays away.
const SYNCED_VISIBLE_MS = 2500;
const SYNC_POLL_MS = 500;
const SYNC_WAIT_MAX_MS = 30000;

// One app-wide "you're offline" indicator, mounted once in the root layout
// so every signed-in screen gets it without any per-screen code. It speaks
// up when something changes and then gets out of the way: it appears when
// the connection drops, fades out after a few seconds, and briefly returns
// each time a new edit is queued to confirm it's safe. When the connection
// returns it gives a short "back online" confirmation. Only shows for a
// fully signed-in user - the login, password-reset and 2FA screens never get
// it - using the same condition that gates the (tabs) stack in the root
// layout.
export function OfflinePill() {
  const { session, isPasswordRecovery, needsEmailOtpChallenge } = useAuth();
  if (!session || isPasswordRecovery || needsEmailOtpChallenge) return null;
  return <OfflinePillContent userId={session.user.id} />;
}

function OfflinePillContent({ userId }: { userId: string }) {
  const isOnline = useIsOnline();
  const insets = useSafeAreaInsets();
  const [visible, setVisible] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  // Text for the "back online" confirmation; null while the pill is the
  // offline one. Kept after the confirmation hides so its exit animation
  // still has a label to fade out with.
  const [onlineLabel, setOnlineLabel] = useState<string | null>(null);
  // Whether the pill was actually shown during the current offline episode,
  // so a half-second dropout never produces a "back online" message.
  const shownThisEpisode = useRef(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The queue size at the last check, so a *rise* (a new edit) can be told
  // apart from a fall (a sync clearing things) or no change at all.
  const lastCount = useRef(0);

  const dismiss = useCallback(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    setVisible(false);
  }, []);

  const showFor = useCallback((durationMs: number) => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    setVisible(true);
    hideTimer.current = setTimeout(() => setVisible(false), durationMs);
  }, []);

  // One effect per offline episode: it starts when the connection drops and
  // is torn down - pill hidden, timers cleared, baseline forgotten - the
  // moment it returns, so the next outage starts fresh.
  useEffect(() => {
    if (isOnline) {
      if (!shownThisEpisode.current) {
        dismiss();
        return;
      }
      shownThisEpisode.current = false;

      let queued = 0;
      try {
        queued = getPendingChangeCount(userId);
      } catch {
        // A failed local read is treated as nothing queued.
      }

      // Nothing was waiting: swap the offline pill's text in place.
      if (queued === 0) {
        setOnlineLabel("Back online");
        showFor(SYNCED_VISIBLE_MS);
        return dismiss;
      }

      // Edits were waiting: hide the stale "will sync later" pill and only
      // confirm once the queue has actually emptied.
      dismiss();
      let done = false;
      const stop = () => {
        done = true;
        clearInterval(interval);
        clearTimeout(giveUp);
        unsubscribe();
      };
      const checkSynced = () => {
        if (done) return;
        try {
          if (getPendingChangeCount(userId) > 0) return;
        } catch {
          return;
        }
        stop();
        setOnlineLabel("Back online · synced");
        showFor(SYNCED_VISIBLE_MS);
      };
      const interval = setInterval(checkSynced, SYNC_POLL_MS);
      const giveUp = setTimeout(stop, SYNC_WAIT_MAX_MS);
      const unsubscribe = subscribeToSync(checkSynced);

      return () => {
        stop();
        dismiss();
      };
    }

    const showPill = (durationMs: number) => {
      shownThisEpisode.current = true;
      setOnlineLabel(null);
      showFor(durationMs);
    };

    let baseline = 0;
    try {
      baseline = getPendingChangeCount(userId);
    } catch {
      // A failed local read just starts the count at zero.
    }
    lastCount.current = baseline;
    setPendingCount(baseline);

    const firstShow = setTimeout(
      () => showPill(FIRST_VISIBLE_MS),
      SHOW_DELAY_MS,
    );

    const checkQueue = () => {
      try {
        const count = getPendingChangeCount(userId);
        setPendingCount(count);
        if (count > lastCount.current) showPill(REAPPEAR_VISIBLE_MS);
        lastCount.current = count;
      } catch {
        // Keep the last known count.
      }
    };
    const interval = setInterval(checkQueue, COUNT_POLL_MS);
    const unsubscribe = subscribeToSync(checkQueue);

    return () => {
      clearTimeout(firstShow);
      clearInterval(interval);
      unsubscribe();
    };
  }, [isOnline, userId, dismiss, showFor]);

  useEffect(
    () => () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    },
    [],
  );

  const label =
    onlineLabel ??
    (pendingCount > 0
      ? `Offline · ${pendingCount} ${
          pendingCount === 1 ? "change" : "changes"
        } will sync later`
      : "Offline · showing saved data");

  // The wrapper stays mounted so the pill's exit animation can play; it's
  // box-none so only the pill itself ever catches a touch.
  return (
    <View
      style={[styles.container, { top: insets.top + 6 }]}
      pointerEvents="box-none"
    >
      {visible && (
        <Animated.View
          entering={FadeInUp.duration(250)}
          exiting={FadeOutUp.duration(200)}
        >
          <Pressable
            onPress={dismiss}
            style={styles.pill}
            accessibilityRole="button"
            accessibilityLabel={`${label}. Tap to dismiss.`}
          >
            {onlineLabel ? (
              <Ionicons name="checkmark-circle" size={15} color="#34d399" />
            ) : (
              <Ionicons
                name="cloud-offline-outline"
                size={15}
                color="#fbbf24"
              />
            )}
            <ThemedText type="smallBold" style={styles.text}>
              {label}
            </ThemedText>
          </Pressable>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 1000,
    elevation: 10,
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "rgba(31, 36, 48, 0.95)",
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  text: { color: "#ffffff", fontSize: 12 },
});
