2Gather v39 - pacote corrigido após auditoria do boot

1. Edite config_v39.js e preencha somente os 3 valores públicos.
2. Valide o SQL_BOOT_PUBLICO_V39.sql contra as colunas reais antes de executar.
3. Publique todo o conteúdo desta pasta em /v39/.
4. Limpe o service worker/cache antigo uma vez ou abra com DevTools > Application > Clear site data.
5. Confirme no console: V39_CONFIG_STATUS.ok === true.
6. Teste: sem sessão > login; sessão válida > contexto > Pessoas/GCs > home; módulos secundários carregam depois.

Mudanças principais: boot Supabase-first; validação bloqueante de configuração e contexto; onAuthStateChange; carga essencial separada; erros de boot visíveis; cadastro e política sem Apps Script; SW corrigido; fallback de navegação restrito.
