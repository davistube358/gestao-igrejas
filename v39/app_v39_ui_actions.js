/* 2Gather v39 Build 69D.8 - login UI + restore visual de sessao */
(function(){
'use strict';
var V=window.G2_V39=window.G2_V39||{};
var restoring=false;

function value(id){var e=document.getElementById(id);return e?String(e.value||'').trim():'';}
function showError(message){var e=document.getElementById('l-erro');if(!e)return;e.textContent=message||'Nao foi possivel entrar.';e.classList.remove('hide');}
function clearError(){var e=document.getElementById('l-erro');if(!e)return;e.textContent='';e.classList.add('hide');}
function busy(on){var b=document.getElementById('b-entrar');if(!b)return;b.disabled=!!on;b.textContent=on?'Entrando...':'Entrar';}
function setView(authenticated){
  var login=document.getElementById('s-login');
  var cadastro=document.getElementById('s-cadastro');
  var app=document.getElementById('s-app');
  if(authenticated){
    if(login)login.classList.add('hide');
    if(cadastro)cadastro.classList.add('hide');
    if(app)app.classList.remove('hide');
  }else{
    if(app)app.classList.add('hide');
    if(login)login.classList.remove('hide');
  }
}
async function restoreSession(){
  if(restoring)return V.runtime&&V.runtime.state;
  restoring=true;
  try{
    if(!V.runtime||typeof V.runtime.start!=='function')throw new Error('Runtime v39 indisponivel.');
    var state=await V.runtime.start();
    var ok=!!(state&&state.authenticated&&state.context&&state.context.authUser);
    setView(ok);
    if(ok){
      V.context=state.context;
      window.dispatchEvent(new CustomEvent('2gather:v39-ui-ready',{detail:{churchId:state.churchId,context:state.context}}));
    }
    return state;
  }catch(err){
    console.error('[2Gather v39 restore]',err);
    setView(false);
    return null;
  }finally{restoring=false;}
}
async function login(){
  var usuario=value('l-usuario'),senha=value('l-senha');
  if(!usuario||!senha){showError('Informe o usuario e a senha.');return;}
  busy(true);clearError();
  try{
    if(typeof V.signIn!=='function')throw new Error('Login v39 indisponivel.');
    var result=await V.signIn(usuario,senha);
    var context=result&&result.context?result.context:await V.sessionContext();
    if(!context||!context.authUser)throw new Error('Sessao autenticada sem contexto de acesso.');
    V.context=context;
    if(V.runtime&&V.runtime.state){V.runtime.state.authenticated=true;V.runtime.state.context=context;}
    var state=await restoreSession();
    if(!(state&&state.authenticated))throw new Error('Runtime nao reconheceu a sessao autenticada.');
  }catch(err){
    console.error('[2Gather v39 login]',err);
    showError(err&&err.message?err.message:'Usuario ou senha incorretos.');
  }finally{busy(false);}
}
function intercept(e){var b=e.target&&e.target.closest?e.target.closest('#b-entrar'):null;if(!b)return;e.preventDefault();e.stopImmediatePropagation();login();}
document.addEventListener('click',intercept,true);
document.addEventListener('keydown',function(e){if(e.key!=='Enter')return;var a=document.activeElement;if(!a||!/^l-(usuario|senha)$/.test(a.id))return;e.preventDefault();e.stopImmediatePropagation();login();},true);
V.uiActions=V.uiActions||{};
V.uiActions.login=login;
V.uiActions.restoreSession=restoreSession;
V.uiActions.logout=async function(){if(typeof V.signOut==='function')await V.signOut();if(V.runtime&&V.runtime.state){V.runtime.state.started=false;V.runtime.state.authenticated=false;V.runtime.state.churchId=null;V.runtime.state.context=null;}setView(false);};
V.uiActions.core=function(){return V.loadCore(V.churchContext&&V.churchContext.ensure?V.churchContext.ensure():null);};
function autoRestore(){restoreSession();}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',autoRestore,{once:true});else autoRestore();
})();
