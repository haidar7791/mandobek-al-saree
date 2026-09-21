import React, { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable, Alert, ActivityIndicator, TextInput, Modal } from "react-native";
import { Image } from "expo-image";
import { Feather } from "@expo/vector-icons";
import { useLocalSearchParams } from "expo-router";
import { goBack, navigateWithHomeBase } from "@/lib/navigation";
import * as ImagePicker from "expo-image-picker";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { auth } from "../lib/firebase";
import { getGroupDetails, updateGroupProfile, uploadGroupPhoto, leaveGroup, type GroupDetails } from "../lib/db_logic";
import Colors from "@/constants/colors";

const C = Colors.light;

export default function GroupDetailsScreen() {
  const { chatId } = useLocalSearchParams<{ chatId: string }>();
  const insets = useSafeAreaInsets();
  const [group, setGroup] = useState<GroupDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [renameVisible, setRenameVisible] = useState(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  const uid = auth.currentUser?.uid;
  const isManager = !!uid && !!group && (group.adminIds.includes(uid) || group.moderatorIds.includes(uid));

  const load = useCallback(async () => {
    if (!chatId) return;
    try { setGroup(await getGroupDetails(chatId)); }
    catch { Alert.alert("خطأ", "تعذّر تحميل بيانات المجموعة"); }
    finally { setLoading(false); }
  }, [chatId]);

  useEffect(() => { load(); }, [load]);

  const changePhoto = async () => {
    if (!chatId || !uid || !isManager || saving) return;
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.85, allowsEditing: true, aspect: [1, 1] });
    if (result.canceled || !result.assets?.[0]) return;
    setSaving(true);
    try { await uploadGroupPhoto(chatId, uid, result.assets[0].uri); await load(); }
    catch { Alert.alert("خطأ", "تعذّر تغيير صورة المجموعة"); }
    finally { setSaving(false); }
  };

  const rename = async () => {
    if (!chatId || !uid || !isManager || !name.trim() || saving) return;
    setSaving(true);
    try { await updateGroupProfile(chatId, uid, { groupName: name.trim() }); setRenameVisible(false); await load(); }
    catch { Alert.alert("خطأ", "تعذّر تغيير اسم المجموعة"); }
    finally { setSaving(false); }
  };

  const handleLeave = () => {
    if (!chatId || !uid) return;
    if (group?.createdBy === uid) {
      Alert.alert("مغادرة المجموعة", "مسؤول المجموعة لا يمكنه مغادرتها حالياً.");
      return;
    }
    Alert.alert("مغادرة المجموعة", "هل تريد مغادرة هذه المجموعة؟ لن ترى محادثاتها بعد المغادرة.", [
      { text: "إلغاء", style: "cancel" },
      { text: "مغادرة", style: "destructive", onPress: async () => {
        try {
          await leaveGroup(chatId, uid);
          navigateWithHomeBase("/messages" as any);
        }
        catch { Alert.alert("خطأ", "تعذّرت مغادرة المجموعة"); }
      } },
    ]);
  };

  if (loading || !group) return <View style={styles.center}><ActivityIndicator size="large" color={C.accent} /></View>;

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable style={styles.back} onPress={goBack}><Feather name="chevron-right" size={24} color="#FFF" /></Pressable>
        <Text style={styles.headerTitle}>معلومات المجموعة</Text>
        <View style={{ width: 38 }} />
      </View>

      <View style={styles.content}>
        <Pressable style={styles.cover} onPress={changePhoto} disabled={!isManager || saving}>
          {group.groupPhotoUri ? <Image source={{ uri: group.groupPhotoUri }} style={styles.coverImage} contentFit="cover" /> : <Feather name="users" size={46} color={C.accent} />}
          {isManager && <View style={styles.photoEdit}><Feather name="camera" size={18} color="#FFF" /></View>}
        </Pressable>

        <View style={styles.nameRow}>
          <Text style={styles.groupName} numberOfLines={2}>{group.groupName}</Text>
          {isManager && <Pressable style={styles.editName} onPress={() => { setName(group.groupName); setRenameVisible(true); }}><Text style={styles.pencil}>✏️</Text></Pressable>}
        </View>
        <Text style={styles.count}>{group.participants.length} عضو</Text>

        <View style={styles.options}>
          <Pressable style={styles.option} onPress={() => navigateWithHomeBase({ pathname: "/group-members", params: { chatId } } as any)}>
            <View style={styles.optionIcon}><Feather name="users" size={20} color={C.accent} /></View>
            <View style={styles.optionText}><Text style={styles.optionTitle}>عرض أعضاء المجموعة</Text><Text style={styles.optionSub}>عرض الأعضاء والملفات الشخصية وإدارة الأعضاء</Text></View>
            <Feather name="chevron-left" size={20} color={C.textMuted} />
          </Pressable>
          <Pressable style={styles.option} onPress={() => navigateWithHomeBase({ pathname: "/group-media", params: { chatId } } as any)}>
            <View style={styles.optionIcon}><Feather name="image" size={20} color={C.accent} /></View>
            <View style={styles.optionText}><Text style={styles.optionTitle}>عرض الوسائط</Text><Text style={styles.optionSub}>جميع الصور والفيديوهات المرسلة في المجموعة</Text></View>
            <Feather name="chevron-left" size={20} color={C.textMuted} />
          </Pressable>
          <Pressable style={styles.option} onPress={() => navigateWithHomeBase({ pathname: "/group-members", params: { chatId, add: "1" } } as any)}>
            <View style={styles.optionIcon}><Feather name="user-plus" size={20} color={C.accent} /></View>
            <View style={styles.optionText}><Text style={styles.optionTitle}>إضافة أعضاء للمجموعة</Text><Text style={styles.optionSub}>يمكن لأي عضو في المجموعة إضافة مستخدمين</Text></View>
            <Feather name="chevron-left" size={20} color={C.textMuted} />
          </Pressable>
          <Pressable style={[styles.option, styles.leaveOption]} onPress={handleLeave}>
            <View style={[styles.optionIcon, styles.leaveIcon]}><Feather name="log-out" size={20} color="#ef4444" /></View>
            <View style={styles.optionText}><Text style={[styles.optionTitle, { color: "#ef4444" }]}>مغادرة المجموعة</Text><Text style={styles.optionSub}>لن ترى محادثات المجموعة بعد المغادرة</Text></View>
            <Feather name="chevron-left" size={20} color="#ef4444" />
          </Pressable>
        </View>
      </View>

      <Modal visible={renameVisible} transparent animationType="fade" onRequestClose={() => setRenameVisible(false)}>
        <View style={styles.backdrop}><View style={styles.renameBox}>
          <View style={styles.modalHeader}><Text style={styles.modalTitle}>تغيير اسم المجموعة</Text><Pressable onPress={() => setRenameVisible(false)}><Feather name="x" size={22} color={C.textMuted} /></Pressable></View>
          <TextInput value={name} onChangeText={setName} maxLength={60} autoFocus placeholder="اسم المجموعة" placeholderTextColor={C.textMuted} textAlign="right" style={styles.input} />
          <Pressable style={styles.save} onPress={rename} disabled={saving}><Text style={styles.saveText}>{saving ? "جارٍ الحفظ..." : "حفظ"}</Text></Pressable>
        </View></View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.background }, center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: C.background },
  header: { backgroundColor: "#0D1B3E", flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 14, paddingBottom: 14 },
  back: { width: 38, height: 38, borderRadius: 10, backgroundColor: "rgba(255,255,255,.12)", alignItems: "center", justifyContent: "center" }, headerTitle: { color: "#FFF", fontFamily: undefined, fontSize: 17 },
  content: { padding: 18 }, cover: { alignSelf: "center", width: 112, height: 112, borderRadius: 56, backgroundColor: "rgba(201,168,76,.13)", alignItems: "center", justifyContent: "center", overflow: "hidden", position: "relative" }, coverImage: { width: 112, height: 112 }, photoEdit: { position: "absolute", bottom: 4, right: 4, width: 34, height: 34, borderRadius: 17, backgroundColor: "rgba(0,0,0,.7)", alignItems: "center", justifyContent: "center" },
  nameRow: { marginTop: 10, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7 }, groupName: { color: C.text, fontFamily: undefined, fontSize: 21, textAlign: "center", maxWidth: "82%" }, editName: { padding: 5 }, pencil: { fontSize: 19 }, count: { color: C.textMuted, fontFamily: undefined, textAlign: "center", marginTop: 2, marginBottom: 18 },
  options: { gap: 10 }, option: { flexDirection: "row", alignItems: "center", gap: 11, backgroundColor: C.card, borderRadius: 15, padding: 13, borderWidth: 1, borderColor: C.border }, optionIcon: { width: 42, height: 42, borderRadius: 12, backgroundColor: "rgba(201,168,76,.12)", alignItems: "center", justifyContent: "center" }, optionText: { flex: 1 }, optionTitle: { color: C.text, fontFamily: undefined, fontSize: 15, textAlign: "right" }, optionSub: { color: C.textMuted, fontFamily: undefined, fontSize: 11, textAlign: "right", marginTop: 2 }, leaveOption: { marginTop: 5 }, leaveIcon: { backgroundColor: "rgba(239,68,68,.09)" },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,.6)", alignItems: "center", justifyContent: "center", padding: 20 }, renameBox: { width: "100%", maxWidth: 430, backgroundColor: C.background, borderRadius: 18, padding: 16 }, modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }, modalTitle: { color: C.text, fontFamily: undefined, fontSize: 17 }, input: { backgroundColor: C.card, borderRadius: 12, minHeight: 48, paddingHorizontal: 12, color: C.text, fontFamily: undefined, borderWidth: 1, borderColor: C.border }, save: { marginTop: 12, minHeight: 46, borderRadius: 12, backgroundColor: C.primary, alignItems: "center", justifyContent: "center" }, saveText: { color: "#FFF", fontFamily: undefined },
});
