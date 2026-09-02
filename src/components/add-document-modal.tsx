import Ionicons from "@expo/vector-icons/Ionicons";
import { decode } from "base64-arraybuffer";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ThemedText } from "@/components/themed-text";
import { Spacing } from "@/constants/theme";
import { supabase } from "@/lib/supabase";

type FolderCategory = "academic" | "financial" | "identification" | "forms";

type FolderRow = {
  id: string;
  category: FolderCategory;
  name: string;
};

type PickedFile = {
  uri: string;
  name: string;
  mimeType: string;
  size: number | null;
  base64?: string;
};

const FOLDER_STYLE: Record<
  FolderCategory,
  { icon: keyof typeof Ionicons.glyphMap; color: string }
> = {
  academic: { icon: "school", color: "#8b5cf6" },
  financial: { icon: "card", color: "#10b981" },
  identification: { icon: "finger-print", color: "#3b82f6" },
  forms: { icon: "document-text", color: "#FF0800" },
};

// Must match the "documents" storage bucket's MIME allowlist and 10 MB limit.
const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/heic",
];
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

const TYPE_CHIPS: { label: string; mimeTypes: string[] }[] = [
  { label: "PDF", mimeTypes: ["application/pdf"] },
  { label: "JPG", mimeTypes: ["image/jpeg"] },
  { label: "PNG", mimeTypes: ["image/png"] },
];

function stripExtension(fileName: string) {
  const lastDot = fileName.lastIndexOf(".");
  return lastDot > 0 ? fileName.slice(0, lastDot) : fileName;
}

type AddDocumentModalProps = {
  visible: boolean;
  onClose: () => void;
  folders: FolderRow[];
  userId: string | undefined;
  onUploaded: () => void;
};

export function AddDocumentModal({
  visible,
  onClose,
  folders,
  userId,
  onUploaded,
}: AddDocumentModalProps) {
  const [pickedFile, setPickedFile] = useState<PickedFile | null>(null);
  const [documentName, setDocumentName] = useState("");
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  function reset() {
    setPickedFile(null);
    setDocumentName("");
    setSelectedFolderId(null);
    setIsUploading(false);
  }

  function handleClose() {
    if (isUploading) return;
    reset();
    onClose();
  }

  function applyPickedFile(file: PickedFile) {
    if (!ALLOWED_MIME_TYPES.includes(file.mimeType)) {
      Alert.alert(
        "Unsupported file type",
        "Please choose a PDF, JPG, PNG, or HEIC file.",
      );
      return;
    }
    if (file.size && file.size > MAX_FILE_SIZE_BYTES) {
      Alert.alert("File too large", "Documents must be 10 MB or smaller.");
      return;
    }
    setPickedFile(file);
    setDocumentName((current) => current || stripExtension(file.name));
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
      quality: 0.8,
      base64: true,
    });
    if (result.canceled) return;
    const asset = result.assets[0];
    applyPickedFile({
      uri: asset.uri,
      name: asset.fileName ?? `photo-${Date.now()}.jpg`,
      mimeType: asset.mimeType ?? "image/jpeg",
      size: asset.fileSize ?? null,
      base64: asset.base64 ?? undefined,
    });
  }

  async function handleUploadFile() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        "Photo library access needed",
        "Enable photo library access in your device settings to upload a photo.",
      );
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.8,
      base64: true,
    });
    if (result.canceled) return;
    const asset = result.assets[0];
    applyPickedFile({
      uri: asset.uri,
      name: asset.fileName ?? `image-${Date.now()}.jpg`,
      mimeType: asset.mimeType ?? "image/jpeg",
      size: asset.fileSize ?? null,
      base64: asset.base64 ?? undefined,
    });
  }

  async function handleFromFiles() {
    const result = await DocumentPicker.getDocumentAsync({
      type: ["application/pdf"],
      copyToCacheDirectory: true,
    });
    if (result.canceled) return;
    const asset = result.assets[0];
    applyPickedFile({
      uri: asset.uri,
      name: asset.name,
      mimeType: asset.mimeType ?? "application/octet-stream",
      size: asset.size ?? null,
    });
  }

  async function handleAddDocument() {
    if (!pickedFile || !documentName.trim() || !selectedFolderId || !userId) {
      return;
    }
    setIsUploading(true);
    try {
      const arrayBuffer = pickedFile.base64
        ? decode(pickedFile.base64)
        : await fetch(pickedFile.uri).then((r) => r.arrayBuffer());
      const extension = pickedFile.name.includes(".")
        ? pickedFile.name.split(".").pop()
        : "dat";
      const storagePath = `${userId}/${Date.now()}-${Math.round(Math.random() * 1e6)}.${extension}`;
      const uploadResult = await supabase.storage
        .from("documents")
        .upload(storagePath, arrayBuffer, {
          contentType: pickedFile.mimeType,
        });
      if (uploadResult.error) throw uploadResult.error;

      const insertResult = await supabase.from("documents").insert({
        user_id: userId,
        folder_id: selectedFolderId,
        name: documentName.trim(),
        file_path: storagePath,
        mime_type: pickedFile.mimeType,
        file_size: pickedFile.size,
      });
      if (insertResult.error) throw insertResult.error;

      reset();
      onUploaded();
      onClose();
    } catch (error) {
      Alert.alert(
        "Upload failed",
        error instanceof Error ? error.message : "Something went wrong.",
      );
      setIsUploading(false);
    }
  }

  const canSubmit =
    !!pickedFile && documentName.trim().length > 0 && !!selectedFolderId;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={handleClose}
    >
      <View style={styles.backdrop}>
        <SafeAreaView edges={["bottom"]} style={styles.sheet}>
          <View style={styles.grabber} />

          <View style={styles.headerRow}>
            <ThemedText type="title" style={styles.title}>
              Add Document
            </ThemedText>
            <Pressable
              onPress={handleClose}
              style={styles.closeButton}
              hitSlop={8}
            >
              <Ionicons name="close" size={18} color="#60646C" />
            </Pressable>
          </View>

          <View style={styles.sourceRow}>
            <Pressable style={styles.sourceButton} onPress={handleTakePhoto}>
              <View style={[styles.sourceIcon, { backgroundColor: "#3b82f6" }]}>
                <Ionicons name="camera" size={20} color="#ffffff" />
              </View>
              <ThemedText type="small" style={styles.sourceLabel}>
                Take Photo
              </ThemedText>
            </Pressable>

            <Pressable style={styles.sourceButton} onPress={handleUploadFile}>
              <View style={[styles.sourceIcon, { backgroundColor: "#0d9488" }]}>
                <Ionicons name="cloud-upload" size={20} color="#ffffff" />
              </View>
              <ThemedText type="small" style={styles.sourceLabel}>
                Upload File
              </ThemedText>
            </Pressable>

            <Pressable style={styles.sourceButton} onPress={handleFromFiles}>
              <View style={[styles.sourceIcon, { backgroundColor: "#8b5cf6" }]}>
                <Ionicons name="folder" size={20} color="#ffffff" />
              </View>
              <ThemedText type="small" style={styles.sourceLabel}>
                From Files
              </ThemedText>
            </Pressable>
          </View>

          <ThemedText type="small" style={styles.fieldLabel}>
            Document Name
          </ThemedText>
          <TextInput
            value={documentName}
            onChangeText={setDocumentName}
            placeholder="e.g. Good Moral Certificate"
            placeholderTextColor="#8b8f99"
            style={styles.textInput}
          />

          <ThemedText type="small" style={styles.fieldLabel}>
            File Type
          </ThemedText>
          <View style={styles.chipRow}>
            {TYPE_CHIPS.map((chip) => {
              const isActive =
                !!pickedFile && chip.mimeTypes.includes(pickedFile.mimeType);
              return (
                <View
                  key={chip.label}
                  style={[styles.typeChip, isActive && styles.typeChipActive]}
                >
                  <ThemedText
                    type="smallBold"
                    style={
                      isActive ? styles.typeChipTextActive : styles.typeChipText
                    }
                  >
                    {chip.label}
                  </ThemedText>
                </View>
              );
            })}
          </View>

          <ThemedText type="small" style={styles.fieldLabel}>
            Folder
          </ThemedText>
          <View style={styles.chipRow}>
            {folders.map((folder) => {
              const style = FOLDER_STYLE[folder.category];
              const isActive = selectedFolderId === folder.id;
              return (
                <Pressable
                  key={folder.id}
                  onPress={() => setSelectedFolderId(folder.id)}
                  style={[
                    styles.folderChip,
                    isActive && {
                      borderColor: style.color,
                      backgroundColor: `${style.color}1a`,
                    },
                  ]}
                >
                  <Ionicons name={style.icon} size={14} color={style.color} />
                  <ThemedText
                    type="small"
                    style={
                      isActive
                        ? { color: style.color, fontWeight: "600" }
                        : styles.folderChipText
                    }
                  >
                    {folder.name}
                  </ThemedText>
                </Pressable>
              );
            })}
          </View>

          <Pressable
            style={[
              styles.submitButton,
              !canSubmit && styles.submitButtonDisabled,
            ]}
            onPress={handleAddDocument}
            disabled={!canSubmit || isUploading}
          >
            {isUploading ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <ThemedText type="smallBold" style={styles.submitButtonText}>
                Add Document
              </ThemedText>
            )}
          </Pressable>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: "#ffffff",
    borderTopLeftRadius: Spacing.four,
    borderTopRightRadius: Spacing.four,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.two,
    gap: Spacing.two,
  },
  grabber: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#e2e4e8",
    alignSelf: "center",
    marginBottom: Spacing.two,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  title: { fontSize: 20, lineHeight: 26, color: "#1a1c20" },
  closeButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#f0f0f3",
    alignItems: "center",
    justifyContent: "center",
  },
  sourceRow: { flexDirection: "row", gap: Spacing.two, marginTop: Spacing.two },
  sourceButton: {
    flex: 1,
    alignItems: "center",
    gap: 6,
    paddingVertical: Spacing.three,
    borderRadius: Spacing.three,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#eceef1",
  },
  sourceIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  sourceLabel: { color: "#1a1c20" },
  fieldLabel: { color: "#60646C", marginTop: Spacing.two },
  textInput: {
    backgroundColor: "#f7f8fa",
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    height: 44,
    fontSize: 14,
    color: "#1a1c20",
  },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: Spacing.two },
  typeChip: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
    borderRadius: Spacing.two,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#e2e4e8",
  },
  typeChipActive: { backgroundColor: "#1a1c20", borderColor: "#1a1c20" },
  typeChipText: { color: "#8b8f99" },
  typeChipTextActive: { color: "#ffffff" },
  folderChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
    borderRadius: Spacing.two,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#e2e4e8",
  },
  folderChipText: { color: "#60646C" },
  submitButton: {
    backgroundColor: "#0d9488",
    borderRadius: Spacing.three,
    height: 50,
    alignItems: "center",
    justifyContent: "center",
    marginTop: Spacing.two,
  },
  submitButtonDisabled: { opacity: 0.5 },
  submitButtonText: { color: "#ffffff", fontSize: 16 },
});
