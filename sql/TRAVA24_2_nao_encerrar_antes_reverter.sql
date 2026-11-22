-- =====================================================================
-- TRAVA24_2 · REVERTER · volta app.v39_registro_encerrar à versão da TRAVA24_1 (md5 do corpo dfef6b98...)
-- =====================================================================
begin;

create or replace function app.v39_registro_encerrar(p_church_id uuid, p_tipo text, p_id uuid) returns jsonb
language plpgsql security definer set search_path = pg_catalog, app, private as $f$
declare v_me uuid := app.current_user_account_id(); m app.growth_group_meetings; e app.church_events; v_trava timestamptz;
begin
  if v_me is null or app.current_church_user_access_id(p_church_id) is null then
    perform app.raise_domain_error('ACCESS_DENIED', 'Sem acesso ativo a esta igreja');
  end if;
  if p_tipo = 'gc' then
    select * into m from app.growth_group_meetings where id = p_id and church_id = p_church_id for update;
    if m.id is null then perform app.raise_domain_error('GC_MEETING_NOT_FOUND', 'Encontro nao encontrado'); end if;
    if not (private.has_active_profile_in_church(p_church_id, array['master','pastor'])
            or private.has_active_gc_membership(m.growth_group_id, array['leader','co_leader','host','supervisor','participant'])) then
      perform app.raise_domain_error('PERMISSION_DENIED', 'Sem permissao para encerrar este encontro');
    end if;
    if m.status = 'cancelled' then perform app.raise_domain_error('REGISTRO_CANCELADO', 'Encontro cancelado'); end if;
    if m.status <> 'completed' then
      update app.growth_group_meetings set status = 'completed', completed_at = now(), updated_by_user_account_id = v_me where id = m.id;
      select * into m from app.growth_group_meetings where id = m.id;
    end if;
    v_trava := private.v39_trava_gc(m);
    return jsonb_build_object('ok', true, 'status', m.status, 'encerradoEm', m.completed_at, 'travaEm', v_trava);
  elsif p_tipo = 'evento' then
    select * into e from app.church_events where id = p_id and church_id = p_church_id for update;
    if e.id is null then perform app.raise_domain_error('EVENT_NOT_FOUND', 'Culto ou evento nao encontrado'); end if;
    if not private.has_active_profile_in_church(p_church_id, array['master','pastor','secretary','secretariat','treasury']) then
      perform app.raise_domain_error('PERMISSION_DENIED', 'Sem permissao para encerrar este culto/evento');
    end if;
    if e.status = 'cancelled' then perform app.raise_domain_error('REGISTRO_CANCELADO', 'Culto/evento cancelado'); end if;
    if e.status <> 'completed' then
      update app.church_events set status = 'completed', completed_at = now(), updated_by_user_account_id = v_me where id = e.id;
      select * into e from app.church_events where id = e.id;
    end if;
    v_trava := private.v39_trava_evento(e);
    return jsonb_build_object('ok', true, 'status', e.status, 'encerradoEm', e.completed_at, 'travaEm', v_trava);
  end if;
  perform app.raise_domain_error('TIPO_INVALIDO', 'Tipo deve ser gc ou evento');
end $f$;

commit;

notify pgrst, 'reload schema';

select (select md5(prosrc) = 'dfef6b987dc5b7836c197bb227ed4280' from pg_proc where oid = 'app.v39_registro_encerrar(uuid,text,uuid)'::regprocedure) as versao_trava24_1;
