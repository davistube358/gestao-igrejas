# Build 69D.12 - revisão estrutural

## Correções aplicadas
- Remove o shell paralelo criado no D11.
- Não altera o DOM interno de `#s-app`.
- Restaura sessão Supabase e adapta contexto/core para as chaves que o `app.js` completo já utiliza.
- Persiste `gcbv5_cfg` e `gcbv5_db`, recarrega uma única vez e permite que o próprio `app.js` execute `iniciarApp()`, `validarContexto()` e `render()`.
- Preserva a restauração automática de sessão; pedir senha em todo refresh seria regressão.
- Atualiza o Service Worker para network-first e remove caches antigos, evitando servir D11 após publicação.
- Não renderiza CPF no adaptador.

## Limite comprovado
Esta correção restaura o shell completo. Não transforma automaticamente ações legadas ainda sem contrato Supabase aprovado em operações válidas. Essas ações devem continuar fail-closed até seus contratos/RPCs serem validados.
