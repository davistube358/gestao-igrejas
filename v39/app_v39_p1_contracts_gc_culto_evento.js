/* 2Gather v39 P1.2 - fechamento de contratos GC / Culto / Evento */
(function(){'use strict';
var V=window.G2_V39=window.G2_V39||{}, P=V.p1=V.p1||{}, M=P.handlers=P.handlers||{};
function fail(code,msg){var e=new Error(msg);e.code=code;throw e;}
function churchId(i){var id=(i&&(i.churchId||i.church_id))||(V.runtime&&V.runtime.state&&V.runtime.state.churchId)||(window.__gc&&window.__gc.cfg&&window.__gc.cfg().usuario&&window.__gc.cfg().usuario.igrejaId);if(!id)fail('CHURCH_REQUIRED','Igreja ativa obrigatoria.');return id;}
async function rpc(name,args){if(!V.client&&V.init)await V.init();if(!V.client)fail('V39_CLIENT_UNAVAILABLE','Cliente Supabase indisponivel.');var r=await V.client.schema('app').rpc(name,args||{});if(r.error)throw r.error;return r.data;}
function val(o){return o===undefined||o===null||o===''?null:o;}
function statusGC(v){v=String(v||'').trim().toLowerCase();if(!v)return 'active';if(['ativo','ativa','aberto','aberta','active'].indexOf(v)>=0)return 'active';if(['inativo','inativa','fechado','fechada','inactive'].indexOf(v)>=0)return 'inactive';return v;}
function statusEvento(v,deleted,released){v=String(v||'').trim().toLowerCase();if(deleted)return 'cancelled';if(released&&!v)return 'open';var m={rascunho:'draft',planejado:'planned',planejada:'planned',aberto:'open',aberta:'open',realizado:'completed',realizada:'completed',concluido:'completed',concluida:'completed',cancelado:'cancelled',cancelada:'cancelled'};return m[v]||v||'planned';}
function envelope(data,key){var r={ok:true,data:data};r[key]=data;return r;}
function gcpayload(d){d=d||{};var p={
 name:val(d.name||d.nome),status:statusGC(d.status),group_type:val(d.group_type||d.tipoGC||d.tipo),audience:val(d.audience||d.publico),
 age_range_min:val(d.age_range_min!=null?d.age_range_min:d.idadeMin),age_range_max:val(d.age_range_max!=null?d.age_range_max:d.idadeMax),
 phone:val(d.phone||d.fone||d.telefone),postal_code:val(d.postal_code||d.cep),street:val(d.street||d.logradouro||d.endereco),street_number:val(d.street_number||d.numero),
 complement:val(d.complement||d.complemento),district:val(d.district||d.bairro),city:val(d.city||d.cidade),state_code:val(d.state_code||d.uf),
 reference_point:val(d.reference_point||d.referencia||d.pontoReferencia),started_at:val(d.started_at||d.inicio||d.dataInicio),notes:val(d.notes||d.obs||d.observacoes)
};if(!p.name)fail('GC_NAME_REQUIRED','Nome do GC e obrigatorio.');return p;}
function cultopayload(d){d=d||{};var tipo=val(d.service_type||d.tipoCulto||d.tipo)||'culto';var title=val(d.title||d.titulo||d.nome)||tipo;var p={
 service_type:tipo,title:title,service_date:val(d.service_date||d.data),starts_at:val(d.starts_at||d.inicio||d.horaInicio),ends_at:val(d.ends_at||d.fim||d.horaFim),
 preacher_person_id:val(d.preacher_person_id||d.pregadorPessoaId),preacher_name_text:val(d.preacher_name_text||d.pregador),scripture_reference:val(d.scripture_reference||d.referenciaBiblica),
 theme:val(d.theme||d.tema||d.tituloPalavra),message_summary:val(d.message_summary||d.resumoMensagem||d.depois),announcements:val(d.announcements||d.avisos||d.antes),
 notes:val(d.notes||d.obs),location_text:val(d.location_text||d.local),status:val(d.status)||'planned',attendance_opens_at:val(d.attendance_opens_at),attendance_closes_at:val(d.attendance_closes_at),
 financial_entry_opens_at:val(d.financial_entry_opens_at),financial_entry_closes_at:val(d.financial_entry_closes_at)
};if(!p.service_date)fail('WORSHIP_REQUIRED_FIELD','Data do culto e obrigatoria.');if(!p.title)fail('WORSHIP_REQUIRED_FIELD','Titulo do culto e obrigatorio.');return p;}
function eventpayload(d){d=d||{};var data=val(d.data||d.event_date),inicio=val(d.inicio||d.start_time),fim=val(d.fim||d.end_time);return{
 name:val(d.name||d.titulo||d.title),event_type:val(d.event_type||d.tipo)||'event',description:val(d.description||d.descricao),responsible_person_id:val(d.responsible_person_id||d.responsavelPessoaId),
 starts_at:val(d.starts_at)||(data?(data+(inicio?'T'+inicio: 'T00:00:00')):null),ends_at:val(d.ends_at)||(data&&fim?(data+'T'+fim):null),location_text:val(d.location_text||d.local),
 capacity:val(d.capacity||d.capacidade),status:statusEvento(d.status,d.deleted,d.liberado),notes:val(d.notes||d.obs),reason:val(d.reason||d.motivo||d.cancellation_reason)
};}
M.salvarGC=async function(i){var d=(i&&i.gc)||i||{},id=d.id||d.growth_group_id||null,p=gcpayload(d),x=id?await rpc('update_growth_group',{p_growth_group_id:id,p_patch:p}):await rpc('create_growth_group',{p_church_id:churchId(i),p_payload:p});return envelope(x,'gc');};
M.salvarCulto=async function(i){var d=(i&&i.culto)||i||{},x=await rpc('save_worship_service',{p_church_id:churchId(i),p_worship_service_id:d.id||d.worship_service_id||null,p_payload:cultopayload(d),p_reason:val(d.reason||d.motivo)});return envelope(x,'culto');};
M.salvarEvento=async function(i){var d=(i&&i.evento)||i||{},p=eventpayload(d);if(!p.name)fail('EVENT_TITLE_REQUIRED','Titulo do evento e obrigatorio.');if(!p.starts_at)fail('EVENT_START_REQUIRED','Data/inicio do evento e obrigatorio.');var x=await rpc('v39_save_church_event',{p_church_id:churchId(i),p_event_id:d.id||d.event_id||null,p_payload:p});return envelope(x,'evento');};
P.contracts=P.contracts||{};P.contracts.gc=gcpayload;P.contracts.culto=cultopayload;P.contracts.evento=eventpayload;
})();
