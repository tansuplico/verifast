import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Session, User } from "@supabase/supabase-js";
import { makeRedirectUri } from "expo-auth-session";
import * as QueryParams from "expo-auth-session/build/QueryParams";
import * as WebBrowser from "expo-web-browser";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { supabase } from "@/lib/supabase";

type AuthContextValue = {
  session: Session | null;
  isLoading: boolean;
  isPasswordRecovery: boolean;
  needsEmailOtpChallenge: boolean;
  pendingOtpEmail: string | null;
  otpResendAvailableAt: number | null;
  signIn: (
    email: string,
    password: string,
  ) => Promise<{ error: string | null }>;
  signUp: (
    fullName: string,
    email: string,
    password: string,
  ) => Promise<{ error: string | null; needsEmailConfirmation: boolean }>;
  signOut: () => Promise<void>;
  requestPasswordReset: (email: string) => Promise<{ error: string | null }>;
  verifyPasswordResetCode: (
    email: string,
    code: string,
  ) => Promise<{ error: string | null }>;
  updatePassword: (newPassword: string) => Promise<{ error: string | null }>;
  signInWithGoogle: () => Promise<{ error: string | null }>;
  setTwoFactorEnabled: (enabled: boolean) => Promise<{ error: string | null }>;
  verifyEmailOtpChallenge: (
    code: string,
    rememberDevice: boolean,
  ) => Promise<{ error: string | null }>;
  resendEmailOtpChallenge: () => Promise<{ error: string | null }>;
  cancelEmailOtpChallenge: () => Promise<void>;
};

WebBrowser.maybeCompleteAuthSession();
const AuthContext = createContext<AuthContextValue | null>(null);

// "Remember this device" is intentionally device-local only (AsyncStorage
// already never leaves this install) rather than a server-side trusted-
// devices list - simplest option that satisfies "until they sign out".
// Keyed per user id since more than one account could use the same device.
const TRUST_KEY_PREFIX = "verifast_mfa_trusted_";

async function isDeviceTrusted(userId: string) {
  const value = await AsyncStorage.getItem(`${TRUST_KEY_PREFIX}${userId}`);
  return value === "true";
}

async function setDeviceTrusted(userId: string, trusted: boolean) {
  if (trusted) {
    await AsyncStorage.setItem(`${TRUST_KEY_PREFIX}${userId}`, "true");
  } else {
    await AsyncStorage.removeItem(`${TRUST_KEY_PREFIX}${userId}`);
  }
}

function hasTwoFactorEnabled(user: User | null | undefined) {
  return user?.user_metadata?.two_factor_enabled === true;
}

// Guards against spamming signInWithOtp - Supabase's own default limit is
// one send per address per 60s (and just 2 emails/hour on default SMTP),
// so anything shorter than that just wastes quota without ever reaching
// the user's inbox. Persisted (not just component state) because the
// thing we're guarding against - reloads/relaunches re-running the
// launch-time check - is exactly the case where in-memory state resets.
const LAST_SENT_KEY_PREFIX = "verifast_mfa_last_sent_";
const OTP_RESEND_COOLDOWN_MS = 60_000;

async function getOtpCooldownEndsAt(userId: string): Promise<number> {
  const value = await AsyncStorage.getItem(`${LAST_SENT_KEY_PREFIX}${userId}`);
  return value ? Number(value) + OTP_RESEND_COOLDOWN_MS : 0;
}

async function markOtpSentNow(userId: string) {
  await AsyncStorage.setItem(
    `${LAST_SENT_KEY_PREFIX}${userId}`,
    String(Date.now()),
  );
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false);
  const [needsEmailOtpChallenge, setNeedsEmailOtpChallenge] = useState(false);
  const [pendingOtpEmail, setPendingOtpEmail] = useState<string | null>(null);
  const [otpResendAvailableAt, setOtpResendAvailableAt] = useState<
    number | null
  >(null);

  // Shared by password sign-in, Google sign-in, and app-launch session
  // restoration - see the file-level note on why launch also needs this
  // check (killing the app between the password step and the emailed
  // code would otherwise leave a fully-authenticated, unchallenged session).
  async function maybeStartEmailOtpChallenge(user: User | null | undefined) {
    if (!user?.email || !hasTwoFactorEnabled(user)) return;
    if (await isDeviceTrusted(user.id)) return;

    setPendingOtpEmail(user.email);
    setNeedsEmailOtpChallenge(true);

    const cooldownEndsAt = await getOtpCooldownEndsAt(user.id);
    if (Date.now() < cooldownEndsAt) {
      // A code was already sent within the last 60s (e.g. a quick
      // reload right after one went out) - the challenge screen still
      // shows, but don't fire another send on top of the existing code.
      setOtpResendAvailableAt(cooldownEndsAt);
      return;
    }

    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: user.email,
        options: { shouldCreateUser: false },
      });
      if (error) {
        // Surfaced in logs only - the challenge screen is already up,
        // and the user's own "Resend" retries this same call.
        console.warn("[2fa] failed to send challenge code:", error.message);
      } else {
        await markOtpSentNow(user.id);
        setOtpResendAvailableAt(Date.now() + OTP_RESEND_COOLDOWN_MS);
      }
    } catch (err) {
      console.warn("[2fa] failed to send challenge code:", err);
    }
  }

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session);
      await maybeStartEmailOtpChallenge(data.session?.user);
      setIsLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange(
      (event, newSession) => {
        // A recovery session is still a real session, same as signing in
        // normally. We track PASSWORD_RECOVERY separately so the router
        // can send the user to the "set new password" screen instead of
        // straight into the app - see the guard logic in the root layout.
        if (event === "PASSWORD_RECOVERY") {
          setIsPasswordRecovery(true);
        }
        setSession(newSession);
      },
    );

    return () => listener.subscription.unsubscribe();
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      isLoading,
      isPasswordRecovery,
      needsEmailOtpChallenge,
      pendingOtpEmail,
      otpResendAvailableAt,
      async signIn(email, password) {
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) {
          return { error: error.message };
        }
        await maybeStartEmailOtpChallenge(data.user);
        return { error: null };
      },
      async signUp(fullName, email, password) {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { full_name: fullName } },
        });
        return {
          error: error?.message ?? null,
          needsEmailConfirmation: !error && !data.session,
        };
      },
      async signOut() {
        // Clear this device's trust for the current user before signing
        // out, so "remember this device" only lasts "until they sign
        // out", per the intended scope - a later sign-in on this same
        // device (even by the same user) should challenge again.
        if (session?.user.id) {
          await setDeviceTrusted(session.user.id, false);
        }
        setIsPasswordRecovery(false);
        setNeedsEmailOtpChallenge(false);
        setPendingOtpEmail(null);
        await supabase.auth.signOut();
      },
      async requestPasswordReset(email) {
        // No redirectTo - the email carries a 6-digit code, not a link,
        // so there's no deep link for the app to catch.
        const { error } = await supabase.auth.resetPasswordForEmail(email);
        return { error: error?.message ?? null };
      },
      async verifyPasswordResetCode(email, code) {
        const { error } = await supabase.auth.verifyOtp({
          email,
          token: code,
          type: "recovery",
        });
        if (!error) {
          // Same reasoning as the PASSWORD_RECOVERY branch above: this
          // establishes a real session, so we mark it explicitly rather
          // than assume the auth event fires, to make sure the router
          // sends the user to reset-password instead of straight into
          // the app.
          setIsPasswordRecovery(true);
        }
        return { error: error?.message ?? null };
      },
      async updatePassword(newPassword) {
        const { error } = await supabase.auth.updateUser({
          password: newPassword,
        });
        if (!error) {
          // Recovery is resolved - let the normal session guard take over.
          setIsPasswordRecovery(false);
        }
        return { error: error?.message ?? null };
      },
      async signInWithGoogle() {
        // skipBrowserRedirect + openAuthSessionAsync lets us capture the
        // verifast:// redirect ourselves and exchange it for a session
        // directly here, instead of needing a global deep-link listener
        // like the password-reset flow used.
        const redirectTo = makeRedirectUri();
        const { data, error } = await supabase.auth.signInWithOAuth({
          provider: "google",
          options: { redirectTo, skipBrowserRedirect: true },
        });
        if (error) {
          return { error: error.message };
        }

        const result = await WebBrowser.openAuthSessionAsync(
          data.url ?? "",
          redirectTo,
        );
        if (result.type !== "success") {
          // User cancelled or dismissed the browser - not a real error.
          return { error: null };
        }

        const { params, errorCode } = QueryParams.getQueryParams(result.url);
        if (errorCode) {
          return { error: errorCode };
        }
        if (!params.access_token || !params.refresh_token) {
          return { error: "Google sign-in didn't return a session." };
        }

        const { data: sessionData, error: sessionError } =
          await supabase.auth.setSession({
            access_token: params.access_token,
            refresh_token: params.refresh_token,
          });
        if (sessionError) {
          return { error: sessionError.message };
        }
        await maybeStartEmailOtpChallenge(sessionData.user);
        return { error: null };
      },
      async setTwoFactorEnabled(enabled) {
        const { error } = await supabase.auth.updateUser({
          data: { two_factor_enabled: enabled },
        });
        return { error: error?.message ?? null };
      },
      async verifyEmailOtpChallenge(code, rememberDevice) {
        if (!pendingOtpEmail) {
          return { error: "No pending verification email." };
        }
        try {
          const { data, error } = await supabase.auth.verifyOtp({
            email: pendingOtpEmail,
            token: code,
            type: "email",
          });
          if (error) {
            return { error: error.message };
          }
          if (rememberDevice && data.user) {
            await setDeviceTrusted(data.user.id, true);
          }
          setNeedsEmailOtpChallenge(false);
          setPendingOtpEmail(null);
          return { error: null };
        } catch (err) {
          // Anything unexpected here (e.g. a native AsyncStorage hiccup
          // on the setDeviceTrusted write) surfaces as a normal error
          // instead of throwing past the caller and leaving its
          // isSubmitting flag stuck true forever.
          const message =
            err instanceof Error
              ? err.message
              : "Something went wrong. Please try again.";
          return { error: message };
        }
      },
      async resendEmailOtpChallenge() {
        if (!pendingOtpEmail) {
          return { error: "No pending verification email." };
        }
        const userId = session?.user.id;
        if (userId) {
          const cooldownEndsAt = await getOtpCooldownEndsAt(userId);
          if (Date.now() < cooldownEndsAt) {
            const secondsLeft = Math.ceil((cooldownEndsAt - Date.now()) / 1000);
            return {
              error: `Please wait ${secondsLeft}s before requesting another code.`,
            };
          }
        }
        try {
          const { error } = await supabase.auth.signInWithOtp({
            email: pendingOtpEmail,
            options: { shouldCreateUser: false },
          });
          if (!error && userId) {
            await markOtpSentNow(userId);
            setOtpResendAvailableAt(Date.now() + OTP_RESEND_COOLDOWN_MS);
          }
          return { error: error?.message ?? null };
        } catch (err) {
          const message =
            err instanceof Error
              ? err.message
              : "Something went wrong. Please try again.";
          return { error: message };
        }
      },
      async cancelEmailOtpChallenge() {
        // There's no clean "undo just the password step" in Supabase, so
        // backing out of the challenge signs the (already-established)
        // session back out entirely, consistent with signOut()'s trust
        // clearing above.
        setNeedsEmailOtpChallenge(false);
        setPendingOtpEmail(null);
        await supabase.auth.signOut();
      },
    }),
    [
      session,
      isLoading,
      isPasswordRecovery,
      needsEmailOtpChallenge,
      pendingOtpEmail,
      otpResendAvailableAt,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}
