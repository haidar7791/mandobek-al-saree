import React, { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable, FlatList, Alert, ActivityIndicator, TextInput, Modal } from "react-native";
import { Image } from "expo-image";
import { Feather } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { auth } from "../lib/firebase";
import { addGroupMembers, getGroupDetails, removeGroupMember, searchUsersByName, setGroupModerator, getUserProfile, getArtisanByUserId, type GroupDetails, type GroupMemberProfile, type ShareUserResult } from "../lib/db_logic";
import Colors from "@/constants/colors";
const C = Colors.light;

export default function GroupMembersScreen() {
  const { chatId, add } = useLocalSearchParams<{ chatId: string; add?: string }>();
  const insets = useSafeAreaInsets();
  const [group, setGroup] = useState<GroupDetails | null>(null); const [loading, setLoading] = useState(true); const [addVisible, setAddVisible] = useState(add === "1");
  const [search, setSearch] = useState(""); const [results, setResults] = useState<ShareUserResult[]>([]); const [busy, setBusy] = useState(false); const uid = auth.currentUser?.uid;
  const canManage = !!uid && !!group && (group.adminIds.includes(uid) || group.moderatorIds.includes(uid));

  const load = useCallback(async () => { if (!chatId) return; try { setGroup(await getGroupDetails(chatId)); } catch { Alert.alert("خطأ", "تعذّر تحميل الأعضاء"); } finally { setLoading(false); } }, [chatId]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { const term=search.trim(); if(!term||!uid||!group){setResults([]);return;} let cancelled=false; const t=setTimeout(async()=>{try{const found=await searchUsersByName(term,uid); if(!cancelled)setResults(found.filter(u=>!group.participants.includes(u.userId)));}catch{if(!cancelled)setResults([])}},250); return()=>{cancelled=true;clearTimeout(t)}; },[search,uid,group]);

  const openProfile = async (member: GroupMemberProfile) => {
    if (member.userId === uid) return;
    try {
      const [profile, artisan] = await Promise.all([getUserProfile(member.userId), getArtisanByUserId(member.userId)]);
      if (profile?.role === "artisan" && profile.specialty !== "client" && artisan) router.push({ pathname: "/artisan-profile", params: { artisanId: artisan.id, artisan: JSON.stringify(artisan) } } as any);
      else router.push({ pathname: "/user-profile", params: { userId: member.userId, userName: member.name, userPhoto: member.photoUri || "" } } as any);
    } catch { router.push({ pathname: "/user-profile", params: { userId: member.userId, userName: member.name, userPhoto: member.photoUri || "" } } as any); }
  };

  const manageMember = (member: GroupMemberProfile) => {
    if (!canManage || member.userId === uid || member.role === "admin") return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const moderator = member.role === "moderator";
    Alert.alert(member.name, "اختر الإجراء", [
      { text: "إلغاء", style: "cancel" },
      { text: moderator ? "إلغاء تعيينه كمشرف" : "تعيينه كمشرف", onPress: async()=>{try{await setGroupModerator(chatId,member.userId,!moderator);await load();}catch{Alert.alert("خطأ","تعذّر تحديث صلاحية المشرف");}} },
      { text: "إزالة العضو", style: "destructive", onPress: async()=>{try{await removeGroupMember(chatId,member.userId);await load();}catch{Alert.alert("خطأ","تعذّرت إزالة العضو");}} },
    ]);
  };
  const handleAdd = async (u: ShareUserResult) => { if(!uid||busy)return; setBusy(true); try{await addGroupMembers(chatId,[u.userId]);setSearch("");setResults([]);setAddVisible(false);await load();}catch{Alert.alert("خطأ","تعذّرت إضافة العضو");}finally{setBusy(false)} };

  if(loading||!group)return <View style={styles.center}><ActivityIndicator size="large" color={C.accent}/></View>;
  return <View style={styles.root}>
    <View style={[styles.header,{paddingTop:insets.top+8}]}><Pressable style={styles.back} onPress={()=>router.back()}><Feather name="chevron-right" size={24} color="#FFF"/></Pressable><Text style={styles.headerTitle}>أعضاء المجموعة</Text><Pressable style={styles.addTop} onPress={()=>setAddVisible(true)}><Feather name="user-plus" size={20} color={C.primary}/></Pressable></View>
    <FlatList data={group.members} keyExtractor={m=>m.userId} contentContainerStyle={{padding:14,paddingBottom:insets.bottom+20}} ListHeaderComponent={<Text style={styles.count}>{group.members.length} عضو</Text>} renderItem={({item})=><Pressable style={styles.row} onPress={()=>openProfile(item)} onLongPress={()=>manageMember(item)} delayLongPress={450}>
      {item.photoUri?<Image source={{uri:item.photoUri}} style={styles.avatar}/>:<View style={styles.fallback}><Text style={styles.initial}>{item.name?.[0]||"م"}</Text></View>}
      <View style={styles.info}><Text style={styles.name}>{item.name}</Text><Text style={styles.role}>{item.role==="admin"?"مسؤول المجموعة":item.role==="moderator"?"مشرف":"عضو"}</Text></View>
      {canManage&&item.role!=="admin"&&item.userId!==uid?<Feather name="more-horizontal" size={21} color={C.textMuted}/>:<Feather name="chevron-left" size={19} color={C.textMuted}/>} 
    </Pressable>}/>
    <Modal visible={addVisible} transparent animationType="slide" onRequestClose={()=>setAddVisible(false)}><View style={styles.backdrop}><View style={[styles.modal,{paddingBottom:insets.bottom+12}]}><View style={styles.modalHead}><Text style={styles.modalTitle}>إضافة أعضاء</Text><Pressable onPress={()=>setAddVisible(false)}><Feather name="x" size={22} color={C.textMuted}/></Pressable></View><TextInput value={search} onChangeText={setSearch} placeholder="ابحث باسم المستخدم" placeholderTextColor={C.textMuted} textAlign="right" style={styles.input}/><FlatList data={results} keyExtractor={u=>u.userId} keyboardShouldPersistTaps="handled" ListEmptyComponent={<Text style={styles.empty}>{search.trim()?"لا توجد نتائج":"اكتب اسم المستخدم للبحث"}</Text>} renderItem={({item})=><Pressable style={styles.result} onPress={()=>handleAdd(item)} disabled={busy}>{item.photoUri?<Image source={{uri:item.photoUri}} style={styles.resultAvatar}/>:<View style={styles.resultFallback}><Text style={styles.initial}>{item.name?.[0]||"م"}</Text></View>}<Text style={styles.resultName}>{item.name}</Text><Feather name="plus-circle" size={20} color={C.accent}/></Pressable>}/></View></View></Modal>
  </View>;
}
const styles=StyleSheet.create({root:{flex:1,backgroundColor:C.background},center:{flex:1,alignItems:"center",justifyContent:"center",backgroundColor:C.background},header:{backgroundColor:"#0D1B3E",flexDirection:"row",alignItems:"center",justifyContent:"space-between",paddingHorizontal:14,paddingBottom:14},back:{width:38,height:38,borderRadius:10,backgroundColor:"rgba(255,255,255,.12)",alignItems:"center",justifyContent:"center"},headerTitle:{color:"#FFF",fontFamily: undefined,fontSize:17},addTop:{width:38,height:38,borderRadius:10,backgroundColor:"rgba(201,168,76,.14)",alignItems:"center",justifyContent:"center"},count:{color:C.textMuted,fontFamily: undefined,textAlign:"right",marginBottom:9},row:{flexDirection:"row",alignItems:"center",gap:11,backgroundColor:C.card,borderRadius:14,padding:11,marginBottom:8,borderWidth:1,borderColor:C.border},avatar:{width:48,height:48,borderRadius:24},fallback:{width:48,height:48,borderRadius:24,backgroundColor:"rgba(201,168,76,.14)",alignItems:"center",justifyContent:"center"},initial:{color:C.accent,fontFamily: undefined,fontSize:18},info:{flex:1},name:{color:C.text,fontFamily: undefined,fontSize:15,textAlign:"right"},role:{color:C.textMuted,fontFamily: undefined,fontSize:11,textAlign:"right",marginTop:2},backdrop:{flex:1,backgroundColor:"rgba(0,0,0,.6)",justifyContent:"flex-end"},modal:{backgroundColor:C.background,borderTopLeftRadius:20,borderTopRightRadius:20,padding:16,minHeight:"55%"},modalHead:{flexDirection:"row",alignItems:"center",justifyContent:"space-between",marginBottom:12},modalTitle:{color:C.text,fontFamily: undefined,fontSize:17},input:{backgroundColor:C.card,color:C.text,borderRadius:12,minHeight:46,paddingHorizontal:12,fontFamily: undefined,borderWidth:1,borderColor:C.border,marginBottom:10},result:{flexDirection:"row",alignItems:"center",gap:10,backgroundColor:C.card,borderRadius:12,padding:9,marginBottom:7},resultAvatar:{width:42,height:42,borderRadius:21},resultFallback:{width:42,height:42,borderRadius:21,backgroundColor:"rgba(201,168,76,.14)",alignItems:"center",justifyContent:"center"},resultName:{flex:1,color:C.text,fontFamily: undefined,textAlign:"right"},empty:{color:C.textMuted,fontFamily: undefined,textAlign:"center",padding:20}}
);
