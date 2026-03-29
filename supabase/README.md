# Supabase (Marco 1)

1. Instalar [Supabase CLI](https://supabase.com/docs/guides/cli).
2. `supabase init` já está satisfeito por esta pasta; para local: `supabase start`.
3. Migrações em `migrations/` — Marco 1: `20260329120000_marco1_foundation.sql`.
4. Seed opcional: `seed.sql` (convite de dev `marco1-dev-token`).

Ligar o projeto cloud: `supabase link` e `supabase db push` (ou aplicar o SQL no dashboard).

Variáveis no front (`apps/web`): ver `apps/web/.env.example`.
