import Ionicons from "@expo/vector-icons/Ionicons";
import { decode } from "base64-arraybuffer";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ThemedText } from "@/components/themed-text";
import { BottomTabInset, Spacing } from "@/constants/theme";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/providers/auth-provider";

type ProfileRow = {
  full_name: string | null;
  student_id: string | null;
  program: string | null;
  avatar_url: string | null;
};

type PickedAvatar = {
  uri: string;
  base64: string;
  mimeType: string;
};

function getInitials(name: string, email: string | undefined) {
  const source = name.trim() || email || "?";
  return source
    .split(/\s+/)
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export default function EditProfileScreen() {
  const router = useRouter();
  const { session } = useAuth();

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [fullName, setFullName] = useState("");
  const [studentId, setStudentId] = useState("");
  const [program, setProgram] = useState("");
  const [existingAvatarUrl, setExistingAvatarUrl] = useState<string | null>(
    null,
  );
  const [pickedAvatar, setPickedAvatar] = useState<PickedAvatar | null>(null);

  const loadProfile = useCallback(async () => {
    if (!session) return;
    setIsLoading(true);

    const { data } = await supabase
      .from("profiles")
      .select("full_name, student_id, program, avatar_url")
      .eq("id", session.user.id)
      .single<ProfileRow>();

    setFullName(data?.full_name ?? "");
    setStudentId(data?.student_id ?? "");
    setProgram(data?.program ?? "");
    setExistingAvatarUrl(data?.avatar_url ?? null);
    setIsLoading(false);
  }, [session]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  function handleChangePhoto() {
    Alert.alert("Change Photo", undefined, [
      { text: "Take Photo", onPress: handleTakePhoto },
      { text: "Choose from Library", onPress: handlePickFromLibrary },
      { text: "Cancel", style: "cancel" },
    ]);
  }

  async function handleTakePhoto() {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        "Camera access needed",
        "Enable camera access in your device settings to take a photo.",
      );
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      quality: 0.7,
      base64: true,
      allowsEditing: true,
      aspect: [1, 1],
    });
    if (result.canceled) return;
    applyPickedAsset(result.assets[0]);
  }

  async function handlePickFromLibrary() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        "Photo library access needed",
        "Enable photo library access in your device settings to choose a photo.",
      );
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.7,
      base64: true,
      allowsEditing: true,
      aspect: [1, 1],
    });
    if (result.canceled) return;
    applyPickedAsset(result.assets[0]);
  }

  function applyPickedAsset(asset: ImagePicker.ImagePickerAsset) {
    if (!asset.base64) return;
    setPickedAvatar({
      uri: asset.uri,
      base64: asset.base64,
      mimeType: asset.mimeType ?? "image/jpeg",
    });
  }

  async function handleSave() {
    if (!session) return;
    setIsSaving(true);

    // avatars is a separate PUBLIC bucket from "documents" (which is private
    // and only ever served through short-lived signed URLs elsewhere in the
    // app). The Profile screen renders avatar_url directly with no signing
    // step, so it needs a URL that stays valid indefinitely - hence a public
    // bucket rather than reusing "documents".
    let avatarUrl = existingAvatarUrl;
    if (pickedAvatar) {
      const extension = pickedAvatar.mimeType.split("/").pop() || "jpg";
      const storagePath = `${session.user.id}/${Date.now()}.${extension}`;
      const uploadResult = await supabase.storage
        .from("avatars")
        .upload(storagePath, decode(pickedAvatar.base64), {
          contentType: pickedAvatar.mimeType,
          upsert: true,
        });

      if (uploadResult.error) {
        setIsSaving(false);
        Alert.alert("Couldn't upload photo", uploadResult.error.message);
        return;
      }

      avatarUrl = supabase.storage.from("avatars").getPublicUrl(storagePath)
        .data.publicUrl;
    }

    const { error } = await supabase
      .from("profiles")
      .update({
        full_name: fullName.trim() || null,
        student_id: studentId.trim() || null,
        program: program.trim() || null,
        avatar_url: avatarUrl,
        updated_at: new Date().toISOString(),
      })
      .eq("id", session.user.id);

    setIsSaving(false);

    if (error) {
      Alert.alert("Couldn't save changes", error.message);
      return;
    }

    router.back();
  }

  const avatarSource = pickedAvatar?.uri ?? existingAvatarUrl;

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
          Edit Profile
        </ThemedText>
        <View style={styles.headerSpacer} />
        <View style={styles.personBadge}>
          <Ionicons name="person" size={16} color="#0d9488" />
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{
          padding: Spacing.four,
          paddingBottom: BottomTabInset + Spacing.four,
          gap: Spacing.four,
        }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {isLoading ? (
          <ActivityIndicator
            color="#0d9488"
            style={{ marginTop: Spacing.four }}
          />
        ) : (
          <>
            <View style={styles.avatarSection}>
              <Pressable onPress={handleChangePhoto}>
                {avatarSource ? (
                  <Image source={{ uri: avatarSource }} style={styles.avatar} />
                ) : (
                  <View style={styles.avatarFallback}>
                    <ThemedText style={styles.avatarInitials}>
                      {getInitials(fullName, session?.user.email)}
                    </ThemedText>
                  </View>
                )}
                <View style={styles.cameraBadge}>
                  <Ionicons name="camera" size={14} color="#ffffff" />
                </View>
              </Pressable>
              <Pressable onPress={handleChangePhoto}>
                <ThemedText type="link" style={styles.changePhotoText}>
                  Change Photo
                </ThemedText>
              </Pressable>
            </View>

            <View style={styles.card}>
              <View style={styles.fieldGroup}>
                <ThemedText type="smallBold" style={styles.fieldLabel}>
                  Full Name
                </ThemedText>
                <TextInput
                  value={fullName}
                  onChangeText={setFullName}
                  placeholder="Enter your full name"
                  placeholderTextColor="#a5a9b1"
                  style={styles.input}
                />
              </View>

              <View style={styles.fieldGroup}>
                <ThemedText type="smallBold" style={styles.fieldLabel}>
                  Student ID
                </ThemedText>
                <TextInput
                  value={studentId}
                  onChangeText={setStudentId}
                  placeholder="e.g. 2023-12345"
                  placeholderTextColor="#a5a9b1"
                  style={styles.input}
                />
              </View>

              <View style={styles.fieldGroup}>
                <ThemedText type="smallBold" style={styles.fieldLabel}>
                  Program
                </ThemedText>
                <TextInput
                  value={program}
                  onChangeText={setProgram}
                  placeholder="e.g. BS Information Technology"
                  placeholderTextColor="#a5a9b1"
                  style={styles.input}
                />
              </View>
            </View>

            <Pressable
              onPress={handleSave}
              disabled={isSaving}
              style={[styles.saveButton, isSaving && styles.buttonDisabled]}
            >
              {isSaving ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <ThemedText type="smallBold" style={styles.saveButtonText}>
                  Save Changes
                </ThemedText>
              )}
            </Pressable>
          </>
        )}
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
  personBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#e0f5f1",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarSection: { alignItems: "center", gap: Spacing.two },
  avatar: { width: 88, height: 88, borderRadius: 44 },
  avatarFallback: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: "#0d9488",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitials: { color: "#ffffff", fontWeight: "700", fontSize: 26 },
  cameraBadge: {
    position: "absolute",
    right: -2,
    bottom: -2,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#0d9488",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#f7f8fa",
  },
  changePhotoText: { color: "#0d9488", fontWeight: "600" },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: Spacing.three,
    padding: Spacing.four,
    gap: Spacing.three,
  },
  fieldGroup: { gap: Spacing.one },
  fieldLabel: { color: "#1a1c20" },
  input: {
    backgroundColor: "#f4f4fa",
    borderRadius: Spacing.two + 2,
    paddingHorizontal: Spacing.three,
    height: 46,
    fontSize: 14,
    color: "#1a1c20",
  },
  saveButton: {
    backgroundColor: "#0d9488",
    borderRadius: Spacing.three,
    paddingVertical: Spacing.three,
    alignItems: "center",
  },
  buttonDisabled: { opacity: 0.7 },
  saveButtonText: { color: "#ffffff", fontSize: 15 },
});
