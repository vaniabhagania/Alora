# Alora

[![Open in Bolt](https://bolt.new/static/open-in-bolt.svg)](https://bolt.new/~/sb1-p3hm8kpq)

ALORA Personal AI OS — a personal academic companion and second brain. It combines
an academic tracker, a retrieval-practice quiz built from your own notes, task
management, journalling, a memory store and a set of creative spaces, all reading
and writing **one shared memory layer** (`src/lib/brain/`) behind a chat-driven interface.

## Features

| Area | What it does |
| --- | --- |
| **Home** | Today at a glance: streak, deadlines, goal progress, nudges and recent activity — all derived from real data |
| **Academia** | Years → semesters → courses → modules → topics hierarchy, with editable class logs that feed Memory automatically |
| **Daily Quiz** | Retrieval practice generated from *your* topics and notes (mixing recent, older and weak material); open answers are self-rated |
| **Tasks** | Deadlines, priorities, effort estimates, and links to goals / identities / courses |
| **Routines** | A deadline-aware plan for the rest of today. It flags tasks that will miss their deadline and lists what doesn't fit instead of hiding it |
| **Alora Chat** | Context-aware chat with conversation history; falls back to a local agent if the model is unreachable |
| **Journal** | Free-form entries with mood and tags; "Remember" turns an entry into a memory only when you choose |
| **My Future** | Future-self identities, goals and habits (create / edit / delete; progress is derived from linked work) |
| **Novel** | Turn your own experiences into structured chapters and scenes with your own curation notes |
| **Memory** | A searchable long-term store: reinforce, correct or dismiss what Alora has inferred |
| **Vibe Check** | Worlds, moodboards and appearance; an optional monthly theme drawn only from your own words |

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
| `npm test` | Unit tests (Vitest) |
| `npm run e2e` | Browser end-to-end suite against the in-memory Supabase stand-in (see [Testing](#testing)) |
| `npm run healthcheck` | Typecheck + lint + unit tests + build + E2E — what the 9:00 AM scheduled check runs |

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

Only `chat()` leaves the browser. It calls the `alora-chat` Supabase **edge function**, which holds the
Gemini key server-side (it never reaches the client bundle), scans for distress language *before* anything is sent to
the model, saves the exchange to `chat_conversations` / `chat_messages`, and returns the reply.

Everything else — class summaries, task extraction, journal reflection, memory search — is **local and rule-based**
(`LocalAIProvider` in `src/lib/ai/provider.ts`), reads only your own stored data, and never calls an external service. If the
edge function is missing or unreachable, chat degrades to the same local agent and the exchange is still saved.

To enable the full model:

```bash
supabase functions deploy alora-chat
supabase secrets set GEMINI_API_KEY=...        # set by you; never committed
```

The provider contract is the `AIProvider` interface in `src/lib/ai/types.ts`.

## Testing

There are three layers, all runnable without any real credentials:

| Layer | Command | What it covers |
| --- | --- | --- |
| Static | `npm run typecheck` · `npm run lint` | Types and lint |
| Unit | `npm test` | Pure logic: routines planner, habits/streaks, quiz mix, novel ordering, AI routing, crisis detection, … |
| End-to-end | `npm run e2e` (or `node e2e/run.mjs tasks,journal` for some areas) | The real app in headless Chromium, desktop / tablet / phone, against `tools/fake-supabase` |

`tools/fake-supabase` is an in-memory stand-in for Supabase whose tables, defaults, NOT NULL / UNIQUE / CHECK rules and
foreign-key cascades are parsed from `supabase/migrations/`, so it cannot drift from the schema. It can also inject
failures (`/__fake/faults`) so error paths are tested, not just happy paths.

The E2E suite needs Playwright + Chromium, which are **not** project dependencies (they are provided by the
environment); install them yourself with `npm i -D playwright && npx playwright install chromium` to run it locally.

**It does not replace a check against your live Supabase project and a real Gemini key** — run the app once with your
real `.env` after any schema or edge-function change.

## Status

Every page supports create / view / edit / delete where that makes sense, reports failed saves and loads honestly
(never as an empty state), and writes into the shared brain (`src/lib/brain/`).

Known limits:

- Push and email notifications don't exist yet; the Settings toggle controls the in-app nudges on Home.
- Playwright is not in `package.json`; the E2E suite needs it installed locally.

## License

No license file is currently present, so all rights are reserved by default.
