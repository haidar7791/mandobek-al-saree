import React, { useEffect, useState } from "react";
import { router } from "expo-router";
import { auth } from "../lib/firebase";
import { ensureSupportWelcome, buildSupportChatId, ADMIN_UID } from "../lib/db_logic";
import ChatRoom from "@/components/ChatRoom";

export default function SupportScreen() {
  const [chatId, setChatId] = useState<string | null>(null);

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) {
      router.replace("/login");
      return;
    }
    setChatId(buildSupportChatId(user.uid));
    ensureSupportWelcome(user.uid).catch(() => {});
  }, []);

  if (!chatId) return null;

  return (
    <ChatRoom
      chatId={chatId}
      otherName="الدعم الفني"
      otherUid={ADMIN_UID}
      showPresence={false}
      headerSubtitle="فريق فورس جاهز لخدمتك"
      headerIcon="headphones"
    />
  );
}
