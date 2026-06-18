import { useState, useEffect, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MessageSquare, Send, Users, User } from "lucide-react";

export default function ChatRoom() {
  const { user } = useAuth();
  const [activeChat, setActiveChat] = useState<"group" | number>("group");
  const [message, setMessage] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { data: allUsers } = trpc.users.list.useQuery();
  const { data: groupMessages, refetch: refetchGroup } = trpc.chat.groupMessages.useQuery(undefined, {
    enabled: activeChat === "group",
    refetchInterval: 5000,
  });
  const { data: directMessages, refetch: refetchDirect } = trpc.chat.directMessages.useQuery(
    { otherUserId: typeof activeChat === "number" ? activeChat : 0 },
    { enabled: typeof activeChat === "number", refetchInterval: 5000 }
  );

  const sendMessage = trpc.chat.send.useMutation({
    onSuccess: () => {
      setMessage("");
      if (activeChat === "group") refetchGroup();
      else refetchDirect();
    },
  });

  const messages = activeChat === "group" ? groupMessages : directMessages;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return;
    sendMessage.mutate({
      recipientId: activeChat === "group" ? null : activeChat,
      message: message.trim(),
    });
  };

  const otherUsers = allUsers?.filter(u => u.id !== user?.id) ?? [];

  return (
    <div className="flex gap-4 h-[calc(100vh-180px)]">
      {/* Sidebar - Users list */}
      <Card className="w-64 shrink-0 flex flex-col">
        <CardHeader className="p-3 border-b">
          <CardTitle className="text-sm flex items-center gap-2">
            <Users className="h-4 w-4" />
            المحادثات
          </CardTitle>
        </CardHeader>
        <ScrollArea className="flex-1">
          <div className="p-2 space-y-1">
            {/* Group chat */}
            <button
              onClick={() => setActiveChat("group")}
              className={`w-full text-right p-3 rounded-lg transition-colors flex items-center gap-2 ${
                activeChat === "group" ? "bg-green-100 text-green-800" : "hover:bg-muted/50"
              }`}
            >
              <div className="w-8 h-8 rounded-full bg-green-200 flex items-center justify-center shrink-0">
                <Users className="h-4 w-4 text-green-700" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm truncate">غرفة الاجتماعات</p>
                <p className="text-xs text-muted-foreground">محادثة جماعية</p>
              </div>
            </button>

            {/* Direct messages */}
            {otherUsers.map(u => (
              <button
                key={u.id}
                onClick={() => setActiveChat(u.id)}
                className={`w-full text-right p-3 rounded-lg transition-colors flex items-center gap-2 ${
                  activeChat === u.id ? "bg-green-100 text-green-800" : "hover:bg-muted/50"
                }`}
              >
                <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center shrink-0">
                  <User className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{u.displayName}</p>
                  <p className="text-xs text-muted-foreground">
                    {u.role === "admin" ? "مدير" : "موظف"}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </ScrollArea>
      </Card>

      {/* Chat area */}
      <Card className="flex-1 flex flex-col">
        <CardHeader className="p-3 border-b">
          <CardTitle className="text-sm flex items-center gap-2">
            <MessageSquare className="h-4 w-4" />
            {activeChat === "group" ? "غرفة الاجتماعات - محادثة جماعية" : `محادثة مع ${otherUsers.find(u => u.id === activeChat)?.displayName ?? ""}`}
          </CardTitle>
        </CardHeader>
        <ScrollArea className="flex-1 p-4">
          <div className="space-y-3">
            {(!messages || messages.length === 0) && (
              <div className="text-center text-muted-foreground py-12">
                <MessageSquare className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p>لا توجد رسائل بعد</p>
                <p className="text-xs mt-1">ابدأ المحادثة بإرسال رسالة</p>
              </div>
            )}
            {messages?.map((msg: any) => {
              const isMe = msg.senderId === user?.id;
              return (
                <div key={msg.id} className={`flex ${isMe ? "justify-start" : "justify-end"}`}>
                  <div className={`max-w-[70%] rounded-lg p-3 ${
                    isMe ? "bg-green-100 text-green-900" : "bg-muted"
                  }`}>
                    {!isMe && (
                      <p className="text-xs font-medium text-green-700 mb-1">{msg.senderName}</p>
                    )}
                    <p className="text-sm whitespace-pre-wrap">{msg.message}</p>
                    <p className="text-[10px] text-muted-foreground mt-1">
                      {new Date(msg.createdAt).toLocaleTimeString("ar-IQ", { hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>
        </ScrollArea>

        {/* Message input */}
        <div className="p-3 border-t">
          <form onSubmit={handleSend} className="flex gap-2">
            <Input
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="اكتب رسالتك..."
              className="flex-1"
            />
            <Button
              type="submit"
              className="bg-green-700 hover:bg-green-800"
              disabled={!message.trim() || sendMessage.isPending}
            >
              <Send className="h-4 w-4" />
            </Button>
          </form>
        </div>
      </Card>
    </div>
  );
}
