import Ionicons from "@expo/vector-icons/Ionicons";
import { useState } from "react";
import {
  Pressable,
  StyleSheet,
  TextInput,
  TextInputProps,
  View,
} from "react-native";

import { ThemedText } from "@/components/themed-text";
import { Spacing } from "@/constants/theme";

type AuthTextFieldProps = TextInputProps & {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  isPassword?: boolean;
};

export function AuthTextField({
  label,
  icon,
  isPassword,
  ...inputProps
}: AuthTextFieldProps) {
  const [hidden, setHidden] = useState(isPassword);

  return (
    <View style={styles.wrapper}>
      <ThemedText type="small" style={styles.label}>
        {label}
      </ThemedText>
      <View style={styles.inputRow}>
        <Ionicons
          name={icon}
          size={18}
          color="#8b8f99"
          style={styles.leadingIcon}
        />
        <TextInput
          style={styles.input}
          placeholderTextColor="#9aa0ab"
          secureTextEntry={hidden}
          autoCapitalize="none"
          {...inputProps}
        />
        {isPassword && (
          <Pressable onPress={() => setHidden((prev) => !prev)} hitSlop={8}>
            <Ionicons
              name={hidden ? "eye-outline" : "eye-off-outline"}
              size={18}
              color="#8b8f99"
            />
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { gap: Spacing.one },
  label: { color: "#3a3f4b", fontWeight: "600" },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f0f1f4",
    borderRadius: Spacing.three,
    paddingHorizontal: Spacing.three,
    height: 48,
    gap: Spacing.two,
  },
  leadingIcon: {},
  input: {
    flex: 1,
    fontSize: 15,
    color: "#1a1c20",
  },
});
