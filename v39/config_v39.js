/* ============================================================================
   2Gather v39 - CONFIGURACAO PUBLICA DO FRONTEND DE TESTE
   ============================================================================

   SEGURANCA
   - Este arquivo roda no navegador e, portanto, TODO o conteudo dele e publico.
   - Use somente a Project URL e a chave publica (anon/publishable) do Supabase.
   - NUNCA coloque aqui: service_role, secret key, senha de banco, JWT secret,
     access token pessoal, chave privada, senha de usuario ou qualquer outro segredo.
   - A seguranca dos dados deve continuar sendo garantida por RLS + RPCs do backend.

   COMO PREENCHER
   1) No Supabase do ambiente de TESTE, copie a Project URL publica.
   2) Copie a chave publica destinada ao frontend (anon/publishable).
   3) Informe o UUID da igreja de TESTE cadastrada em app.churches.
   4) Nao use dados/chaves de producao enquanto esta pagina estiver marcada como TESTE.

   IMPORTANTE
   - Mantenha este arquivo separado do config.js da v38.
   - Nao substitua o app.js/config.js da v38 para testar a v39.
   - Se algum valor abaixo continuar com o prefixo COLE_AQUI_, a inicializacao deve
     ser considerada incompleta.
   ============================================================================ */

window.V39_CONFIG = Object.freeze({
  supabaseUrl: 'COLE_AQUI_PROJECT_URL_PUBLICA',
  supabaseAnonKey: 'COLE_AQUI_CHAVE_ANON_OU_PUBLISHABLE_PUBLICA',
  churchId: 'COLE_AQUI_UUID_DA_IGREJA_DE_TESTE'
});

/* Compatibilidade temporaria com trechos hibridos herdados da v38.
   Nao inclua apiUrl do Apps Script aqui se a intencao for testar o caminho Supabase. */
window.APP_CONFIG = window.APP_CONFIG || {};

/* Validacao local preventiva. Nao envia dados e nao contem segredos. */
(function validarV39Config() {
  var c = window.V39_CONFIG || {};
  var erros = [];
  var uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  if (!c.supabaseUrl || /^COLE_AQUI_/.test(c.supabaseUrl))
    erros.push('Project URL do Supabase nao preenchida.');
  else if (!/^https:\/\/.+\.supabase\.co\/?$/i.test(c.supabaseUrl))
    erros.push('Project URL do Supabase com formato inesperado.');

  if (!c.supabaseAnonKey || /^COLE_AQUI_/.test(c.supabaseAnonKey))
    erros.push('Chave publica anon/publishable nao preenchida.');

  if (!c.churchId || /^COLE_AQUI_/.test(c.churchId))
    erros.push('UUID da igreja de teste nao preenchido.');
  else if (!uuid.test(c.churchId))
    erros.push('churchId nao parece um UUID valido.');

  window.V39_CONFIG_STATUS = Object.freeze({
    ok: erros.length === 0,
    errors: erros.slice()
  });

  if (erros.length) console.warn('[2Gather v39] Configuracao incompleta:', erros.join(' '));
})();
