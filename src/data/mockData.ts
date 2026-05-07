export const footballTeams = [
  { id: "f1", nome: "Flamengo", pais: "Brasil", liga: "Brasileirão", logoUrl: "🔴⚫", jogadores: 28 },
  { id: "f2", nome: "Palmeiras", pais: "Brasil", liga: "Brasileirão", logoUrl: "🟢⬜", jogadores: 26 },
  { id: "f3", nome: "Real Madrid", pais: "Espanha", liga: "La Liga", logoUrl: "⚪👑", jogadores: 25 },
  { id: "f4", nome: "Barcelona", pais: "Espanha", liga: "La Liga", logoUrl: "🔵🔴", jogadores: 24 },
  { id: "f5", nome: "Manchester City", pais: "Inglaterra", liga: "Premier League", logoUrl: "🩵⬜", jogadores: 27 },
  { id: "f6", nome: "São Paulo", pais: "Brasil", liga: "Brasileirão", logoUrl: "⬜🔴⚫", jogadores: 26 },
];

export const basketballTeams = [
  { id: "b1", nome: "Los Angeles Lakers", pais: "EUA", liga: "NBA", logoUrl: "💜💛", jogadores: 15 },
  { id: "b2", nome: "Golden State Warriors", pais: "EUA", liga: "NBA", logoUrl: "💙💛", jogadores: 15 },
  { id: "b3", nome: "Boston Celtics", pais: "EUA", liga: "NBA", logoUrl: "💚⬜", jogadores: 15 },
  { id: "b4", nome: "Miami Heat", pais: "EUA", liga: "NBA", logoUrl: "🔴⚫", jogadores: 15 },
  { id: "b5", nome: "Chicago Bulls", pais: "EUA", liga: "NBA", logoUrl: "🔴⬛", jogadores: 15 },
  { id: "b6", nome: "Brooklyn Nets", pais: "EUA", liga: "NBA", logoUrl: "⬛⬜", jogadores: 15 },
];

export const footballAthletes = [
  { id: "fa1", nome: "Gabriel Barbosa", posicao: "Atacante", nacionalidade: "Brasil", equipeId: "f1", equipe: "Flamengo", gols: 14, assistencias: 6 },
  { id: "fa2", nome: "Endrick", posicao: "Atacante", nacionalidade: "Brasil", equipeId: "f3", equipe: "Real Madrid", gols: 8, assistencias: 3 },
  { id: "fa3", nome: "Raphinha", posicao: "Ponta", nacionalidade: "Brasil", equipeId: "f4", equipe: "Barcelona", gols: 12, assistencias: 9 },
  { id: "fa4", nome: "Haaland", posicao: "Atacante", nacionalidade: "Noruega", equipeId: "f5", equipe: "Manchester City", gols: 22, assistencias: 4 },
  { id: "fa5", nome: "Dudu", posicao: "Atacante", nacionalidade: "Brasil", equipeId: "f2", equipe: "Palmeiras", gols: 10, assistencias: 7 },
  { id: "fa6", nome: "Luciano", posicao: "Atacante", nacionalidade: "Brasil", equipeId: "f6", equipe: "São Paulo", gols: 9, assistencias: 5 },
];

export const basketballAthletes = [
  { id: "ba1", nome: "LeBron James", posicao: "Ala", nacionalidade: "EUA", equipeId: "b1", equipe: "Lakers", pontos: 25.4, rebotes: 7.2 },
  { id: "ba2", nome: "Stephen Curry", posicao: "Armador", nacionalidade: "EUA", equipeId: "b2", equipe: "Warriors", pontos: 28.1, rebotes: 5.1 },
  { id: "ba3", nome: "Jayson Tatum", posicao: "Ala", nacionalidade: "EUA", equipeId: "b3", equipe: "Celtics", pontos: 27.0, rebotes: 8.3 },
  { id: "ba4", nome: "Jimmy Butler", posicao: "Ala", nacionalidade: "EUA", equipeId: "b4", equipe: "Heat", pontos: 22.6, rebotes: 6.0 },
  { id: "ba5", nome: "Zach LaVine", posicao: "Ala-Armador", nacionalidade: "EUA", equipeId: "b5", equipe: "Bulls", pontos: 24.8, rebotes: 4.5 },
  { id: "ba6", nome: "Mikal Bridges", posicao: "Ala", nacionalidade: "EUA", equipeId: "b6", equipe: "Nets", pontos: 19.5, rebotes: 4.2 },
];

export const footballMatches = [
  { id: "fm1", casaId: "f1", casa: "Flamengo", foraId: "f2", fora: "Palmeiras", dataHora: "2026-03-28T20:00:00", placarCasa: null, placarFora: null, status: "agendada", liga: "Brasileirão" },
  { id: "fm2", casaId: "f3", casa: "Real Madrid", foraId: "f4", fora: "Barcelona", dataHora: "2026-03-27T16:00:00", placarCasa: 2, placarFora: 1, status: "finalizada", liga: "La Liga" },
  { id: "fm3", casaId: "f5", casa: "Manchester City", foraId: "f6", fora: "São Paulo", dataHora: "2026-03-29T18:00:00", placarCasa: null, placarFora: null, status: "agendada", liga: "Amistoso" },
  { id: "fm4", casaId: "f2", casa: "Palmeiras", foraId: "f1", fora: "Flamengo", dataHora: "2026-03-20T21:00:00", placarCasa: 0, placarFora: 3, status: "finalizada", liga: "Brasileirão" },
];

export const basketballMatches = [
  { id: "bm1", casaId: "b1", casa: "Lakers", foraId: "b2", fora: "Warriors", dataHora: "2026-03-28T22:00:00", placarCasa: null, placarFora: null, status: "agendada", liga: "NBA" },
  { id: "bm2", casaId: "b3", casa: "Celtics", foraId: "b4", fora: "Heat", dataHora: "2026-03-26T19:30:00", placarCasa: 112, placarFora: 105, status: "finalizada", liga: "NBA" },
  { id: "bm3", casaId: "b5", casa: "Bulls", foraId: "b6", fora: "Nets", dataHora: "2026-03-29T20:00:00", placarCasa: null, placarFora: null, status: "agendada", liga: "NBA" },
];

export const footballPredictions = [
  { id: "fp1", partidaId: "fm1", casa: "Flamengo", fora: "Palmeiras", probCasa: 45.2, probEmpate: 28.1, probFora: 26.7, modeloVersao: "v2.1", algoritmo: "Random Forest" },
  { id: "fp2", partidaId: "fm3", casa: "Manchester City", fora: "São Paulo", probCasa: 72.3, probEmpate: 18.0, probFora: 9.7, modeloVersao: "v2.1", algoritmo: "Random Forest" },
];

export const basketballPredictions = [
  { id: "bp1", partidaId: "bm1", casa: "Lakers", fora: "Warriors", probCasa: 48.5, probEmpate: 0, probFora: 51.5, modeloVersao: "v1.8", algoritmo: "Gradient Boosting" },
  { id: "bp2", partidaId: "bm3", casa: "Bulls", fora: "Nets", probCasa: 55.0, probEmpate: 0, probFora: 45.0, modeloVersao: "v1.8", algoritmo: "Gradient Boosting" },
];

export const performanceData = {
  football: [
    { mes: "Jan", gols: 12, assistencias: 8 },
    { mes: "Fev", gols: 15, assistencias: 10 },
    { mes: "Mar", gols: 9, assistencias: 6 },
    { mes: "Abr", gols: 18, assistencias: 12 },
    { mes: "Mai", gols: 14, assistencias: 9 },
    { mes: "Jun", gols: 20, assistencias: 15 },
  ],
  basketball: [
    { mes: "Jan", pontos: 108, rebotes: 45 },
    { mes: "Fev", pontos: 112, rebotes: 48 },
    { mes: "Mar", pontos: 98, rebotes: 42 },
    { mes: "Abr", pontos: 120, rebotes: 52 },
    { mes: "Mai", pontos: 115, rebotes: 49 },
    { mes: "Jun", pontos: 125, rebotes: 55 },
  ],
};
