-- 2Gather v39: contratos públicos mínimos para cadastro e política.
-- Revise os nomes das colunas de app.growth_groups e app.church_settings antes de executar.
create or replace function public.v39_public_growth_groups(p_church_id uuid)
returns table(id uuid,name text) language sql security definer set search_path=app,public stable as $$
  select g.id,g.name from app.growth_groups g where g.church_id=p_church_id and g.status='active' order by g.name;
$$;
revoke all on function public.v39_public_growth_groups(uuid) from public;
grant execute on function public.v39_public_growth_groups(uuid) to anon,authenticated;

create or replace function public.v39_get_public_privacy_policy(p_church_id uuid)
returns jsonb language sql security definer set search_path=app,public stable as $$
  select jsonb_build_object('text',coalesce((select cs.setting_value #>> '{}' from app.church_settings cs where cs.church_id=p_church_id and cs.setting_key='politicaTexto' and cs.is_active=true order by cs.updated_at desc limit 1),''));
$$;
revoke all on function public.v39_get_public_privacy_policy(uuid) from public;
grant execute on function public.v39_get_public_privacy_policy(uuid) to anon,authenticated;
