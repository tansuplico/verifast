import NetInfo from "@react-native-community/netinfo";
import { useEffect, useState } from "react";

// isConnected: device has a network interface (wifi/cellular) up.
// isInternetReachable: NetInfo's own reachability probe - can be null
// briefly right after a change while it's still checking. Both must be
// explicitly true for us to trust the connection enough to skip the cache
// fallback; anything else (false or still-unknown) is treated as offline,
// since a false positive here just means an unnecessary network attempt,
// while a false negative means a real request fails with a worse error.
function isStateOnline(state: {
  isConnected: boolean | null;
  isInternetReachable: boolean | null;
}) {
  return state.isConnected === true && state.isInternetReachable !== false;
}

export function useIsOnline() {
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      setIsOnline(isStateOnline(state));
    });
    NetInfo.fetch().then((state) => setIsOnline(isStateOnline(state)));
    return unsubscribe;
  }, []);

  return isOnline;
}

// One-shot check for call sites that aren't components (e.g. before firing
// off a Supabase request from an event handler).
export async function checkIsOnline(): Promise<boolean> {
  const state = await NetInfo.fetch();
  return isStateOnline(state);
}
