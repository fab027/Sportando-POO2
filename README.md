# 🏀 Sportando

Plataforma web para acompanhar dados, estatísticas e previsões de esportes em tempo real. Permite gerenciar times/atletas favoritos, visualizar partidas, ver noticias e conversar com IA sobre análises esportivas e dados diversos sobre Futebol/Basquete.

## Tecnologias

- **React 18** + TypeScript
- **Vite** para build
- **Tailwind CSS** + Shadcn/ui
- **Supabase** para autenticação e banco de dados
- **React Router** para navegação
- **TanStack Query** para estado e cache

## Como Executar

### 1. Clonar repositório
```bash
git clone https://github.com/fab027/Sportando-POO2.git
cd Sportando-POO2
```

### 2. Instalar dependências
```bash
npm install
```

### 3. Configurar variáveis de ambiente
Crie um arquivo `.env.local` na raiz:
```env
VITE_SUPABASE_URL=https://seu-projeto.supabase.co
VITE_SUPABASE_ANON_KEY=sua-chave-publica
```

Obtenha as credenciais em [app.supabase.io](https://app.supabase.io/) → Settings > API

### 4. Executar
```bash
npm run dev
```

Acesse http://localhost:8080

## Scripts

```bash
npm run dev           # Servidor de desenvolvimento
npm run build         # Build para produção
npm run preview       # Visualizar build
npm run test          # Testes
npm run lint          # Verificar código
```

## Estrutura
```
src/
├── components/   # Componentes React
├── pages/        # Páginas da aplicação
├── contexts/     # Context API (Auth, Favoritos)
├── hooks/        # Custom hooks
├── services/     # APIs e integrações
└── lib/          # Utilidades
```

