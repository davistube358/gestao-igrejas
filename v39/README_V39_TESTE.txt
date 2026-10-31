2Gather v39 - pacote de teste isolado

ANTES DE PUBLICAR
1. Edite config_v39.js.
2. Preencha SOMENTE:
   - supabaseUrl: Project URL publica do Supabase
   - supabaseAnonKey: Publishable/anon public key
   - churchId: UUID da igreja de teste
3. Nunca use service_role, sb_secret, senha do banco ou JWT secret.
4. Confirme que nenhum campo COLE_AQUI_ permaneceu no config_v39.js.

PUBLICACAO
- Suba TODO o conteudo desta pasta para uma pasta /v39 no repositorio.
- Nao substitua index.html, app.js, config.js ou sw.js da raiz da v38.
- O arquivo desta pasta chamado index.html deve ficar em /v39/index.html.

HEADERS
- O arquivo _headers fica na raiz do projeto Cloudflare Pages, nao dentro de /v39.
- Acrescente o conteudo do arquivo separado _headers_v39 ao _headers ja existente da raiz.
- Nao substitua o _headers inteiro sem comparar com o atual.

TESTE INICIAL
- Acesse /v39/.
- O selo 'v39 TESTE' deve aparecer.
- Confirme no console que V39_CONFIG_STATUS.ok = true.
- Depois teste login Supabase.

CACHE
- O service worker desta pasta usa cache 2gather-v39-test-1 e escopo ./.
- Ele so e registrado quando a URL contem /v39/.
