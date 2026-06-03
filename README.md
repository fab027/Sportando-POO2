# Sportando

Plataforma web para acompanhar dados, estatisticas e previsoes de futebol em tempo real. Permite gerenciar times/atletas favoritos, visualizar partidas, ver noticias e conversar com IA sobre analises e dados de futebol.

## Tecnologias

- **React 18** + TypeScript
- **Vite** para build
- **Tailwind CSS** + Shadcn/ui
- **Supabase** para autenticacao e banco de dados
- **React Router** para navegacao
- **TanStack Query** para estado e cache
- **ScraperFC** para dados do SofaScore em desenvolvimento

## Como Executar

### 1. Clonar repositorio
```bash
git clone https://github.com/fab027/Sportando-POO2.git
cd Sportando-POO2
```

### 2. Instalar dependencias
```bash
npm install
python -m pip install -r requirements.txt
```

No Windows, o ScraperFC/Botasaurus tambem precisa de:

- Python 3.12 tradicional do python.org ou `winget install Python.Python.3.12`
- Google Chrome instalado
- Microsoft Visual C++ 2015-2022 Redistributable x64

### 3. Configurar variaveis de ambiente
Crie um arquivo `.env.local` na raiz:
```env
VITE_SUPABASE_URL=https://seu-projeto.supabase.co
VITE_SUPABASE_ANON_KEY=sua-chave-publica
```

Obtenha as credenciais em app.supabase.io -> Settings > API.

### 4. Executar
```bash
npm run dev
```

O Vite tenta iniciar automaticamente a ponte local ScraperFC em `http://127.0.0.1:8787`.
Se quiser iniciar manualmente:

```bash
npm run scraperfc
```

Acesse http://localhost:8080

## Scripts

```bash
npm run dev           # Servidor de desenvolvimento
npm run scraperfc     # Ponte local ScraperFC/SofaScore
npm run build         # Build para producao
npm run preview       # Visualizar build
npm run test          # Testes
npm run lint          # Verificar codigo
```

## Estrutura
```
src/
+-- components/   # Componentes React
+-- pages/        # Paginas da aplicacao
+-- contexts/     # Context API (Auth, Favoritos)
+-- hooks/        # Custom hooks
+-- services/     # APIs e integracoes
+-- lib/          # Utilidades
```
