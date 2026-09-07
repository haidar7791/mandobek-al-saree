---
name: Chat unread state
description: Keep chat-list unread state separate from the home badge's last-sender rule.
---

Treat unread incoming messages and the sender of the latest message as separate signals: the conversation list can highlight any unread incoming message, while the home badge must additionally require that the latest message was sent by someone else.

**Why:** A user can send a new message after receiving an unread one; that should suppress the home badge without incorrectly losing the conversation's unread state.

**How to apply:** Store the latest sender on the chat summary, derive unread incoming messages from message read flags, and clear those flags when the chat room is opened.