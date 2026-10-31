/* 2Gather v39 - configuração pública. Nunca use service_role ou segredos. */
window.V39_CONFIG=Object.freeze({
  supabaseUrl:'https://kybrwsxvdbwjtwakczyj.supabase.co',
  supabaseAnonKey:'sb_publishable_eYAiKCusJIf-mBLiXflj1w_lQw6ALW1',
  churchId:'51ee3c29-8b22-4492-a2ee-b3d7969f5426',
  publicGrowthGroupsRpc:'v39_public_growth_groups',
  publicPrivacyPolicyRpc:'v39_get_public_privacy_policy'
});
window.APP_CONFIG=window.APP_CONFIG||{};
(function(){
  var c=window.V39_CONFIG||{},erros=[],uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if(!c.supabaseUrl||/^COLE_AQUI_/.test(c.supabaseUrl))erros.push('Project URL não preenchida');else if(!/^https:\/\/.+\.supabase\.co\/?$/i.test(c.supabaseUrl))erros.push('Project URL inválida');
  if(!c.supabaseAnonKey||/^COLE_AQUI_/.test(c.supabaseAnonKey))erros.push('Chave pública não preenchida');
  if(!c.churchId||/^COLE_AQUI_/.test(c.churchId))erros.push('churchId não preenchido');else if(!uuid.test(c.churchId))erros.push('churchId não é UUID válido');
  window.V39_CONFIG_STATUS=Object.freeze({ok:erros.length===0,errors:erros.slice(),build:'39-boot-audit-fixed-20261031-7'});
  if(erros.length)console.warn('[2Gather v39] configuração incompleta:',erros.join(' | '));
})();
