-- =====================================================================
-- POLITICA_1 · REVERTER · volta as 2 funções da política ao texto do B63_1 e remove private.v39_privacy_render
-- =====================================================================
begin;

create or replace function app.v39_privacy_policy_current(p_church_id uuid) returns jsonb
language plpgsql stable security definer set search_path = pg_catalog, app, private as $f$
declare v app.v39_privacy_policy_versions;
begin
  perform private.v39_lgpd_me(p_church_id);
  v := private.v39_privacy_current(p_church_id);
  if v.id is null then return jsonb_build_object('ok', true, 'versao', null, 'texto', ''); end if;
  return jsonb_build_object('ok', true, 'versao', v.version, 'texto', v.body, 'hash', v.body_sha256, 'publicadaEm', v.published_at);
end $f$;

create or replace function app.edge_privacy_policy_public(p_church_id uuid) returns jsonb
language plpgsql stable security definer set search_path = pg_catalog, app, private as $f$
declare v app.v39_privacy_policy_versions := private.v39_privacy_current(p_church_id);
begin
  return jsonb_build_object('ok', true, 'versao', v.version, 'texto', coalesce(v.body, ''));
end $f$;

drop function if exists private.v39_privacy_render(uuid,text);

commit;

notify pgrst, 'reload schema';

select
  (select md5(prosrc) = '0be0aa4a04ed5ec198fde250a9cfc93f' from pg_proc where oid = 'app.v39_privacy_policy_current(uuid)'::regprocedure) as atual_original,
  (select md5(prosrc) = '37d9c53c63b40783fb396cd8cda8f94a' from pg_proc where oid = 'app.edge_privacy_policy_public(uuid)'::regprocedure) as edge_original,
  to_regprocedure('private.v39_privacy_render(uuid,text)') is null as render_removida;
