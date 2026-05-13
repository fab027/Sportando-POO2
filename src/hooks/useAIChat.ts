import { useState, useCallback, useRef, useEffect } from "react";
import type { League } from "@/data/leagues";
import { analyzeRawDataLocally, resolveSportsDashboard } from "@/services/aggregatorService";

interface Message {
  role: "user" | "assistant";
  content: string;
}

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/sports-chat`;

export const useAIChat = (league: League) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const messagesRef = useRef<Message[]>([]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const sendMessage = useCallback(async (input: string, mode: "search" | "analyze" = "search") => {
    const userMsg: Message = { role: "user", content: input };
    setMessages(prev => [...prev, userMsg]);
    setIsLoading(true);

    let assistantSoFar = "";
    const allMessages = [...messagesRef.current, userMsg];

    try {
      const localDashboard =
        mode === "analyze"
          ? analyzeRawDataLocally(input)
          : await resolveSportsDashboard(input, league).catch(() => null);

      if (localDashboard) {
        setMessages(prev => [...prev, { role: "assistant", content: JSON.stringify(localDashboard, null, 2) }]);
        return;
      }

      const resp = await fetch(CHAT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ messages: allMessages, mode }),
      });

      if (!resp.ok || !resp.body) {
        const errorData = await resp.json().catch(() => ({}));
        throw new Error(errorData.error || "Falha na conexão com a IA");
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let textBuffer = "";
      let streamDone = false;

      while (!streamDone) {
        const { done, value } = await reader.read();
        if (done) break;
        textBuffer += decoder.decode(value, { stream: true });

        let newlineIndex: number;
        while ((newlineIndex = textBuffer.indexOf("\n")) !== -1) {
          let line = textBuffer.slice(0, newlineIndex);
          textBuffer = textBuffer.slice(newlineIndex + 1);

          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (line.startsWith(":") || line.trim() === "") continue;
          if (!line.startsWith("data: ")) continue;

          const jsonStr = line.slice(6).trim();
          if (jsonStr === "[DONE]") { streamDone = true; break; }

          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content as string | undefined;
            if (content) {
              assistantSoFar += content;
              setMessages(prev => {
                const last = prev[prev.length - 1];
                if (last?.role === "assistant") {
                  return prev.map((m, i) => (i === prev.length - 1 ? { ...m, content: assistantSoFar } : m));
                }
                return [...prev, { role: "assistant", content: assistantSoFar }];
              });
            }
          } catch {
            textBuffer = line + "\n" + textBuffer;
            break;
          }
        }
      }
    } catch (e) {
      console.error("AI chat error:", e);
      const fallbackDashboard =
        mode === "analyze"
          ? analyzeRawDataLocally(input)
          : await resolveSportsDashboard(input, league).catch(() => null);
      setMessages(prev => [
        ...prev,
        {
          role: "assistant",
          content: fallbackDashboard
            ? JSON.stringify(fallbackDashboard, null, 2)
            : "Nao consegui acessar a IA remota agora. Para dados atuais, tente perguntas como: artilheiros, assistencias, classificacao ou jogos de hoje da liga selecionada.",
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  }, [league]);

  const clearMessages = useCallback(() => {
    messagesRef.current = [];
    setMessages([]);
  }, []);

  return { messages, isLoading, sendMessage, clearMessages };
};
