import { useEffect, useState, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import EmojiPicker, { Theme as EmojiTheme } from "emoji-picker-react";
import { useAuth } from "../contexts/AuthContext";
import { useTheme } from "../contexts/ThemeContext";
import { PageHeader } from "../components/shared/PageHeader";
import { Avatar } from "../components/shared/Avatar";
import { showToast } from "../components/shared/Toast";
import { supabase } from "../services/supabaseClient";
import { formatFileSize, getFileIcon, cn } from "../utils/helpers";
import type { Profile, Message, ChatGroup, ChatConversation, Presence } from "../types";
import {
  MessageSquare,
  Send,
  Paperclip,
  Smile,
  CheckCheck,
  Users,
  User as UserIcon,
  Search,
  Image as ImageIcon,
  FileText,
  FileSpreadsheet,
  File as FileIcon,
  Download,
  ChevronLeft,
} from "lucide-react";

const FILE_ICON_MAP: Record<string, typeof FileIcon> = {
  image: ImageIcon,
  pdf: FileText,
  excel: FileSpreadsheet,
  word: FileText,
  file: FileIcon,
};

export default function Chat() {
  const { user, profile } = useAuth();
  const { theme } = useTheme();
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [allProfiles, setAllProfiles] = useState<Profile[]>([]);
  const [allPresence, setAllPresence] = useState<Presence[]>([]);
  const [activeConvo, setActiveConvo] = useState<ChatConversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [showEmoji, setShowEmoji] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [search, setSearch] = useState("");
  const [showMobileChat, setShowMobileChat] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesRef = useRef<HTMLDivElement>(null);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load all profiles and presence
  useEffect(() => {
    (async () => {
      const [profRes, presRes, groupsRes, membersRes] = await Promise.all([
        supabase.from("profiles").select("*"),
        supabase.from("presence").select("*"),
        supabase.from("chat_groups").select("*"),
        supabase.from("chat_group_members").select("*"),
      ]);
      setAllProfiles((profRes.data ?? []) as Profile[]);
      setAllPresence((presRes.data ?? []) as Presence[]);

      // Build conversations
      const convos: ChatConversation[] = [];
      const profiles = (profRes.data ?? []) as Profile[];
      const groups = (groupsRes.data ?? []) as ChatGroup[];
      const members = (membersRes.data ?? []) as { group_id: string; user_id: string }[];

      // Group chats
      groups.forEach((g) => {
        const isMember = members.some((m) => m.group_id === g.id && m.user_id === user?.id);
        if (isMember) {
          convos.push({
            id: g.id,
            type: "group",
            name: g.name,
            group_id: g.id,
            avatar_url: null,
          });
        }
      });

      // Private chats: manager can chat with all employees, employees can chat with manager
      const others = profiles.filter((p) => p.id !== user?.id);
      // For employees, also allow chat with other employees
      others.forEach((p) => {
        convos.push({
          id: `private-${p.id}`,
          type: "private",
          name: p.full_name,
          user_id: p.id,
          avatar_url: p.avatar_url,
        });
      });

      const { data: recentMessages } = await supabase
        .from("messages")
        .select("sender_id, receiver_id, group_id, content, created_at, is_read")
        .order("created_at", { ascending: false })
        .limit(500);
      const conversationById = new Map(convos.map((conversation) => [conversation.id, conversation]));
      (recentMessages ?? []).forEach((message) => {
        const conversationId = message.group_id ||
          `private-${message.sender_id === user?.id ? message.receiver_id : message.sender_id}`;
        const conversation = conversationById.get(conversationId);
        if (!conversation) return;
        if (!conversation.last_message_time) {
          conversation.last_message = message.content || "Attachment";
          conversation.last_message_time = message.created_at;
        }
        if (message.receiver_id === user?.id && !message.is_read) {
          conversation.unread_count = (conversation.unread_count || 0) + 1;
        }
      });
      setConversations(convos.sort((first, second) =>
        (second.last_message_time || "").localeCompare(first.last_message_time || "")
      ));
      setLoading(false);
    })();
  }, [user]);

  // Subscribe to presence changes
  useEffect(() => {
    const channel = supabase
      .channel("chat-presence")
      .on("postgres_changes", { event: "*", schema: "public", table: "presence" }, (payload) => {
        setAllPresence((prev) => {
          const updated = payload.new as Presence;
          const exists = prev.find((p) => p.user_id === updated.user_id);
          if (exists) return prev.map((p) => (p.user_id === updated.user_id ? updated : p));
          return [...prev, updated];
        });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Load messages for active conversation
  const loadMessages = useCallback(async () => {
    if (!activeConvo || !user) return;
    let query = supabase.from("messages").select("*");
    if (activeConvo.type === "private") {
      query = query.or(`and(sender_id.eq.${user.id},receiver_id.eq.${activeConvo.user_id}),and(sender_id.eq.${activeConvo.user_id},receiver_id.eq.${user.id})`);
    } else {
      query = query.eq("group_id", activeConvo.group_id);
    }
    const { data } = await query.order("created_at", { ascending: true }).limit(200);
    setMessages((data ?? []) as Message[]);

    // Mark received messages as read
    const unread = (data ?? []).filter(
      (m) => m.receiver_id === user.id && !m.is_read
    ) as Message[];
    if (unread.length > 0) {
      for (const m of unread) {
        await supabase.from("messages").update({ is_read: true, read_at: new Date().toISOString() }).eq("id", m.id);
      }
      setMessages((prev) => prev.map((m) => (m.receiver_id === user.id ? { ...m, is_read: true } : m)));
      setConversations((prev) => prev.map((conversation) =>
        conversation.id === activeConvo.id ? { ...conversation, unread_count: 0 } : conversation
      ));
    }
  }, [activeConvo, user]);

  useEffect(() => {
    loadMessages();
  }, [activeConvo, loadMessages]);

  // Subscribe to new messages
  useEffect(() => {
    if (!activeConvo || !user) return;
    const channel = supabase
      .channel(`messages-${activeConvo.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, (payload) => {
        const newMsg = payload.new as Message;
        // Check if this message belongs to active conversation
        if (activeConvo.type === "private") {
          if (
            (newMsg.sender_id === user.id && newMsg.receiver_id === activeConvo.user_id) ||
            (newMsg.sender_id === activeConvo.user_id && newMsg.receiver_id === user.id)
          ) {
            setMessages((prev) => [...prev, newMsg]);
            const conversationId = `private-${newMsg.sender_id === user.id ? newMsg.receiver_id : newMsg.sender_id}`;
            setConversations((prev) => prev
              .map((conversation) => conversation.id === conversationId
                ? {
                  ...conversation,
                  last_message: newMsg.content || "Attachment",
                  last_message_time: newMsg.created_at,
                  unread_count: newMsg.receiver_id === user.id
                    ? (conversation.unread_count || 0) + 1
                    : conversation.unread_count,
                }
                : conversation
              )
              .sort((first, second) => (second.last_message_time || "").localeCompare(first.last_message_time || ""))
            );
            if (newMsg.receiver_id === user.id) {
              supabase.from("messages").update({ is_read: true, read_at: new Date().toISOString() }).eq("id", newMsg.id);
            }
          }
        } else if (activeConvo.type === "group" && newMsg.group_id === activeConvo.group_id) {
          setMessages((prev) => [...prev, newMsg]);
          setConversations((prev) => prev.map((conversation) =>
            conversation.id === activeConvo.id
              ? { ...conversation, last_message: newMsg.content || "Attachment", last_message_time: newMsg.created_at }
              : conversation
          ));
        }
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "messages" }, (payload) => {
        const updated = payload.new as Message;
        setMessages((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeConvo, user]);

  // Auto scroll to bottom
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  const getPresence = (userId: string) => allPresence.find((p) => p.user_id === userId)?.status ?? "offline";

  const handleSend = async () => {
    if (!input.trim() || !activeConvo || !user) return;
    setSending(true);
    const content = input.trim();
    setInput("");

    const insert: Record<string, unknown> = {
      sender_id: user.id,
      content,
    };
    if (activeConvo.type === "private") {
      insert.receiver_id = activeConvo.user_id;
    } else {
      insert.group_id = activeConvo.group_id;
    }

    const { error } = await supabase.from("messages").insert(insert);
    if (error) {
      showToast("error", "Failed to send message");
      setInput(content);
    }
    setSending(false);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user || !activeConvo) return;
    if (file.size > 10 * 1024 * 1024) {
      showToast("warning", "File must be under 10MB");
      return;
    }

    setSending(true);
    const fileName = `${user.id}/${Date.now()}-${file.name}`;
    const { error: upErr } = await supabase.storage.from("chat-files").upload(fileName, file);
    if (upErr) {
      showToast("error", "Failed to upload file");
      setSending(false);
      return;
    }

    const { data: urlData } = supabase.storage.from("chat-files").getPublicUrl(fileName);

    const insert: Record<string, unknown> = {
      sender_id: user.id,
      file_url: urlData.publicUrl,
      file_name: file.name,
      file_type: file.type,
      file_size: file.size,
    };
    if (activeConvo.type === "private") {
      insert.receiver_id = activeConvo.user_id;
    } else {
      insert.group_id = activeConvo.group_id;
    }

    const { error } = await supabase.from("messages").insert(insert);
    if (error) {
      showToast("error", "Failed to send file");
    }
    setSending(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleEmojiClick = (emojiData: { emoji: string }) => {
    setInput((prev) => prev + emojiData.emoji);
  };

  const getSenderProfile = (senderId: string) => allProfiles.find((p) => p.id === senderId);

  const filteredConvos = conversations.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      <PageHeader title="Chat" subtitle="Message your team in real-time" icon={<MessageSquare className="w-5 h-5" />} />

      <div className="card overflow-hidden h-[calc(100vh-220px)] min-h-[500px] flex">
        {/* Sidebar - conversations list */}
        <div className={cn("w-full sm:w-80 border-r border-slate-200 dark:border-slate-700 flex flex-col", showMobileChat && "hidden sm:flex")}>
          <div className="p-3 border-b border-slate-200 dark:border-slate-700">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="input-field pl-10 text-sm py-2"
                placeholder="Search conversations..."
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <div className="w-6 h-6 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : filteredConvos.length === 0 ? (
              <div className="p-6 text-center text-slate-400 text-sm">No conversations</div>
            ) : (
              filteredConvos.map((convo) => {
                const isActive = activeConvo?.id === convo.id;
                const presence = convo.type === "private" ? getPresence(convo.user_id!) : null;
                return (
                  <button
                    key={convo.id}
                    onClick={() => { setActiveConvo(convo); setShowMobileChat(true); }}
                    className={cn(
                      "w-full flex items-center gap-3 p-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors text-left border-b border-slate-100 dark:border-slate-800",
                      isActive && "bg-primary-50 dark:bg-primary-900/20"
                    )}
                  >
                    {convo.type === "group" ? (
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-accent-400 to-accent-600 flex items-center justify-center text-white flex-shrink-0">
                        <Users className="w-5 h-5" />
                      </div>
                    ) : (
                      <Avatar name={convo.name} src={convo.avatar_url} size="md" presence={presence} />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-900 dark:text-white truncate">{convo.name}</p>
                      <p className="text-xs text-slate-400 truncate">{convo.last_message || (convo.type === "group" ? "Group chat" : presence ? presence : "Offline")}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      {convo.last_message_time && <span className="text-[10px] text-slate-400">{new Date(convo.last_message_time).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</span>}
                      {!!convo.unread_count && <span className="min-w-5 h-5 px-1 rounded-full bg-primary-600 text-white text-[10px] font-semibold flex items-center justify-center">{convo.unread_count}</span>}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Chat area */}
        <div className={cn("flex-1 flex flex-col", !showMobileChat && "hidden sm:flex")}>
          {activeConvo ? (
            <>
              {/* Chat header */}
              <div className="flex items-center gap-3 p-4 border-b border-slate-200 dark:border-slate-700">
                <button onClick={() => setShowMobileChat(false)} className="sm:hidden btn-ghost p-1.5">
                  <ChevronLeft className="w-5 h-5" />
                </button>
                {activeConvo.type === "group" ? (
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-accent-400 to-accent-600 flex items-center justify-center text-white">
                    <Users className="w-5 h-5" />
                  </div>
                ) : (
                  <Avatar name={activeConvo.name} src={activeConvo.avatar_url} size="md" presence={getPresence(activeConvo.user_id!)} />
                )}
                <div className="flex-1">
                  <h3 className="font-semibold text-slate-900 dark:text-white">{activeConvo.name}</h3>
                  <p className="text-xs text-slate-400">
                    {activeConvo.type === "group"
                      ? "Group chat"
                      : getPresence(activeConvo.user_id!) === "online"
                        ? "Online"
                        : "Offline"}
                  </p>
                </div>
              </div>

              {/* Messages */}
              <div ref={messagesRef} className="flex-1 overflow-y-auto p-4 space-y-2 bg-slate-50/50 dark:bg-slate-900/30">
                {messages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-slate-400">
                    <MessageSquare className="w-12 h-12 mb-2 opacity-50" />
                    <p className="text-sm">No messages yet. Start the conversation!</p>
                  </div>
                ) : (
                  messages.map((msg) => {
                    const isMine = msg.sender_id === user?.id;
                    const sender = getSenderProfile(msg.sender_id);
                    const fileIcon = getFileIcon(msg.file_type);
                    const FileIconComp = FILE_ICON_MAP[fileIcon] || FileIcon;
                    return (
                      <motion.div
                        key={msg.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className={cn("flex items-end gap-2", isMine ? "justify-end" : "justify-start")}
                      >
                        {!isMine && activeConvo.type === "group" && (
                          <Avatar name={sender?.full_name || "User"} src={sender?.avatar_url} size="xs" />
                        )}
                        <div className={cn("max-w-[75%] sm:max-w-md", isMine ? "items-end" : "items-start")}>
                          {!isMine && activeConvo.type === "group" && (
                            <p className="text-xs text-slate-400 mb-1 ml-1">{sender?.full_name}</p>
                          )}
                          <div
                            className={cn(
                              "rounded-2xl px-4 py-2.5 break-words",
                              isMine
                                ? "bg-primary-600 text-white rounded-br-md"
                                : "bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-bl-md border border-slate-200 dark:border-slate-700"
                            )}
                          >
                            {msg.content && <p className="text-sm whitespace-pre-wrap">{msg.content}</p>}
                            {msg.file_url && (
                              <div className="mt-2">
                                {msg.file_type?.startsWith("image/") ? (
                                  <a href={msg.file_url} target="_blank" rel="noopener noreferrer">
                                    <img src={msg.file_url} alt={msg.file_name || "image"} className="rounded-lg max-w-full max-h-48 object-cover" />
                                  </a>
                                ) : (
                                  <a
                                    href={msg.file_url}
                                    download={msg.file_name || undefined}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className={cn(
                                      "flex items-center gap-2 p-2 rounded-lg",
                                      isMine ? "bg-white/20" : "bg-slate-100 dark:bg-slate-700"
                                    )}
                                  >
                                    <FileIconComp className="w-5 h-5 flex-shrink-0" />
                                    <div className="flex-1 min-w-0">
                                      <p className="text-xs font-medium truncate">{msg.file_name}</p>
                                      <p className="text-xs opacity-70">{formatFileSize(msg.file_size || 0)}</p>
                                    </div>
                                    <Download className="w-4 h-4 flex-shrink-0" />
                                  </a>
                                )}
                              </div>
                            )}
                          </div>
                          <div className={cn("flex items-center gap-1 mt-1", isMine ? "justify-end" : "justify-start")}>
                            <span className="text-[10px] text-slate-400">
                              {new Date(msg.created_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                            </span>
                            {isMine && (
                              <CheckCheck className={cn("w-3.5 h-3.5", msg.is_read ? "text-blue-500" : "text-slate-300")} />
                            )}
                          </div>
                        </div>
                      </motion.div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Input area */}
              <div className="p-3 border-t border-slate-200 dark:border-slate-700 relative">
                {showEmoji && (
                  <div className="absolute bottom-full right-0 mb-2 z-10">
                    <EmojiPicker onEmojiClick={handleEmojiClick} theme={theme === "dark" ? EmojiTheme.DARK : EmojiTheme.LIGHT} width={320} height={400} />
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowEmoji((p) => !p)}
                    className="btn-ghost p-2 text-slate-500 hover:text-primary-600"
                  >
                    <Smile className="w-5 h-5" />
                  </button>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={sending}
                    className="btn-ghost p-2 text-slate-500 hover:text-primary-600"
                  >
                    <Paperclip className="w-5 h-5" />
                  </button>
                  <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileUpload} accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.csv" />
                  <textarea
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                    className="input-field flex-1 min-h-11 max-h-28 resize-none py-2.5"
                    placeholder="Type a message..."
                    disabled={sending}
                  />
                  <button
                    onClick={handleSend}
                    disabled={sending || !input.trim()}
                    className="btn-primary p-2.5 flex items-center justify-center disabled:opacity-50"
                  >
                    {sending ? (
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <Send className="w-5 h-5" />
                    )}
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-slate-400">
              <MessageSquare className="w-16 h-16 mb-3 opacity-30" />
              <p className="text-sm">Select a conversation to start chatting</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}