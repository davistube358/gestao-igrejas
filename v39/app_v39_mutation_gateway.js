/* 2Gather v39 Build 69D.15 - gateway central de mutacoes */
(function(){
'use strict';
var V=window.G2_V39=window.G2_V39||{};
function fault(action,code,reason){var e=new Error(reason||'Esta operacao ainda nao esta liberada no backend v39. Nenhuma alteracao foi realizada.');e.code=code||'V39_CONTRACT_UNAVAILABLE';e.action=action;return e;}
var p={};
function enabled(action,handler){p[action]={status:'enabled',handler:handler};}
function blocked(action,reason){p[action]={status:'blocked',reason:reason};}
V.mutationGateway={
 policy:p,
 register:enabled,
 block:blocked,
 isMutation:function(a){return !!p[a];},
 canHandle:function(a){return !!(p[a]&&p[a].status==='enabled'&&typeof p[a].handler==='function');},
 execute:function(action,payload,progress){var x=p[action];if(!x) return Promise.reject(fault(action,'V39_MUTATION_NOT_MAPPED','Operacao de escrita v39 nao mapeada: '+action+'. Nenhuma alteracao foi realizada.'));if(x.status!=='enabled')return Promise.reject(fault(action,'V39_CONTRACT_UNAVAILABLE',x.reason));try{return Promise.resolve(x.handler(payload||{},progress));}catch(e){return Promise.reject(e);}},
 summary:function(){var o={enabled:[],blocked:[]};Object.keys(p).sort().forEach(function(a){o[p[a].status].push(a);});return o;}
};
/* Rotas comprovadas */
enabled('salvarGC',function(x){if(!V.uiActions||typeof V.uiActions.salvarGC!=='function')throw fault('salvarGC','V39_HANDLER_UNAVAILABLE','Handler Supabase salvarGC indisponivel.');return V.uiActions.salvarGC(x);});
enabled('v39.groups.save',function(x){return V.repo.groups.save(x.row||x.gc||x);});
enabled('v39.people.save',function(x){return V.repo.people.save(x.row||x);});
enabled('v39.announcements.save',function(x){return V.repo.announcements.save(x.row||x);});
enabled('v39.prayers.save',function(x){return V.repo.prayers.save(x.row||x);});
/* Bloqueadores conhecidos */
['instProntuarioDe','instRegistro'].forEach(function(a){blocked(a,'Conteudo clinico permanece bloqueado ate validacao do contrato criptografico. Nenhuma alteracao foi realizada.');});
['msgDestinatarios','msgEnviarAgora','msgMarcarEnvio','midiaEvento'].forEach(function(a){blocked(a,'Comunicacao outbound ainda nao esta liberada no backend v39. Nenhuma alteracao foi realizada.');});
['salvarUsuario','corrigirUsuario','excluirUsuario','redefinirSenha','sairTodos','encerrarSessoes'].forEach(function(a){blocked(a,'Administracao de identidade ainda nao esta liberada neste gateway v39. Nenhuma alteracao foi realizada.');});
['aceitarPolitica','anonimizarPessoa','auditoria'].forEach(function(a){blocked(a,'LGPD/Auditoria ainda nao possui contrato v39 homologado. Nenhuma alteracao foi realizada.');});
/* Acoes de escrita do shell original ainda sem contrato explicitamente comprovado */
['salvarPessoa','criarPessoa','salvarVisitante','cadastrarVisitante','salvarEncontro','salvarCulto','salvarEvento','salvarReuniao','salvarAula','salvarFinanceiro','estEntrada','estBaixa','estEstornar','estReceita'].forEach(function(a){if(!p[a])blocked(a,'Esta operacao ainda nao esta liberada no gateway v39. Nenhuma alteracao foi realizada e a sessao foi mantida.');});
})();
