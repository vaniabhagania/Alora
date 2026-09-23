# Alora

[![Open in Bolt](https://bolt.new/static/open-in-bolt.svg)](https://bolt.new/~/sb1-p3hm8kpq)

ALORA Personal AI OS — a personal operating system for studying, reflection and
long-term self-direction. It combines an academic tracker, a spaced-repetition
quiz engine, task management, journalling, a memory store and a set of creative
"worlds" behind a single chat-driven interface.

## Features

| Area | What it does |
| --- | --- |
| **Home** | Dashboard of streaks, upcoming deadlines and recent activity |
| **Academia** | Years → semesters → courses → modules → topics hierarchy, with class logs |
| **Daily Quiz** | Generated questions mixing recent, older, weak and lateral-thinking topics |
| **Tasks** | Deadlines, priorities and effort estimates |
| **Alora Chat** | Context-aware chat that reads your stored academic and personal data |
| **Journal** | Free-form entries with tagging |
| **My Future** | Future-self identities, goals and habits |
| **Novel** | Turn your own experiences into structured chapters and scenes |
| **Memory** | A searchable long-term store of things you want Alora to remember |
| **Your Worlds** | Moodboards, themes and appearance editing |

## Tech stack

- **React 18** + **TypeScript**, bundled with **Vite 5**
- **Tailwind CSS 3** for styling
- **Supabase** (Postgres + Auth) for persistence
- **lucide-react** for icons

## Prerequisites

- **Node.js 18+** and npm
- A **Supabase** project (free tier is fine)

## Setup

1. **Install dependencies**

   ```bash
   npm install
   ```

2. **Configure environment variables**

   Copy the example file and fill in your Supabase credentials:

   ```bash
   cp .env.example .env
   ```

   Both values come from your Supabase project under
   **Project Settings → API**:

   | Variable | Where to find it |
   | --- | --- |
   | `VITE_SUPABASE_URL` | Project URL |
   | `VITE_SUPABASE_ANON_KEY` | Project API keys → `anon` `public` |

   The `anon` key is safe to expose in a browser bundle — row-level security is
   what protects your data. Never put the `service_role` key in a `VITE_`
   variable; anything prefixed `VITE_` is embedded in the client build.

3. **Apply the database migrations**

   The SQL in `supabase/migrations/` creates roughly 30 tables along with their
   row-level security policies. Apply them in filename order — either by pasting
   each file into the Supabase SQL editor, or with the Supabase CLI:

   ```bash
   supabase db push
   ```

4. **Start the dev server**

   ```bash
   npm run dev
   ```

   Vite serves the app at http://localhost:5173 by default.

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start the Vite dev server |
| `npm run build` | Production build to `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm run lint` | Run ESLint |
| `npm run typecheck` | Type-check without emitting output |

## Project structure

```
src/
├── components/       Shared UI, app shell, and feature components
│   ├── academia/     Academic hierarchy, dashboards and views
│   └── worlds/       Moodboard studio, appearance editor
├── lib/
│   ├── ai/           AI provider interface and the current implementation
│   ├── brain/        Cross-feature context, insights, memory and event cascade
│   ├── auth.tsx      Supabase auth context
│   ├── supabase.ts   Supabase client
│   └── types.ts      Shared domain types
└── pages/            One component per top-level navigation item

supabase/migrations/  Schema and row-level security policies
```

## AI provider

`src/lib/ai/provider.ts` currently ships a **local, rule-based provider**
(`LocalAIProvider`). It produces responses from your own stored data using
pattern matching and templates — no external API key is required, and no data
leaves the browser.

It implements the `AIProvider` interface in `src/lib/ai/types.ts`, so swapping in
a real model means writing a new class against that interface and changing the
single `aiProvider` export at the bottom of `provider.ts`.

Note that only `chat()` and `generateQuiz()` are wired into the UI today. See
[Status](#status) for what remains.

## Status

Implemented and wired up:

- Full academic hierarchy, class logging and dashboards
- Quiz generation and attempts
- Tasks, journal, memory, future-self and worlds pages
- Supabase auth and row-level security across all tables

Not yet wired up — these exist on the `AIProvider` interface and have stub
implementations in `LocalAIProvider`, but nothing in the UI calls them:

- `summarizeClass()` — returns fixed strings and ignores its input
- `extractTasks()` — always returns an empty task list
- `reflect()` — returns literal placeholder text
- `curateNovelScene()` — returns two generic suggestions
- `searchMemories()` — implemented, but the Memory page filters locally instead

## License

No license file is currently present, so all rights are reserved by default.
