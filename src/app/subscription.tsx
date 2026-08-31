import Ionicons from "@expo/vector-icons/Ionicons";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ThemedText } from "@/components/themed-text";
import { Spacing } from "@/constants/theme";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/providers/auth-provider";

type SubscriptionRow = {
  status: "trialing" | "active" | "past_due" | "canceled" | "expired";
  trial_ends_at: string | null;
  current_period_end: string | null;
};

// TODO: mockup shows P699/year - the feasibility study docs and the old
// placeholder both say P90/year. Using the mockup value for now; flagged
// for Tristan to confirm which is correct.
const ANNUAL_PRICE = "\u20b190";

const INCLUDED_FEATURES = [
  "Unlimited document storage",
  "Folder organization by category",
  "Document Request Tracker",
  "Expiry and submission alerts",
  "Academic info and announcements",
  "Push and email notifications",
  "Document backup and recovery",
  "Priority support",
];

function daysLeft(dateString: string) {
  const diff = new Date(dateString).getTime() - Date.now();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

function showComingSoon(feature: string) {
  Alert.alert("Coming soon", `${feature} isn't set up yet.`);
}

function trialBannerCopy(sub: SubscriptionRow | null) {
  if (sub?.status === "trialing" && sub.trial_ends_at) {
    const remaining = daysLeft(sub.trial_ends_at);
    return {
      title:
        remaining > 0
          ? `${remaining} days left in your trial`
          : "Trial ends today",
      detail: "No payment needed until your trial ends.",
    };
  }
  return {
    title: "45-day free trial",
    detail: "No payment needed until your trial ends.",
  };
}

function ctaCopy(sub: SubscriptionRow | null) {
  switch (sub?.status) {
    case "trialing":
    case "active":
      return "Manage Billing";
    case "past_due":
      return "Update Payment Method";
    default:
      return "Start Free Trial";
  }
}

export default function SubscriptionScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const [subscription, setSubscription] = useState<SubscriptionRow | null>(
    null,
  );

  const loadSubscription = useCallback(async () => {
    if (!session) return;
    const { data } = await supabase
      .from("subscriptions")
      .select("status, trial_ends_at, current_period_end")
      .eq("user_id", session.user.id)
      .single();
    setSubscription(data ?? null);
  }, [session]);

  useFocusEffect(
    useCallback(() => {
      loadSubscription();
    }, [loadSubscription]),
  );

  const trial = trialBannerCopy(subscription);
  const cta = ctaCopy(subscription);

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={["top", "bottom"]}>
        <View style={styles.header}>
          <Pressable
            hitSlop={8}
            onPress={() => router.back()}
            style={styles.closeButton}
          >
            <Ionicons name="close" size={20} color="#1a1c20" />
          </Pressable>
          <ThemedText type="smallBold" style={styles.headerTitle}>
            VeriFast Pro
          </ThemedText>
          <View style={styles.headerSpacer} />
        </View>

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.heroIconBadge}>
            <Ionicons name="flash" size={26} color="#ffffff" />
          </View>

          <ThemedText type="subtitle" style={styles.heroTitle}>
            Everything you need.
          </ThemedText>
          <ThemedText type="default" style={styles.heroSubtitle}>
            One plan. All features. No limits on what you can store or track.
          </ThemedText>

          <View style={styles.planCard}>
            <View style={styles.planBadgeRow}>
              <ThemedText type="smallBold" style={styles.planLabel}>
                Annual Plan
              </ThemedText>
              <View style={styles.bestValueBadge}>
                <ThemedText style={styles.bestValueText}>Best Value</ThemedText>
              </View>
            </View>

            <View style={styles.priceRow}>
              <ThemedText style={styles.priceAmount}>{ANNUAL_PRICE}</ThemedText>
              <ThemedText type="small" style={styles.pricePeriod}>
                {" "}
                / year
              </ThemedText>
            </View>

            <ThemedText type="small" style={styles.planDetail}>
              Billed once a year. Cancel anytime.
            </ThemedText>
          </View>

          <View style={styles.trialBanner}>
            <View style={styles.trialIconBadge}>
              <Ionicons name="gift" size={16} color="#ffffff" />
            </View>
            <View style={styles.trialText}>
              <ThemedText type="smallBold" style={styles.trialTitle}>
                {trial.title}
              </ThemedText>
              <ThemedText type="small" style={styles.trialDetail}>
                {trial.detail}
              </ThemedText>
            </View>
          </View>

          <View style={styles.featuresCard}>
            <ThemedText type="small" style={styles.featuresLabel}>
              WHAT IS INCLUDED
            </ThemedText>

            {INCLUDED_FEATURES.map((feature) => (
              <View key={feature} style={styles.featureRow}>
                <View style={styles.featureCheck}>
                  <Ionicons name="checkmark" size={12} color="#ffffff" />
                </View>
                <ThemedText type="smallBold" style={styles.featureText}>
                  {feature}
                </ThemedText>
              </View>
            ))}
          </View>
        </ScrollView>

        <View style={styles.ctaWrapper}>
          <Pressable onPress={() => showComingSoon("Billing")}>
            <LinearGradient
              colors={["#14b8a6", "#0f766e"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.ctaButton}
            >
              <ThemedText type="smallBold" style={styles.ctaText}>
                {cta}
              </ThemedText>
            </LinearGradient>
          </Pressable>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#ffffff" },
  safeArea: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#eceef1",
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#f0f0f3",
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    color: "#1a1c20",
    fontSize: 16,
    marginLeft: Spacing.three,
  },
  headerSpacer: { flex: 1 },
  scrollContent: {
    alignItems: "center",
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.five,
    paddingBottom: Spacing.six,
    gap: Spacing.three,
  },
  heroIconBadge: {
    width: 56,
    height: 56,
    borderRadius: Spacing.three,
    backgroundColor: "#0d9488",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.one,
  },
  heroTitle: {
    fontSize: 22,
    lineHeight: 28,
    color: "#1a1c20",
    textAlign: "center",
  },
  heroSubtitle: {
    fontSize: 14,
    lineHeight: 20,
    color: "#8b8f99",
    textAlign: "center",
    marginTop: -Spacing.one,
  },
  planCard: {
    width: "100%",
    backgroundColor: "#ecfdf7",
    borderWidth: 1,
    borderColor: "#99e6d9",
    borderRadius: Spacing.three,
    padding: Spacing.four,
    marginTop: Spacing.two,
  },
  planBadgeRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  planLabel: { color: "#0d9488" },
  bestValueBadge: {
    backgroundColor: "#0f3d33",
    borderRadius: 20,
    paddingHorizontal: Spacing.two + 2,
    paddingVertical: 4,
  },
  bestValueText: { color: "#ffffff", fontSize: 11, fontWeight: "700" },
  priceRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    marginTop: Spacing.two,
  },
  priceAmount: { fontSize: 34, fontWeight: "800", color: "#1a1c20" },
  pricePeriod: { color: "#8b8f99", marginBottom: 4 },
  planDetail: { color: "#8b8f99", marginTop: Spacing.one },
  trialBanner: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two,
    backgroundColor: "#fef9e7",
    borderWidth: 1,
    borderColor: "#f7e3ad",
    borderRadius: Spacing.three,
    padding: Spacing.three,
  },
  trialIconBadge: {
    width: 34,
    height: 34,
    borderRadius: Spacing.two,
    backgroundColor: "#f59e0b",
    alignItems: "center",
    justifyContent: "center",
  },
  trialText: { flex: 1, gap: 2 },
  trialTitle: { color: "#b45309" },
  trialDetail: { color: "#c98a1f" },
  featuresCard: {
    width: "100%",
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#eceef1",
    borderRadius: Spacing.three,
    padding: Spacing.four,
    gap: Spacing.three,
  },
  featuresLabel: {
    color: "#8b8f99",
    letterSpacing: 0.5,
    marginBottom: Spacing.one,
  },
  featureRow: { flexDirection: "row", alignItems: "center", gap: Spacing.two },
  featureCheck: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#10b981",
    alignItems: "center",
    justifyContent: "center",
  },
  featureText: { color: "#1a1c20", flex: 1 },
  ctaWrapper: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.two,
  },
  ctaButton: {
    borderRadius: Spacing.three,
    paddingVertical: Spacing.three,
    alignItems: "center",
  },
  ctaText: { color: "#ffffff", fontSize: 16 },
});
