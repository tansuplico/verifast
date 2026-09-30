import NetInfo from "@react-native-community/netinfo";
import { useEffect } from "react";
import { AppState } from "react-native";

import { syncAcademicInfo } from "@/lib/sync";

// Keeps the local database and Supabase in step while the user is signed
// in: one sync right away, then another whenever the connection comes back
// or the app returns to the foreground. Writes also trigger their own sync
// straight away (see requestSync) - this covers everything that happens
// while nobody is saving anything.
export function useOfflineSync(userId: string | null) {
  useEffect(() => {
    if (!userId) return;

    syncAcademicInfo(userId);

    // NetInfo calls back immediately on subscribe and on every change
    // (wifi <-> cellular included), so only react to offline -> online.
    let wasOnline: boolean | null = null;
    const unsubscribeNetInfo = NetInfo.addEventListener((state) => {
      const isOnline =
        state.isConnected === true && state.isInternetReachable !== false;
      if (isOnline && wasOnline === false) {
        syncAcademicInfo(userId);
      }
      wasOnline = isOnline;
    });

    const appStateSubscription = AppState.addEventListener(
      "change",
      (nextState) => {
        if (nextState === "active") syncAcademicInfo(userId);
      },
    );

    return () => {
      unsubscribeNetInfo();
      appStateSubscription.remove();
    };
  }, [userId]);
}
