/**
 * OtpInput.tsx — shared 6-digit OTP box component
 */
import React, { useRef } from "react";
import { View, Text, TextInput, Pressable, StyleSheet } from "react-native";
import Colors from "@/constants/colors";

const C = Colors.light;

export default function OtpInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const inputRef = useRef<TextInput>(null);

  return (
    <Pressable onPress={() => inputRef.current?.focus()} style={styles.row}>
      {Array.from({ length: 6 }).map((_, i) => {
        const char = value[i] ?? "";
        const active = value.length === i;
        return (
          <View
            key={i}
            style={[
              styles.box,
              char ? styles.boxFilled : active ? styles.boxActive : null,
            ]}
          >
            <Text style={styles.char}>{char}</Text>
          </View>
        );
      })}
      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={(v) => onChange(v.replace(/[^0-9]/g, "").slice(0, 6))}
        keyboardType="number-pad"
        maxLength={6}
        style={styles.hidden}
        caretHidden
        autoFocus
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 10,
    marginVertical: 8,
    position: "relative",
  },
  box: {
    width: 44,
    height: 52,
    borderRadius: 10,
    backgroundColor: C.inputBg,
    borderWidth: 1.5,
    borderColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
  },
  boxActive: {
    borderColor: C.accent,
    backgroundColor: "rgba(201,168,76,0.06)",
  },
  boxFilled: { borderColor: C.accent, backgroundColor: "#FFF" },
  char: { fontSize: 20, fontFamily: "Cairo_700Bold", color: C.text },
  hidden: {
    position: "absolute",
    opacity: 0,
    width: 1,
    height: 1,
  },
});
