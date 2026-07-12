import React from "react";
import { useLocalSearchParams } from "expo-router";
import ChatRoom from "@/components/ChatRoom";

export default function ChatScreen() {
  const { chatId, otherName } = useLocalSearchParams<{ chatId: string; otherName: string }>();
  return <ChatRoom chatId={chatId} otherName={otherName} showPresence />;
}
