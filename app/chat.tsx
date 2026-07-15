import React from "react";
import { useLocalSearchParams } from "expo-router";
import ChatRoom from "@/components/ChatRoom";

export default function ChatScreen() {
  const { chatId, otherName, otherArtisan } = useLocalSearchParams<{
    chatId: string;
    otherName: string;
    otherArtisan?: string;
  }>();
  return (
    <ChatRoom chatId={chatId} otherName={otherName} otherArtisan={otherArtisan} showPresence />
  );
}
