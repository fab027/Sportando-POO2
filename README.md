# POO2 Teste — Dashboard Esportivo com React + TypeScript

Este projeto é uma aplicação web para visualização e acompanhamento de dados esportivos, com páginas de **dashboard**, **equipes**, **atletas**, **partidas**, **previsões**, **favoritos** e **agregador de dados**.

A aplicação foi construída com **React**, **TypeScript**, **Vite**, **Tailwind CSS**, **shadcn/ui**, integração de autenticação com **Supabase** e rotas com **React Router**.

## Funcionalidades principais

- Navegação por múltiplas páginas esportivas.
- Autenticação de usuários (login e registro).
- Favoritos por usuário autenticado.
- Integração com serviços/serverless via Supabase.
- Interface moderna com componentes reutilizáveis.

## Tecnologias utilizadas

- React 18
- TypeScript
- Vite
- Tailwind CSS
- shadcn/ui + Radix UI
- React Router
- TanStack React Query
- Supabase

## Pré-requisitos

Antes de executar, você precisa ter instalado:

- [Node.js](https://nodejs.org/) (recomendado: versão 18 ou superior)
- npm (vem com o Node)
- Visual Studio Code

## Como executar no Visual Studio Code

### 1) Abrir o projeto

1. Abra o **Visual Studio Code**.
2. Clique em **File > Open Folder...**.
3. Selecione a pasta do projeto (`POO2-teste`).

### 2) Instalar dependências

No terminal integrado do VS Code (**Terminal > New Terminal**), rode:

```bash
npm install
```

### 3) Configurar variáveis de ambiente

Crie um arquivo `.env` na raiz do projeto com:

```env
VITE_SUPABASE_URL=sua_url_do_supabase
VITE_SUPABASE_PUBLISHABLE_KEY=sua_chave_publica_do_supabase
```

> Sem essas variáveis, recursos de autenticação e integrações com Supabase não funcionarão corretamente.

### 4) Iniciar em modo desenvolvimento

Ainda no terminal do VS Code, execute:

```bash
npm run dev
```

O Vite exibirá uma URL local (geralmente `http://localhost:5173`).
Abra essa URL no navegador.

## Scripts úteis

- `npm run dev` — inicia o servidor de desenvolvimento.
- `npm run build` — gera build de produção.
- `npm run preview` — executa preview local do build.
- `npm run lint` — executa lint do código.
- `npm run test` — roda os testes com Vitest.

## Estrutura básica

```text
src/
  components/      # Componentes visuais e layout
  contexts/        # Contextos globais (autenticação, esporte, favoritos)
  hooks/           # Hooks customizados
  integrations/    # Clientes/integradores (ex.: Supabase)
  pages/           # Páginas da aplicação
  services/        # Serviços de dados e integração
```

## Possíveis problemas e soluções

- **Erro ao iniciar por falta de variáveis de ambiente**:
  - Verifique se o arquivo `.env` existe e está na raiz do projeto.
- **Porta 5173 ocupada**:
  - Finalize o processo que usa a porta ou execute o Vite em outra porta.
- **Dependências não instaladas**:
  - Rode `npm install` novamente.

## Licença

Projeto acadêmico/educacional.
