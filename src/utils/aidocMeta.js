// AI Doc is available only in productivity-mode chats, unless the user switched it off.
export function isAiDocEnabledForChat(chat) {
  return !!chat && chat.mode === 'productivity' && chat.useAiDoc !== false
}
