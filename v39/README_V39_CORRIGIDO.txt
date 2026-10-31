2Gather v39 - pacote corrigido após auditoria do boot

1. Edite config_v39.js e preencha somente os 3 valores públicos.
2. Valide o SQL_BOOT_PUBLICO_V39.sql contra as colunas reais antes de executar.
3. Publique todo o conteúdo desta pasta em /v39/.
4. Limpe o service worker/cache antigo uma vez ou abra com DevTools > Application > Clear site data.
5. Confirme no console: V39_CONFIG_STATUS.ok === true.
6. Teste: sem sessão > login; sessão válida > contexto > Pessoas/GCs > home; módulos secundários carregam depois.

Mudanças principais: boot Supabase-first; validação bloqueante de configuração e contexto; onAuthStateChange; carga essencial separada; erros de boot visíveis; cadastro e política sem Apps Script; SW corrigido; fallback de navegação restrito.

CORRECAO TESTE 8 - CSP E ICONES
- Copie o bloco de _headers_v39 para o arquivo _headers da RAIZ do projeto Cloudflare Pages.
- A CSP permite o SDK Supabase em cdn.jsdelivr.net e as conexoes HTTPS/WSS do Supabase.
- Os PNGs icon-192.png e favicon-32.png foram regenerados e validados.
- Depois da publicacao, remova o service worker/cache antigo uma vez e recarregue /v39/.
