/* 2Gather v39 Build 19 - operacoes reais da UI v38 */
(function(){'use strict';var V=window.G2_V39=window.G2_V39||{};
function church(){return V.churchContext.ensure();}
function text(v){return String(v||'').trim().toLocaleLowerCase('pt-BR');}
function digits(v){return String(v||'').replace(/\D/g,'');}
function adaptCheck(p,input){var nome=p.name||p.nome||'',fone=p.phone||p.mobile_phone||p.fone||'',nasc=p.birth_date||p.nasc||'',qName=text(input.nome),pName=text(nome),qPhone=digits(input.fone),pPhone=digits(fone),qBirth=String(input.nasc||'');var samePhone=!!(qPhone&&pPhone&&qPhone===pPhone),sameBirth=!!(qBirth&&nasc&&String(nasc).slice(0,10)===qBirth),nameLike=!!(qName&&pName&&(pName.indexOf(qName)>=0||qName.indexOf(pName)>=0));if(!samePhone&&!sameBirth&&!nameLike)return null;return{id:p.id,nome:nome,gc:p.growth_group_name||p.gc_nome||'',lider:p.leader_name||p.liderNome||'',tipo:p.type||p.tipo||'',status:p.status||'',mesmoFone:samePhone,forte:samePhone||(sameBirth&&nameLike)};}
V.uiActions={
 salvarGC:function(d){d=(d&&d.gc)||d||{};var row={church_id:church()};if(d.id)row.id=d.id;if(d.nome!==undefined)row.name=d.nome;if(d.status!==undefined)row.status=d.status;if(d.liderId!==undefined)row.leader_person_id=d.liderId||null;return V.integration.call('v39.groups.save',{row:row}).then(function(r){var out=r&&r.data!==undefined?r.data:r;window.dispatchEvent(new CustomEvent('2gather:v39-gc-saved',{detail:out||{}}));return out;});},
 usuarios:function(){return V.userView.list().then(function(users){return {usuarios:users||[],log:[]};});},
 logout:function(){return V.integration.call('v39.logout',{});},
 core:function(){return V.integration.call('v39.core',{});},
 /* Operacao real do cadastro de visitante/membro. A leitura usa people da igreja ativa e devolve o contrato {itens:[]}. */
 checarPessoa:function(input){return V.integration.call('v39.people.list',{churchId:church()}).then(function(r){var list=r&&r.data!==undefined?r.data:r;return{itens:(list||[]).map(function(p){return adaptCheck(p,input||{});}).filter(Boolean).slice(0,20)};});}
};
V.callUI=function(action,payload,progress){var fn=V.uiActions[action];if(typeof fn==='function')return Promise.resolve(fn(payload||{},progress));return V.integration.legacy?V.integration.legacy(action,payload,progress):Promise.reject(new Error('Acao UI sem backend: '+action));};
})();
