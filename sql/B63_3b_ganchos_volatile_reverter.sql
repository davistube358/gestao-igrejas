-- =====================================================================
-- B63_3b · REVERTER · volta as 4 funcoes a STABLE
-- ATENCAO: com o gancho do B63_3 ainda la, STABLE volta a dar HTTP 405 nas 4 RPCs.
--   Use so como parte da reversao do B63_3 (rode este e depois o B63_3_auditoria_reverter.sql).
-- =====================================================================
begin;

alter function app.v39_inst_patient_photo(uuid,uuid) stable;
alter function app.v39_est_prescription(uuid,jsonb) stable;
alter function app.v39_fin_grant_report(uuid,uuid,date,date) stable;
alter function app.v39_fin_report(uuid,integer,integer) stable;

commit;

select (select count(*) = 4 from pg_proc
         where oid in ('app.v39_inst_patient_photo(uuid,uuid)'::regprocedure, 'app.v39_est_prescription(uuid,jsonb)'::regprocedure,
                       'app.v39_fin_grant_report(uuid,uuid,date,date)'::regprocedure, 'app.v39_fin_report(uuid,integer,integer)'::regprocedure)
           and provolatile = 's') as quatro_stable;
