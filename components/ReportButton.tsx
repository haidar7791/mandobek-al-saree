import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import {
  REPORT_REASONS,
  submitReport,
  type ReportReason,
  type ReportTargetType,
} from "@/lib/reporting";

const C = Colors.light;

type ReportButtonProps = {
  targetType: ReportTargetType;
  targetId: string;
  targetName?: string;
  variant?: "light" | "dark";
  style?: StyleProp<ViewStyle>;
};

export default function ReportButton({
  targetType,
  targetId,
  targetName,
  variant = "light",
  style,
}: ReportButtonProps) {
  const [visible, setVisible] = useState(false);
  const [selectedReason, setSelectedReason] = useState<ReportReason | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const close = () => {
    if (submitting) return;
    setVisible(false);
    setSelectedReason(null);
  };

  const handleSubmit = async () => {
    const reason = REPORT_REASONS.find((item) => item.value === selectedReason);
    if (!reason || submitting) return;

    setSubmitting(true);
    try {
      await submitReport({
        targetType,
        targetId,
        targetName,
        reason: reason.value,
        reasonLabel: reason.label,
      });
      setVisible(false);
      setSelectedReason(null);
      Alert.alert("تم إرسال البلاغ", "شكراً لمساعدتنا في الحفاظ على أمان المجتمع.");
    } catch (error) {
      console.error("submit report failed:", error);
      Alert.alert(
        "تعذّر إرسال البلاغ",
        error instanceof Error && error.message === "REPORT_AUTH_REQUIRED"
          ? "يجب تسجيل الدخول لإرسال بلاغ."
          : "حدث خطأ، يرجى المحاولة مرة أخرى."
      );
    } finally {
      setSubmitting(false);
    }
  };

  const dark = variant === "dark";

  return (
    <>
      <Pressable
        style={[
          styles.button,
          dark ? styles.darkButton : styles.lightButton,
          style,
        ]}
        onPress={() => setVisible(true)}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="الإبلاغ عن المحتوى"
      >
        <Feather name="flag" size={17} color={dark ? "#FFF" : C.textSecondary} />
      </Pressable>

      <Modal
        visible={visible}
        transparent
        animationType="fade"
        onRequestClose={close}
      >
        <View style={styles.modalOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={close} />
          <View style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <View style={styles.titleIcon}>
                <Feather name="flag" size={18} color={C.accent} />
              </View>
              <View style={styles.titleWrap}>
                <Text style={styles.title}>الإبلاغ عن المحتوى</Text>
                <Text style={styles.subtitle}>اختر السبب الذي ينطبق على هذا المحتوى</Text>
              </View>
              <Pressable onPress={close} hitSlop={8} accessibilityLabel="إغلاق">
                <Feather name="x" size={21} color={C.textMuted} />
              </Pressable>
            </View>

            <View style={styles.reasonList}>
              {REPORT_REASONS.map((reason) => {
                const selected = selectedReason === reason.value;
                return (
                  <Pressable
                    key={reason.value}
                    style={[styles.reasonRow, selected && styles.reasonRowSelected]}
                    onPress={() => setSelectedReason(reason.value)}
                    disabled={submitting}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: selected }}
                  >
                    <View style={styles.reasonText}>
                      <Text style={styles.reasonLabel}>{reason.label}</Text>
                      <Text style={styles.reasonDescription}>{reason.description}</Text>
                    </View>
                    <View style={[styles.radio, selected && styles.radioSelected]}>
                      {selected && <View style={styles.radioDot} />}
                    </View>
                  </Pressable>
                );
              })}
            </View>

            <View style={styles.actions}>
              <Pressable style={styles.cancelButton} onPress={close} disabled={submitting}>
                <Text style={styles.cancelText}>إلغاء</Text>
              </Pressable>
              <Pressable
                style={[styles.submitButton, (!selectedReason || submitting) && styles.disabled]}
                onPress={handleSubmit}
                disabled={!selectedReason || submitting}
              >
                {submitting ? (
                  <ActivityIndicator size="small" color={C.primary} />
                ) : (
                  <Text style={styles.submitText}>إرسال البلاغ</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  lightButton: {
    backgroundColor: "rgba(255,255,255,0.92)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.12,
    shadowRadius: 3,
    elevation: 3,
  },
  darkButton: {
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(7,15,35,0.62)",
    justifyContent: "center",
    padding: 18,
  },
  sheet: {
    width: "100%",
    maxWidth: 520,
    alignSelf: "center",
    backgroundColor: C.card,
    borderRadius: 20,
    padding: 18,
    gap: 14,
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  titleIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#FFF8EC",
    alignItems: "center",
    justifyContent: "center",
  },
  titleWrap: { flex: 1, alignItems: "flex-end" },
  title: { fontSize: 17, fontFamily: undefined, color: C.text, textAlign: "right" },
  subtitle: { marginTop: 3, fontSize: 12, fontFamily: undefined, color: C.textMuted, textAlign: "right" },
  reasonList: { gap: 8 },
  reasonRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  reasonRowSelected: {
    borderColor: C.accent,
    backgroundColor: "#FFF8EC",
  },
  reasonText: { flex: 1, alignItems: "flex-end" },
  reasonLabel: { fontSize: 14, fontFamily: undefined, color: C.text, textAlign: "right" },
  reasonDescription: { marginTop: 2, fontSize: 11, fontFamily: undefined, color: C.textMuted, textAlign: "right" },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: C.textMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  radioSelected: { borderColor: C.accent },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: C.accent },
  actions: { flexDirection: "row", gap: 10 },
  cancelButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.inputBg,
  },
  cancelText: { fontSize: 14, fontFamily: undefined, color: C.textSecondary },
  submitButton: {
    flex: 1.4,
    minHeight: 48,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.accent,
  },
  submitText: { fontSize: 14, fontFamily: undefined, color: C.primary },
  disabled: { opacity: 0.5 },
});