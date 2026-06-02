import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const openAIChatCompletionsUrl = "https://api.openai.com/v1/chat/completions";

const streamChatCompletion = async (messages: unknown[], systemPrompt: string) => {
  const openAIKey = Deno.env.get("OPENAI_API_KEY");
  if (!openAIKey) throw new Error("OPENAI_API_KEY is not configured");

  return fetch(openAIChatCompletionsUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openAIKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: Deno.env.get("OPENAI_MODEL") || "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        ...messages,
      ],
      stream: true,
    }),
  });
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { messages, mode, context } = await req.json();
    const selectedSport = "futebol";
    const selectedLeague = context?.league ? String(context.league) : "nao informada";
    const selectedCountry = context?.country ? String(context.country) : "nao informado";

    // Data atual injetada no contexto da IA — evita que o modelo trate dados como se fosse 2024
    const now = new Date();
    const currentDateBR = now.toLocaleDateString("pt-BR", {
      timeZone: "America/Sao_Paulo",
      day: "2-digit", month: "long", year: "numeric",
    });
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1; // 1-12
    // Temporadas europeias começam em agosto; brasileirão é ano civil
    const seasonEuropean = currentMonth >= 8
      ? `${currentYear}/${currentYear + 1}`
      : `${currentYear - 1}/${currentYear}`;
    const seasonBrazilian = String(currentYear);

    const temporalContext = `\n\nCONTEXTO TEMPORAL (OBRIGATÓRIO RESPEITAR):
- Data atual real: ${currentDateBR} (${now.toISOString()})
- Ano atual: ${currentYear}
- Temporada europeia em curso: ${seasonEuropean}
- Temporada brasileira (Brasileirao) em curso: ${seasonBrazilian}
- Quando o usuário pedir dados "atuais", "recentes", "desta temporada" ou "agora", use SEMPRE ${currentYear} e a temporada vigente acima.
- NUNCA assuma 2023 ou 2024 como ano atual. Se você não tiver dados confirmados de ${currentYear}, diga isso claramente em vez de inventar números antigos.
- Sempre cite o ano/temporada de referência dos números que apresentar.`;

    const appContext = `\n\nCONTEXTO DO APP:
- Categoria selecionada: ${selectedSport}
- Liga selecionada: ${selectedLeague}
- Pais/regiao da liga: ${selectedCountry}
- Responda apenas perguntas relacionadas a ${selectedSport}. Se a pergunta for de outro esporte ou fora de esporte, explique que a categoria atual nao cobre isso.
- Para estatisticas atuais, resultados e numeros especificos, use apenas informacoes que voce consiga tratar como confiaveis. Se nao tiver confirmacao suficiente, diga que nao consegue confirmar em vez de inventar.
- Quando apresentar numeros, informe a competicao/temporada e cite a fonte pelo nome ou URL quando ela estiver disponivel no contexto.`;

    const flexibleFormatContext = `\n\nFORMATO DE RESPOSTA:
- Perguntas simples, factuais, conceituais, de perfil, idade, posicao, explicacoes e comparacoes curtas devem ser respondidas em texto normal.
- Use JSON de dashboard apenas quando o resultado for naturalmente tabular/grafico: rankings, classificacoes, listas com varias linhas, series temporais, comparacoes numericas amplas ou quando o usuario pedir dashboard/tabela/grafico.
- Se retornar JSON, ele deve ser valido e seguir exatamente a estrutura pedida. Se responder em texto, nao envolva em JSON.`;

    const systemPrompt = mode === "analyze"
      ? `Você é um assistente de análise de dados esportivos do Sportando. O usuário forneceu dados brutos (via texto ou arquivo). 
Analise os dados e retorne OBRIGATORIAMENTE um JSON válido com a seguinte estrutura:
{
  "titulo": "Título do dashboard",
  "descricao": "Descrição breve dos dados",
  "tipo": "tabela" | "barras" | "linhas" | "pizza",
  "labels": ["label1", "label2", ...],
  "datasets": [
    { "nome": "Nome do dataset", "dados": [valor1, valor2, ...] }
  ],
  "insights": ["Insight 1", "Insight 2", ...]
}
Responda APENAS com o JSON, sem texto adicional, sem markdown.${temporalContext}${appContext}`
      : `Você é um assistente de pesquisa esportiva do Sportando. Ajude o usuário a encontrar dados esportivos.
Quando o formato adequado for dashboard/tabela/grafico, retorne um JSON válido com a seguinte estrutura:
{
  "titulo": "Título do dashboard",
  "descricao": "Descrição breve dos dados",
  "tipo": "tabela" | "barras" | "linhas" | "pizza",
  "labels": ["label1", "label2", ...],
  "datasets": [
    { "nome": "Nome do dataset", "dados": [valor1, valor2, ...] }
  ],
  "insights": ["Insight 1", "Insight 2", ...]
}
Se o usuário fizer uma pergunta genérica ou de conversa, responda normalmente em texto.
Quando retornar dados em JSON, responda APENAS com o JSON, sem texto adicional.${temporalContext}${appContext}${flexibleFormatContext}`;

    const response = await streamChatCompletion(messages, systemPrompt);

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Limite de requisições excedido. Tente novamente em alguns instantes." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Créditos esgotados. Adicione fundos na sua conta." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 401 || response.status === 403) {
        return new Response(JSON.stringify({ error: "Chave de IA invalida ou sem permissao para este modelo." }), {
          status: response.status, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI provider error:", response.status, t);
      return new Response(JSON.stringify({ error: "Erro no serviço de IA" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("chat error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Erro desconhecido" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
