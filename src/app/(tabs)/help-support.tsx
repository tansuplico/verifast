import Ionicons from "@expo/vector-icons/Ionicons";
import { useRouter } from "expo-router";
import { useState } from "react";
import {
  Alert,
  LayoutAnimation,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ThemedText } from "@/components/themed-text";
import { BottomTabInset, Spacing } from "@/constants/theme";

function showComingSoon(feature: string) {
  Alert.alert("Coming soon", `${feature} isn't set up yet.`);
}

// TODO: placeholder contact info - swap for the real support email/phone
// once VeriFast Digital Platforms has one set up.
const SUPPORT_EMAIL = "support@verifast.app";
const SUPPORT_PHONE = "+63 900 000 0000";

const FAQS = [
  {
    question: "How do I upload a document?",
    answer:
      "Go to the Documents tab, then tap the blue plus button at the bottom right. You can upload from your gallery or scan a document with your camera.",
  },
  {
    question: "Can I change my enrolled subjects?",
    answer:
      "Enrolled subjects come from your Academic Info records, which you own and can edit anytime from the Academic tab.",
  },
  {
    question: "What happens to my data if I cancel?",
    answer:
      "Your documents and records stay in your account and remain accessible - cancelling only stops renewal of your subscription.",
  },
  {
    question: "How do I get a receipt for my subscription?",
    answer:
      "Receipts are emailed automatically after each successful payment. Contact support if you need one resent.",
  },
];

export default function HelpSupportScreen() {
  const router = useRouter();
  const [expandedIndex, setExpandedIndex] = useState<number | null>(0);

  function handleEmailUs() {
    Linking.openURL(`mailto:${SUPPORT_EMAIL}`);
  }

  function handleCallUs() {
    Linking.openURL(`tel:${SUPPORT_PHONE.replace(/\s+/g, "")}`);
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <Pressable
          hitSlop={8}
          onPress={() => router.back()}
          style={styles.closeButton}
        >
          <Ionicons name="close" size={20} color="#1a1c20" />
        </Pressable>
        <ThemedText type="smallBold" style={styles.headerTitle}>
          Help and Support
        </ThemedText>
        <View style={styles.headerSpacer} />
        <View style={styles.helpBadge}>
          <Ionicons name="help-circle" size={16} color="#0d9488" />
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{
          padding: Spacing.four,
          paddingBottom: BottomTabInset + Spacing.four,
          gap: Spacing.four,
        }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.actionsRow}>
          <Pressable
            style={styles.actionCard}
            onPress={() => showComingSoon("Live chat")}
          >
            <View style={[styles.actionIcon, { backgroundColor: "#e0f5f1" }]}>
              <Ionicons name="chatbubble-outline" size={20} color="#0d9488" />
            </View>
            <ThemedText type="small" style={styles.actionLabel}>
              Live Chat
            </ThemedText>
          </Pressable>

          <Pressable style={styles.actionCard} onPress={handleEmailUs}>
            <View style={[styles.actionIcon, { backgroundColor: "#ececfe" }]}>
              <Ionicons name="mail-outline" size={20} color="#4f46e5" />
            </View>
            <ThemedText type="small" style={styles.actionLabel}>
              Email Us
            </ThemedText>
          </Pressable>

          <Pressable style={styles.actionCard} onPress={handleCallUs}>
            <View style={[styles.actionIcon, { backgroundColor: "#fdf0dc" }]}>
              <Ionicons name="call-outline" size={20} color="#c2760c" />
            </View>
            <ThemedText type="small" style={styles.actionLabel}>
              Call Us
            </ThemedText>
          </Pressable>
        </View>

        <View style={styles.card}>
          <ThemedText type="small" style={styles.sectionLabel}>
            FREQUENTLY ASKED QUESTIONS
          </ThemedText>

          {FAQS.map((faq, index) => {
            const isExpanded = expandedIndex === index;
            return (
              <Pressable
                key={faq.question}
                onPress={() => {
                  LayoutAnimation.configureNext(
                    LayoutAnimation.Presets.easeInEaseOut,
                  );
                  setExpandedIndex(isExpanded ? null : index);
                }}
                style={[
                  styles.faqRow,
                  index === FAQS.length - 1 && styles.faqRowLast,
                ]}
              >
                <View style={styles.faqQuestionRow}>
                  <Ionicons
                    name="help-circle-outline"
                    size={16}
                    color="#0d9488"
                  />
                  <ThemedText type="smallBold" style={styles.faqQuestion}>
                    {faq.question}
                  </ThemedText>
                  <Ionicons
                    name={isExpanded ? "chevron-down" : "chevron-forward"}
                    size={16}
                    color="#c4c8d1"
                  />
                </View>
                {isExpanded ? (
                  <ThemedText type="small" style={styles.faqAnswer}>
                    {faq.answer}
                  </ThemedText>
                ) : null}
              </Pressable>
            );
          })}
        </View>

        <View style={styles.helpCard}>
          <ThemedText type="smallBold" style={styles.helpCardTitle}>
            Still need help?
          </ThemedText>
          <ThemedText type="small" style={styles.helpCardSubtext}>
            Our support team is available Monday to Friday, 8 AM to 6 PM.
          </ThemedText>
          <Pressable style={styles.contactButton} onPress={handleEmailUs}>
            <ThemedText type="smallBold" style={styles.contactButtonText}>
              Contact Support
            </ThemedText>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f7f8fa" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
    backgroundColor: "#ffffff",
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
  headerTitle: { color: "#1a1c20", fontSize: 16, marginLeft: Spacing.three },
  headerSpacer: { flex: 1 },
  helpBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#e0f5f1",
    alignItems: "center",
    justifyContent: "center",
  },
  actionsRow: { flexDirection: "row", gap: Spacing.three },
  actionCard: {
    flex: 1,
    backgroundColor: "#ffffff",
    borderRadius: Spacing.three,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#eceef1",
    paddingVertical: Spacing.three,
    alignItems: "center",
    gap: Spacing.two,
  },
  actionIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  actionLabel: { color: "#1a1c20" },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: Spacing.three,
    padding: Spacing.four,
    gap: Spacing.three,
  },
  sectionLabel: { color: "#8b8f99", letterSpacing: 0.5, fontWeight: "700" },
  faqRow: {
    gap: Spacing.two,
    paddingVertical: Spacing.two,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#eceef1",
  },
  faqRowLast: { borderBottomWidth: 0, paddingBottom: 0 },
  faqQuestionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two,
  },
  faqQuestion: { flex: 1, color: "#1a1c20" },
  faqAnswer: { color: "#0d9488", paddingLeft: Spacing.four },
  helpCard: {
    backgroundColor: "#e0f5f1",
    borderRadius: Spacing.three,
    padding: Spacing.four,
    alignItems: "center",
    gap: Spacing.one,
  },
  helpCardTitle: { color: "#0d9488" },
  helpCardSubtext: { color: "#1a1c20", textAlign: "center" },
  contactButton: {
    backgroundColor: "#0d9488",
    borderRadius: Spacing.three,
    paddingVertical: Spacing.two + 2,
    paddingHorizontal: Spacing.four,
    marginTop: Spacing.two,
  },
  contactButtonText: { color: "#ffffff" },
});
