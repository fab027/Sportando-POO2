# Fontes de agregacao de dados

Este arquivo registra fontes externas uteis para evoluir a camada de dados do Sportando.
Elas nao devem ser tratadas como dependencia automatica sem avaliacao de licenca,
termos de uso, custo de manutencao e compatibilidade com o fluxo atual:

1. SofaScore direto via API/web
2. ScraperFC como fallback local em desenvolvimento
3. Widgets oficiais do SofaScore para telas de detalhe

## Fontes avaliadas

### soccerdata

Repositorio: https://github.com/probberechts/soccerdata

Uso mais promissor: coletar dados historicos e analiticos de multiplas fontes em Python.
O projeto agrega scrapers para Club Elo, ESPN, FBref, Football-Data.co.uk, Sofascore,
SoFIFA, Understat e WhoScored, retornando DataFrames com colunas e identificadores
coerentes entre datasets.

Boa aplicacao no Sportando:
- enriquecer atletas e equipes com estatisticas historicas;
- criar jobs offline/cacheados para rankings e comparativos;
- usar como referencia de normalizacao multi-fonte.

Nao e ideal como caminho de baixa latencia para tela ao vivo.

### reep

Repositorio: https://github.com/withqwerty/reep

Uso mais promissor: resolver identidade entre provedores. O projeto mapeia jogadores,
times, tecnicos, competicoes e temporadas entre Transfermarkt, FBref, UEFA, Sofascore
e dezenas de outras fontes usando IDs canonicos.

Boa aplicacao no Sportando:
- criar uma camada `externalIds` para jogador/time/campeonato;
- evitar duplicidade quando a mesma entidade vem de SofaScore, FBref, ESPN ou Transfermarkt;
- melhorar favoritos, busca e agregador com equivalencia entre provedores.

### EasySoccerData

Repositorio: https://github.com/manucabral/EasySoccerData

Uso mais promissor: referencia de API Python simples para dados em tempo real e consultas
SofaScore/Promiedos/FBref. O README mostra `SofascoreClient().get_events(live=True)` e
exemplos para busca, brackets e estatisticas de partidas ao vivo.

Boa aplicacao no Sportando:
- comparar endpoints e estruturas de resposta com nosso bridge;
- ampliar dados ao vivo quando o ScraperFC ficar pesado;
- inspirar wrappers menores por dominio: eventos, estatisticas, busca e torneios.

### data-scraping-sofascore

Repositorio: https://github.com/danielsaban/data-scraping-sofascore

Uso mais promissor: referencia de modelagem e ETL. O projeto coleta jogadores, tecnicos
e dados de times do SofaScore/externos e grava em banco relacional.

Boa aplicacao no Sportando:
- desenhar persistencia local/Supabase para dados que nao precisam ser buscados toda vez;
- criar tabelas normalizadas de `teams`, `players`, `managers`, `venues` e `external_ids`;
- separar scraping pesado de leitura rapida no frontend.

## Decisao tecnica recomendada

Curto prazo:
- manter SofaScore direto como caminho principal;
- manter ScraperFC como fallback;
- usar widgets SofaScore para detalhes ricos de partidas, jogadores, times e campeonatos;
- reduzir chamadas repetidas com cache por campeonato/temporada.

Medio prazo:
- criar uma camada de entidades canonicas inspirada no reep;
- persistir dados estaveis no Supabase;
- usar bibliotecas Python apenas em jobs/bridge, nunca diretamente no frontend.

Longo prazo:
- plugar fontes analiticas como soccerdata para historico e estatisticas avancadas;
- expor tudo para o React por um contrato interno unico, independente da fonte original.
