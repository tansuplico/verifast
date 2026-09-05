import type { Session } from "@supabase/supabase-js";
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
};
WebBrowser.maybeCompleteAuthSession();
const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
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
      async signIn(email, password) {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        return { error: error?.message ?? null };
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
        setIsPasswordRecovery(false);
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

        const { error: sessionError } = await supabase.auth.setSession({
          access_token: params.access_token,
          refresh_token: params.refresh_token,
        });
        return { error: sessionError?.message ?? null };
      },
    }),

    [session, isLoading, isPasswordRecovery],
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
