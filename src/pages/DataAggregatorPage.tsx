import { useState, useRef, useEffect } from "react";
import { Send, Upload, FileText, MessageSquare, Trash2, Sparkles } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { useAIChat } from "@/hooks/useAIChat";
import DynamicDashboard, { DashboardData } from "@/components/DynamicDashboard";
import { useSport } from "@/contexts/SportContext";

type Tab = "chat" | "dados";

const tryParseJSON = (text: string): DashboardData | null => {
  try {
    const clean = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const parsed = JSON.parse(clean);
    if (parsed.titulo && parsed.labels && parsed.datasets) return parsed as DashboardData;
    return null;
  } catch {
    return null;
  }
};

const DataAggregatorPage = () => {
  const { sportClass } = useSport();
  const [tab, setTab] = useState<Tab>("chat");
  const [input, setInput] = useState("");
  const [rawText, setRawText] = useState("");
  const { messages, isLoading, sendMessage, clearMessages } = useAIChat();
  const chatEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dashboards, setDashboards] = useState<DashboardData[]>([]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Parse dashboards from assistant messages
  useEffect(() => {
    const parsed: DashboardData[] = [];
    messages.filter(m => m.role === "assistant").forEach(m => {
      const d = tryParseJSON(m.content);
      if (d) parsed.push(d);
    });
    if (parsed.length > 0) setDashboards(parsed);
  }, [messages]);

  const handleSendChat = () => {
    if (!input.trim() || isLoading) return;
    sendMessage(input.trim(), "search");
    setInput("");
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setRawText(text);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleAnalyzeData = () => {
    if (!rawText.trim() || isLoading) return;
    sendMessage(
      `Analise os seguintes dados e gere um dashboard:\n\n${rawText}`,
      "analyze"
    );
  };

  return (
    <div className={`${sportClass} space-y-6`}>
      <div>
        <h1 className="font-display text-2xl font-bold text-foreground flex items-center gap-2">
          <Sparkles className="h-6 w-6 text-sport" />
          Agregador de Dados
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Pesquise dados via IA ou forneça seus próprios dados para gerar dashboards personalizados
        </p>
      </div>

      {/* Tab switcher */}
      <div className="flex gap-1 rounded-lg bg-secondary p-1">
        <button
          onClick={() => setTab("chat")}
          className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-all ${
            tab === "chat" ? "bg-sport text-sport-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <MessageSquare className="h-4 w-4" /> Chat com IA
        </button>
        <button
          onClick={() => setTab("dados")}
          className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-all ${
            tab === "dados" ? "bg-sport text-sport-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <FileText className="h-4 w-4" /> Dados Brutos
        </button>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Left: Input area */}
        <div className="space-y-4">
          {tab === "chat" && (
            <div className="flex flex-col rounded-xl border border-border bg-card overflow-hidden" style={{ height: "500px" }}>
              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {messages.length === 0 && (
                  <div className="flex h-full items-center justify-center text-center">
                    <div>
                      <Sparkles className="mx-auto h-10 w-10 text-muted-foreground/30" />
                      <p className="mt-3 text-sm text-muted-foreground">
                        Pergunte sobre dados esportivos.<br />
                        Ex: "Quais os artilheiros do Brasileirão 2025?"
                      </p>
                    </div>
                  </div>
                )}
                {messages.map((msg, i) => {
                  const dashboard = msg.role === "assistant" ? tryParseJSON(msg.content) : null;
                  return (
                    <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                      <div
                        className={`max-w-[85%] rounded-xl px-4 py-2.5 text-sm ${
                          msg.role === "user"
                            ? "bg-sport text-sport-foreground"
                            : "bg-secondary text-foreground"
                        }`}
                      >
                        {dashboard ? (
                          <p className="text-xs italic text-muted-foreground">📊 Dashboard gerado — veja ao lado →</p>
                        ) : (
                          <div className="prose prose-sm max-w-none">
                            <ReactMarkdown>{msg.content}</ReactMarkdown>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
                {isLoading && messages[messages.length - 1]?.role === "user" && (
                  <div className="flex justify-start">
                    <div className="rounded-xl bg-secondary px-4 py-2.5 text-sm text-muted-foreground animate-pulse">
                      Pensando...
                    </div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>

              {/* Input */}
              <div className="border-t border-border p-3">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && handleSendChat()}
                    placeholder="Pergunte sobre dados esportivos..."
                    className="flex-1 rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:border-sport focus:outline-none focus:ring-1 focus:ring-sport"
                    disabled={isLoading}
                  />
                  <button
                    onClick={handleSendChat}
                    disabled={isLoading || !input.trim()}
                    className="flex h-9 w-9 items-center justify-center rounded-lg bg-sport text-sport-foreground disabled:opacity-50 hover:opacity-90 transition-opacity"
                  >
                    <Send className="h-4 w-4" />
                  </button>
                </div>
                {messages.length > 0 && (
                  <button onClick={clearMessages} className="mt-2 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
                    <Trash2 className="h-3 w-3" /> Limpar conversa
                  </button>
                )}
              </div>
            </div>
          )}

          {tab === "dados" && (
            <div className="space-y-4">
              <div className="rounded-xl border border-border bg-card p-5 space-y-4">
                <div>
                  <label className="mb-2 block text-sm font-medium text-foreground">
                    Upload de Arquivo (CSV, TXT, JSON)
                  </label>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv,.txt,.json,.tsv"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center gap-2 rounded-lg border border-dashed border-border px-4 py-3 text-sm text-muted-foreground hover:border-sport hover:text-sport transition-colors w-full justify-center"
                  >
                    <Upload className="h-4 w-4" /> Selecionar arquivo
                  </button>
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-foreground">
                    Ou cole os dados diretamente
                  </label>
                  <textarea
                    value={rawText}
                    onChange={e => setRawText(e.target.value)}
                    rows={12}
                    placeholder="Cole seus dados aqui... (CSV, JSON, tabela, texto livre)"
                    className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm font-mono placeholder:text-muted-foreground focus:border-sport focus:outline-none focus:ring-1 focus:ring-sport resize-none"
                  />
                </div>

                <button
                  onClick={handleAnalyzeData}
                  disabled={isLoading || !rawText.trim()}
                  className="w-full flex items-center justify-center gap-2 rounded-lg bg-sport px-4 py-2.5 text-sm font-medium text-sport-foreground disabled:opacity-50 hover:opacity-90 transition-opacity"
                >
                  <Sparkles className="h-4 w-4" />
                  {isLoading ? "Analisando..." : "Analisar e Gerar Dashboard"}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Right: Dashboard area */}
        <div>
          {dashboards.length === 0 ? (
            <div className="flex h-[500px] items-center justify-center rounded-xl border border-dashed border-border bg-card">
              <div className="text-center">
                <Sparkles className="mx-auto h-12 w-12 text-muted-foreground/20" />
                <p className="mt-3 text-sm text-muted-foreground">
                  Seu dashboard personalizado<br />aparecerá aqui
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {dashboards.map((d, i) => (
                <DynamicDashboard key={i} data={d} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default DataAggregatorPage;
