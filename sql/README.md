# sql/ — scripts de banco do 2Gather v39

Convenção (uma etapa = um par de arquivos):

| Arquivo | Para que serve |
|---|---|
| `ETAPA_teste_rollback.sql` | Bloco `do $t$ ... $t$;` que executa a mudança, confere o resultado e termina com `raise exception 'TESTE ETAPA CONCLUIDO (nada foi gravado): ...'`. Rodar primeiro no SQL Editor do Supabase. |
| `ETAPA_aplicar.sql` | O mesmo conteúdo, sem o `raise exception`. Só existe depois que o teste passou e só é aplicado com aprovação do Diogo. |

Regras:
- Funções novas: `security definer`, `set search_path = pg_catalog, app, private`, gate de permissão (`app.has_permission(...)` / `private.v39_fin_need(...)`).
- Nunca `drop`/`delete` físico de dados de negócio; usar status, cancelamento ou estorno com motivo.
- Mudou nome ou argumentos de RPC? Avisar antes: a Edge Function `auth` e o front chamam por nome.
- Nenhum segredo nos arquivos.
