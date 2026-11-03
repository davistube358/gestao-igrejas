2Gather Build 69D17
1. Renomear app_v39_build69D16_final.js para app.js e substituir /v39/app.js.
2. Subir app_v39_write_bridge.js em /v39/.
3. No index.html, carregar app_v39_write_bridge.js depois de app_v39_mutation_gateway.js e antes de app.js.
4. app_v39.js permanece separado e deve existir em /v39/app_v39.js.
5. GC existente: habilitado pelo Supabase. Criacao de GC e demais writes sem contrato: fail-closed, sem logout.
