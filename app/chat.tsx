import React from "react";
import { useLocalSearchParams } from "expo-router";
import ChatRoom from "@/components/ChatRoom";

export default function ChatScreen() {
  const { chatId, otherName, otherArtisan, otherUid, isGroup, groupPhotoUri } =
    useLocalSearchParams<{
      chatId: string;
      otherName: string;
      otherArtisan?: string;
      otherUid?: string;
      isGroup?: string;
      groupPhotoUri?: string;
    }>();
  return (
    <ChatRoom
      chatId={chatId}
      otherName={otherName}
      otherUid={otherUid}
      otherArtisan={otherArtisan}
      isGroup={isGroup === "1"}
      groupPhotoUri={groupPhotoUri || null}
      showPresence={isGroup !== "1"}
    />
  );
}
