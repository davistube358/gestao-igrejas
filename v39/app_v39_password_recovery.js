/* 2Gather v39 Build 69D.3 - password recovery handler */
(function(){
'use strict';
var V=window.G2_V39=window.G2_V39||{};
function recoveryParams(){
  var h=new URLSearchParams((location.hash||'').replace(/^#/,''));
  var q=new URLSearchParams(location.search||'');
  return {
    type:h.get('type')||q.get('type')||'',
    access_token:h.get('access_token')||'',
    refresh_token:h.get('refresh_token')||'',
    error:h.get('error_description')||h.get('error')||q.get('error_description')||q.get('error')||''
  };
}
function clearTokens(){history.replaceState(null,document.title,location.pathname+location.search.replace(/([?&])(type|code|token_hash)=[^&]*/g,'').replace(/[?&]$/,''));}
function makeBox(){
  var overlay=document.createElement('div'); overlay.id='v39-recovery-overlay';
  overlay.style.cssText='position:fixed;inset:0;z-index:99999;background:#f5f7fb;display:flex;align-items:center;justify-content:center;padding:20px;font-family:system-ui,-apple-system,Segoe UI,sans-serif';
  overlay.innerHTML='<form id="v39-recovery-form" style="width:min(460px,100%);background:#fff;border-radius:24px;padding:28px;box-shadow:0 12px 40px rgba(0,0,0,.10)"><h2 style="margin:0 0 8px">Definir nova senha</h2><p style="margin:0 0 22px;color:#596273">O link de recuperação foi validado. Digite e confirme a nova senha.</p><label style="display:block;font-weight:700;margin-bottom:6px">Nova senha</label><input id="v39-new-password" type="password" autocomplete="new-password" required minlength="8" style="box-sizing:border-box;width:100%;padding:14px;border:1px solid #ccd3df;border-radius:12px;margin-bottom:16px"><label style="display:block;font-weight:700;margin-bottom:6px">Confirmar nova senha</label><input id="v39-confirm-password" type="password" autocomplete="new-password" required minlength="8" style="box-sizing:border-box;width:100%;padding:14px;border:1px solid #ccd3df;border-radius:12px;margin-bottom:18px"><div id="v39-recovery-msg" role="status" style="min-height:22px;color:#b42318;margin-bottom:10px"></div><button id="v39-recovery-submit" type="submit" style="width:100%;padding:14px;border:0;border-radius:12px;background:#111827;color:#fff;font-weight:800;cursor:pointer">Salvar nova senha</button></form>';
  document.body.appendChild(overlay); return overlay;
}
async function ensureClient(){if(!V.init)throw new Error('Inicializacao Supabase indisponivel.');if(!V.ready||!V.client){var r=await V.init();if(r&&r.error)throw r.error;}return V.client;}
async function start(){
  var p=recoveryParams(); if(p.error){console.error('[2Gather recovery]',p.error);return;} if(p.type!=='recovery'&&!p.access_token)return;
  try{
    var client=await ensureClient();
    if(p.access_token&&p.refresh_token){var sr=await client.auth.setSession({access_token:p.access_token,refresh_token:p.refresh_token});if(sr.error)throw sr.error;}
    var session=await client.auth.getSession(); if(session.error)throw session.error; if(!(session.data&&session.data.session))throw new Error('Sessao de recuperacao indisponivel ou expirada.');
    var box=makeBox(),form=box.querySelector('#v39-recovery-form'),msg=box.querySelector('#v39-recovery-msg'),btn=box.querySelector('#v39-recovery-submit');
    form.addEventListener('submit',async function(e){e.preventDefault();msg.textContent='';var a=box.querySelector('#v39-new-password').value,b=box.querySelector('#v39-confirm-password').value;if(a.length<8){msg.textContent='Use pelo menos 8 caracteres.';return;}if(a!==b){msg.textContent='As senhas não coincidem.';return;}btn.disabled=true;btn.textContent='Salvando...';try{var ur=await client.auth.updateUser({password:a});if(ur.error)throw ur.error;clearTokens();msg.style.color='#067647';msg.textContent='Senha alterada com sucesso. Voltando ao login...';setTimeout(function(){location.replace(location.pathname);},700);}catch(err){msg.style.color='#b42318';msg.textContent=err&&err.message?err.message:'Não foi possível alterar a senha.';btn.disabled=false;btn.textContent='Salvar nova senha';}});
  }catch(err){console.error('[2Gather v39 recovery]',err);}
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
