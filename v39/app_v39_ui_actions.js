/* 2Gather v39 Build 69D.6 - UI actions + real login cutover */
(function(){
'use strict';
var V=window.G2_V39=window.G2_V39||{};
function value(id){var e=document.getElementById(id);return e?String(e.value||'').trim():'';}
function errorBox(message){var e=document.getElementById('l-erro');if(!e)return;e.textContent=message||'Não foi possível entrar.';e.classList.remove('hide');}
function busy(on){var b=document.getElementById('b-entrar');if(!b)return;b.disabled=!!on;b.textContent=on?'Entrando...':'Entrar';}
async function login(){
  var usuario=value('l-usuario'),senha=value('l-senha');
  if(!usuario||!senha){errorBox('Informe o usuário e a senha.');return;}
  busy(true);
  try{
    if(!V||typeof V.signIn!=='function')throw new Error('Login v39 indisponível.');
    var result=await V.signIn(usuario,senha);
    var context=result&&result.context?result.context:await V.sessionContext();
    if(!context||!context.authUser)throw new Error('Sessão autenticada sem contexto de acesso.');
    var churches=context.churches||[];
    if(V.runtime&&typeof V.runtime.start==='function')await V.runtime.start();
    if(V.churchContext&&churches.length===1&&typeof V.churchContext.select==='function'){
      var access=churches[0]||{};
      var churchId=access.church_id||(access.churches&&access.churches.id);
      if(churchId)V.churchContext.select(churchId);
    }
    window.dispatchEvent(new CustomEvent('2gather:v39-login-success',{detail:{context:context}}));
    location.reload();
  }catch(err){
    console.error('[2Gather v39 login]',err);
    errorBox(err&&err.message?err.message:'Usuário ou senha incorretos.');
    busy(false);
  }
}
function intercept(e){var b=e.target&&e.target.closest?e.target.closest('#b-entrar'):null;if(!b)return;e.preventDefault();e.stopImmediatePropagation();login();}
document.addEventListener('click',intercept,true);
document.addEventListener('keydown',function(e){if(e.key!=='Enter')return;var a=document.activeElement;if(!a||!/^l-(usuario|senha)$/.test(a.id))return;e.preventDefault();e.stopImmediatePropagation();login();},true);
V.uiActions=V.uiActions||{};
V.uiActions.login=login;
V.uiActions.logout=function(){return V.signOut();};
V.uiActions.core=function(){return V.loadCore(V.churchContext&&V.churchContext.ensure?V.churchContext.ensure():null);};
})();
