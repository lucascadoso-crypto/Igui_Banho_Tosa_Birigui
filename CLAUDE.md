# CLAUDE.md

Orientações para trabalhar neste repositório (Igui Banho e Tosa Birigui).

## Regras de banco de dados – Supabase

A partir de 30/10/2026 o Supabase deixa de conceder automaticamente acesso da Data API
(supabase-js/PostgREST) a tabelas novas criadas no schema `public`. Tabelas já existentes
antes dessa data não são afetadas por essa mudança, mas toda tabela nova precisa de grants
explícitos para ser acessível via API.

Regra permanente: **toda migration que criar uma tabela nova no schema `public` DEVE, na
mesma migration**:

1. **Ativar RLS**
   ```sql
   alter table public.<tabela> enable row level security;
   ```

2. **Conceder acesso aos roles de aplicação**
   ```sql
   grant select, insert, update, delete on public.<tabela> to authenticated;
   grant select, insert, update, delete on public.<tabela> to service_role;
   ```
   Ajuste o conjunto de verbos (`select`/`insert`/`update`/`delete`) ao que a tabela
   realmente precisa expor — nem toda tabela precisa de todos os quatro.

3. **Criar as policies de RLS adequadas** para a tabela (quem pode ver/inserir/atualizar/
   apagar quais linhas). Grant sem policy não libera leitura nenhuma com RLS ativo; policy
   sem grant também não libera nada — os dois são necessários.

4. **Não conceder nenhum acesso ao role `anon`**, a menos que seja pedido explicitamente
   que a tabela seja pública (acessível sem login). Se for o caso, prefira expor o mínimo
   necessário via uma função `security definer` dedicada (padrão já usado neste projeto em
   `supabase/migrations/0027_cadastro_publico.sql`) em vez de abrir policy/grant direto de
   tabela para `anon`.

5. **Sequences**: se a tabela tiver coluna `identity`/`serial`/`bigserial`, conceder também
   `usage` (e `select` quando necessário) na sequence correspondente para os roles que
   precisam inserir:
   ```sql
   grant usage, select on sequence public.<tabela>_<coluna>_seq to authenticated;
   ```

Não altere tabelas existentes para "adequá-las" a esta regra sem pedido explícito — a regra
vale para migrations novas a partir de agora.
