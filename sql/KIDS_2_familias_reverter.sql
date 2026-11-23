-- =====================================================================
-- KIDS_2 · Famílias, ficha da criança, consentimento e fotos · REVERTER
-- Desfaz o KIDS_2_familias_aplicar.sql. Para usar logo após aplicar, se algo der errado.
-- ABORTA (sem alterar nada) se já existir família, vínculo, ficha ou consentimento kids_care:
-- nesse caso os dados são da igreja e não podem ser descartados — decidir com o Diogo (nada é apagado).
-- A chave g2_kids_records_key_v1 fica no Vault (inofensiva; reaproveitada se o KIDS_2 voltar).
-- =====================================================================
begin;

-- KIDS2-REVERTER-BEGIN
do $g$
begin
  if exists (select 1 from app.families) or exists (select 1 from app.family_members) or exists (select 1 from app.kids_child_profiles) then
    raise exception 'KIDS_2 REVERTER ABORTADO: ja existem familias/fichas do Kids. Nada foi alterado.';
  end if;
  if exists (select 1 from app.person_consents c join app.processing_purposes pp on pp.id = c.purpose_id where pp.code = 'kids_care') then
    raise exception 'KIDS_2 REVERTER ABORTADO: ja existem consentimentos kids_care. Nada foi alterado.';
  end if;
end $g$;

-- regra de foto do Instituto exatamente como antes do KIDS_2
create or replace function app.v39_inst_photo_can_write(p_church uuid, p_person uuid) returns boolean
language sql stable security definer set search_path = pg_catalog, app, private as $f$
  select app.current_user_account_id() is not null
     and (app.has_permission('institute.staff.manage', p_church, 'church', p_church)
          or ((app.has_permission('institute.sessions.manage', p_church, 'church', p_church)
               or app.has_permission('solidarity_market.deliveries.create', p_church, 'church', p_church)
               or app.has_permission('pharmacy.deliveries.create', p_church, 'church', p_church))
              and private.v39_inst_my_prof(p_church) is null))
     and exists (select 1 from app.church_people cp where cp.church_id = p_church and cp.person_id = p_person and cp.ended_at is null and cp.source = 'instituto')
$f$;
revoke all on function app.v39_inst_photo_can_write(uuid, uuid) from public, anon;
grant execute on function app.v39_inst_photo_can_write(uuid, uuid) to authenticated;

drop function if exists app.v39_kids_child_graduate(uuid, jsonb);
drop function if exists app.v39_kids_child_profile_save(uuid, jsonb);
drop function if exists app.v39_kids_child_profile(uuid, uuid, uuid);
drop function if exists app.v39_kids_consent_set(uuid, jsonb);
drop function if exists app.v39_kids_member_save(uuid, jsonb);
drop function if exists app.v39_kids_family_save(uuid, jsonb);
drop function if exists app.v39_kids_families(uuid, uuid, text, boolean);
drop function if exists app.v39_kids_people_search(uuid, uuid, text);
drop function if exists private.v39_kids_person_json(uuid, uuid, integer);
drop function if exists private.v39_kids_family_status(uuid);
drop function if exists private.v39_kids_whatsapp(uuid);
drop function if exists private.v39_kids_phone(text);
drop function if exists private.v39_kids_audit(uuid, text, text, text, uuid, uuid, text, text, jsonb);
drop function if exists private.v39_kids_photo_ok(uuid, uuid);
drop function if exists private.v39_kids_in_family(uuid, uuid);
drop function if exists private.v39_kids_has_consent(uuid, uuid);
drop function if exists private.v39_kids_purpose(uuid);
drop function if exists private.v39_kids_is_team(uuid);
drop function if exists private.v39_kids_need(uuid, uuid, text);
drop function if exists private.v39_kids_age(date);
drop function if exists private.v39_kids_key();

drop table if exists app.kids_child_profiles;
drop table if exists app.family_members;
drop table if exists app.families;

-- finalidade criada pelo KIDS_2 e sem nenhum consentimento (conferido acima)
delete from app.processing_purposes pp where pp.code = 'kids_care'
   and not exists (select 1 from app.person_consents c where c.purpose_id = pp.id);
-- KIDS2-REVERTER-END

commit;
notify pgrst, 'reload schema';

-- VERIFICACAO (deve dar tudo true)
select
  (select to_regclass('app.families') is null and to_regclass('app.family_members') is null and to_regclass('app.kids_child_profiles') is null) as tabelas_removidas,
  (select count(*) = 0 from pg_proc where proname like 'v39\_kids\_%') as funcoes_removidas,
  (select pg_get_functiondef('app.v39_inst_photo_can_write(uuid,uuid)'::regprocedure) not like '%kids%') as foto_instituto_original,
  (select count(*) = 0 from app.processing_purposes where code = 'kids_care') as finalidade_removida;
