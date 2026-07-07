import React, { useRef, useState } from "react";
import {
  Modal,
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Platform,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import {
  PhoneAuthProvider,
  RecaptchaVerifier,
  linkWithPhoneNumber,
  unlink,
  type ConfirmationResult,
} from "firebase/auth";
import { auth } from "@/lib/firebase";
import { setUserProfile } from "@/lib/db_logic";
import Colors from "@/constants/colors";

const C = Colors.light;

interface PhoneVerificationModalProps {
  visible: boolean;
  onClose: () => void;
  userId: string;
  initialPhone?: string;
  onVerified: (phone: string) => void;
}

/** Normalizes an Iraqi phone number (local "07XXXXXXXXX" or already E.164) to +964XXXXXXXXXX. */
function toE164Iraq(input: string): string | null {
  const digits = input.replace(/[^\d+]/g, "");
  if (digits.startsWith("+964") && digits.length === 14) return digits;
  if (digits.startsWith("964") && digits.length === 13) return `+${digits}`;
  if (digits.startsWith("0") && digits.length === 11) return `+964${digits.slice(1)}`;
  if (digits.length === 10 && digits.startsWith("7")) return `+964${digits}`;
  return null;
}

function mapAuthError(code: string): string {
  switch (code) {
    case "auth/invalid-phone-number":
      return "رقم الهاتف غير صالح، تأكد من الصيغة (07xxxxxxxxx)";
    case "auth/too-many-requests":
      return "تم إرسال عدد كبير من الطلبات، حاول لاحقاً";
    case "auth/credential-already-in-use":
    case "auth/provider-already-linked":
      return "رقم الهاتف هذا مرتبط بحساب آخر بالفعل";
    case "auth/invalid-verification-code":
      return "رمز التأكيد غير صحيح";
    case "auth/code-expired":
      return "انتهت صلاحية الرمز، أعد الإرسال";
    case "auth/captcha-check-failed":
      return "تعذّر التحقق الأمني (reCAPTCHA)، حاول مرة أخرى";
    default:
      return "حدث خطأ غير متوقع، حاول مرة أخرى";
  }
}

export default function PhoneVerificationModal({
  visible,
  onClose,
  userId,
  initialPhone = "",
  onVerified,
}: PhoneVerificationModalProps) {
  const webRecaptchaVerifier = useRef<RecaptchaVerifier | null>(null);

  const [step, setStep] = useState<"input" | "code">("input");
  const [phoneInput, setPhoneInput] = useState(initialPhone);
  const [code, setCode] = useState("");
  const [sending, setSending] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState("");
  const [confirmationResult, setConfirmationResult] = useState<ConfirmationResult | null>(null);
  const [pendingE164, setPendingE164] = useState("");

  const reset = () => {
    setStep("input");
    setCode("");
    setError("");
    setConfirmationResult(null);
    setSending(false);
    setConfirming(false);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleSendCode = async () => {
    setError("");
    const e164 = toE164Iraq(phoneInput);
    if (!e164) {
      setError("يرجى إدخال رقم هاتف عراقي صحيح، مثال: 07701234567");
      return;
    }

    setSending(true);
    try {
      const user = auth.currentUser;
      if (!user) throw new Error("not authenticated");

      try {
        await unlink(user, PhoneAuthProvider.PROVIDER_ID);
      } catch {
        // no previously linked phone provider — safe to ignore
      }

      let appVerifier: RecaptchaVerifier | undefined;
      if (Platform.OS === "web") {
        if (!webRecaptchaVerifier.current) {
          webRecaptchaVerifier.current = new RecaptchaVerifier(
            auth,
            "recaptcha-container-modal",
            { size: "invisible" }
          );
        }
        appVerifier = webRecaptchaVerifier.current;
      }
      // On native (iOS/Android), Firebase JS SDK handles verification
      // automatically via APNs / Play Integrity — no explicit verifier needed.

      const result = await linkWithPhoneNumber(user, e164, appVerifier as any);
      setConfirmationResult(result);
      setPendingE164(e164);
      setStep("code");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err: any) {
      const code = err?.code || "";
      setError(mapAuthError(code));
    } finally {
      setSending(false);
    }
  };

  const handleConfirmCode = async () => {
    if (!confirmationResult) return;
    if (code.trim().length < 6) {
      setError("يرجى إدخال الرمز المكوّن من 6 أرقام");
      return;
    }
    setError("");
    setConfirming(true);
    try {
      await confirmationResult.confirm(code.trim());
      await setUserProfile(userId, {
        phone: pendingE164,
        isPhoneVerified: true,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onVerified(pendingE164);
      reset();
      onClose();
    } catch (err: any) {
      setError(mapAuthError(err?.code || ""));
    } finally {
      setConfirming(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.handle} />

          <View style={styles.headerRow}>
            <Text style={styles.title}>
              {step === "input" ? "تأكيد رقم الهاتف" : "أدخل رمز التأكيد"}
            </Text>
            <Pressable onPress={handleClose} hitSlop={10}>
              <Feather name="x" size={22} color={C.textSecondary} />
            </Pressable>
          </View>

          {step === "input" ? (
            <>
              <Text style={styles.hint}>
                سنرسل رمز تأكيد مكوّن من 6 أرقام عبر رسالة نصية (SMS) إلى رقمك لتفعيل حسابك.
              </Text>
              <View style={styles.inputRow}>
                <Feather name="phone" size={17} color={C.textSecondary} />
                <TextInput
                  style={styles.input}
                  placeholder="07xxxxxxxxx"
                  placeholderTextColor={C.textMuted}
                  value={phoneInput}
                  onChangeText={setPhoneInput}
                  keyboardType="phone-pad"
                  textAlign="right"
                  editable={!sending}
                />
              </View>
              {!!error && <Text style={styles.errorText}>{error}</Text>}
              <Pressable
                style={[styles.actionBtn, sending && { opacity: 0.6 }]}
                onPress={handleSendCode}
                disabled={sending}
              >
                {sending ? (
                  <ActivityIndicator color="#FFF" />
                ) : (
                  <Text style={styles.actionBtnText}>إرسال رمز التأكيد</Text>
                )}
              </Pressable>
            </>
          ) : (
            <>
              <Text style={styles.hint}>
                تم إرسال رمز التأكيد إلى {pendingE164}. أدخله أدناه لإتمام التفعيل.
              </Text>
              <View style={styles.inputRow}>
                <Feather name="lock" size={17} color={C.textSecondary} />
                <TextInput
                  style={styles.input}
                  placeholder="------"
                  placeholderTextColor={C.textMuted}
                  value={code}
                  onChangeText={setCode}
                  keyboardType="number-pad"
                  textAlign="center"
                  maxLength={6}
                  editable={!confirming}
                />
              </View>
              {!!error && <Text style={styles.errorText}>{error}</Text>}
              <Pressable
                style={[styles.actionBtn, confirming && { opacity: 0.6 }]}
                onPress={handleConfirmCode}
                disabled={confirming}
              >
                {confirming ? (
                  <ActivityIndicator color="#FFF" />
                ) : (
                  <Text style={styles.actionBtnText}>تأكيد الرمز</Text>
                )}
              </Pressable>
              <Pressable
                style={styles.secondaryBtn}
                onPress={() => {
                  setStep("input");
                  setCode("");
                  setError("");
                }}
                disabled={confirming}
              >
                <Text style={styles.secondaryBtnText}>تغيير الرقم أو إعادة الإرسال</Text>
              </Pressable>
            </>
          )}
        </View>
      </View>

      {Platform.OS === "web" && (
        <View nativeID="recaptcha-container-modal" />
      )}
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: "#FFF",
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    padding: 20,
    paddingBottom: 32,
    gap: 14,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#E5E7EB",
    alignSelf: "center",
    marginBottom: 4,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: {
    fontSize: 17,
    fontFamily: "Cairo_700Bold",
    color: C.text,
  },
  hint: {
    fontSize: 13,
    fontFamily: "Cairo_400Regular",
    color: C.textSecondary,
    textAlign: "right",
    lineHeight: 20,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1.5,
    borderColor: C.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  input: {
    flex: 1,
    fontSize: 15,
    fontFamily: "Cairo_600SemiBold",
    color: C.text,
  },
  errorText: {
    fontSize: 12.5,
    fontFamily: "Cairo_600SemiBold",
    color: "#DC2626",
    textAlign: "right",
  },
  actionBtn: {
    backgroundColor: C.accent,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  actionBtnText: {
    fontSize: 15,
    fontFamily: "Cairo_700Bold",
    color: "#FFF",
  },
  secondaryBtn: {
    alignItems: "center",
    paddingVertical: 8,
  },
  secondaryBtnText: {
    fontSize: 13,
    fontFamily: "Cairo_600SemiBold",
    color: C.textSecondary,
  },
});
