/* 2Gather v39 P1.2 - Financeiro / Relatorios no schema real Supabase
 * Leitura: views financeiras consolidadas do schema app.
 * Escrita: somente RPCs transacionais especializadas; este modulo nao faz INSERT/UPDATE direto.
 */
(function(){
'use strict';
var V=window.G2_V39=window.G2_V39||{};
function n(v){v=Number(v);return Number.isFinite(v)?v:0;}
function needClient(){if(!V.client)throw new Error('FIN_CLIENT_UNAVAILABLE');return V.client;}
function church(){if(!V.churchContext||!V.churchContext.ensure)throw new Error('FIN_CHURCH_CONTEXT_UNAVAILABLE');return V.churchContext.ensure();}
async function rows(view,select,filters,order){
  var q=needClient().schema('app').from(view).select(select||'*').eq('church_id',church());
  (filters||[]).forEach(function(f){if(f.v===undefined||f.v===null||f.v==='')return;if(f.op==='gte')q=q.gte(f.c,f.v);else if(f.op==='lte')q=q.lte(f.c,f.v);else if(f.op==='eq')q=q.eq(f.c,f.v);else if(f.op==='in')q=q.in(f.c,f.v);});
  if(order)q=q.order(order.c,{ascending:order.asc!==false});
  var r=await q;if(r.error)throw r.error;return r.data||[];
}
async function listCatalog(table,select){
  var cid=church(), q=needClient().schema('app').from(table).select(select||'*');
  /* Catalogos podem conter linhas globais (church_id null) e da igreja. */
  q=q.or('church_id.is.null,church_id.eq.'+cid);
  var r=await q;if(r.error)throw r.error;return r.data||[];
}
function sum(xs,key){return xs.reduce(function(a,x){return a+n(x[key]);},0);}
function periodFilters(from,to,col){var a=[];if(from)a.push({c:col,op:'gte',v:from});if(to)a.push({c:col,op:'lte',v:to});return a;}

V.financeReports={
  version:'P1.2',
  schema:'app',
  sources:{
    book:'financial_daily_book',
    accountBalances:'financial_account_balances',
    period:'financial_period_summary',
    result:'financial_result_summary',
    sourceResults:'financial_source_results',
    payables:'financial_accounts_payable',
    commitments:'financial_commitment_summary',
    cardIntegrity:'financial_card_statement_integrity'
  },

  catalogs:async function(){
    if(V.financeView&&V.financeView.list){try{return await V.financeView.list();}catch(e){/* fallback read-only below */}}
    var r=await Promise.all([
      listCatalog('financial_accounts','*'),
      listCatalog('financial_categories','*'),
      listCatalog('financial_payees','*'),
      listCatalog('financial_payment_methods','*')
    ]);
    return{accounts:r[0],categories:r[1],payees:r[2],paymentMethods:r[3]};
  },

  book:async function(opt){opt=opt||{};var f=periodFilters(opt.from,opt.to,'movement_date');if(opt.status)f.push({c:'status',op:'eq',v:opt.status});if(opt.accountId)f.push({c:'account_id',op:'eq',v:opt.accountId});if(opt.categoryId)f.push({c:'category_id',op:'eq',v:opt.categoryId});if(opt.sourceModule)f.push({c:'source_module',op:'eq',v:opt.sourceModule});return rows('financial_daily_book','*',f,{c:'movement_date',asc:false});},

  balances:function(){return rows('financial_account_balances','*',[],{c:'account_name',asc:true});},
  payables:function(){return rows('financial_accounts_payable','*',[],{c:'due_on',asc:true});},
  commitments:function(){return rows('financial_commitment_summary','*',[],{c:'next_due_on',asc:true});},
  cardIntegrity:function(){return rows('financial_card_statement_integrity','*',[],{c:'reference_year',asc:false});},
  sourceResults:async function(opt){opt=opt||{};var f=periodFilters(opt.from,opt.to,'reference_date');if(opt.sourceModule)f.push({c:'source_module',op:'eq',v:opt.sourceModule});return rows('financial_source_results','*',f,{c:'reference_date',asc:false});},

  result:async function(opt){opt=opt||{};var data=await rows('financial_result_summary','*',periodFilters(opt.from,opt.to,'movement_date'),{c:'movement_date',asc:true});return{rows:data,income:sum(data,'income_amount'),expense:sum(data,'expense_amount'),net:sum(data,'net_result')};},

  period:async function(opt){opt=opt||{};var data=await rows('financial_period_summary','*',periodFilters(opt.from,opt.to,'movement_date'),{c:'movement_date',asc:true});return{rows:data,income:sum(data,'total_income'),expense:sum(data,'total_expense'),netTransfer:sum(data,'net_transfer'),net:sum(data,'total_income')-sum(data,'total_expense')};},

  load:async function(opt){
    opt=opt||{};
    var r=await Promise.all([
      this.result(opt),this.balances(),this.payables(),this.commitments(),this.sourceResults(opt),this.catalogs()
    ]);
    return{
      resumo:{entradas:r[0].income,saidas:r[0].expense,resultado:r[0].net},
      resultado:r[0],saldos:r[1],contasAPagar:r[2],compromissos:r[3],origens:r[4],catalogos:r[5],
      _v39:true,_schemaActual:true,_version:this.version
    };
  },

  report:async function(opt){
    var x=await this.load(opt||{}), book=await this.book(opt||{});
    return{
      resumo:x.resumo,
      livro:book,
      saldos:x.saldos,
      contasAPagar:x.contasAPagar,
      compromissos:x.compromissos,
      origens:x.origens,
      catalogos:x.catalogos,
      _v39:true,_version:this.version
    };
  }
};

/* Compatibilidade de leitura com telas/diagnosticos existentes. */
window.G2_V39_FINANCE_REPORT=function(opt){return V.financeReports.report(opt||{});};
})();
