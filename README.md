# 2Gather — app (PWA)

App instalável da gestão de igrejas. A tela fica aqui (Cloudflare Pages); os dados continuam na planilha do Google (Apps Script).

## Arquivos
| Arquivo | Para que serve |
|---|---|
| `index.html` | tela do app |
| `app.js` | lógica do app (v26) |
| `config.js` | **endereço do servidor (Apps Script) e do app** — único arquivo que você edita |
| `manifest.webmanifest` | nome, cores e ícones para instalar |
| `sw.js` | guarda a tela no aparelho (abre rápido e sem internet). Não guarda dados |
| `_headers` | regras de segurança da Cloudflare (CSP, sem iframe) |
| `lib/` | mapa (Leaflet) |
| `icons/` | ícones 2Gather (Android, iPhone, aba do navegador) |

## Publicar (primeira vez)
1. **Apps Script:** cole o `Codigo_v23.txt` no `Código.gs` e o `Index_v26_2Gather_AppsScript.html` no arquivo `Index` → **Implantar → Gerenciar implantações → lápis → Nova versão**.
2. **GitHub:** no repositório `gestao-igrejas` → *Add file → Upload files* → arraste **todo o conteúdo desta pasta** (não a pasta em si) → *Commit*.
3. **Cloudflare:** *Workers & Pages → Create → Pages → Connect to Git* → escolha o repositório.
   - Framework: **None** · Build command: **(vazio)** · Output directory: **/**
   - Nome do projeto: `2gather` → endereço `https://2gather.pages.dev` (se o nome estiver ocupado, a Cloudflare sugere outro).
4. Se o endereço for diferente de `https://2gather.pages.dev`, edite `config.js` (`appUrl` e `origens`) no GitHub → *Commit*. A Cloudflare publica sozinha em ~1 minuto.
5. Abra o endereço no celular, entre e teste.
6. Na planilha: **menu 2Gather → 10. Definir endereço do app** → cole o endereço. Quem abrir o link antigo verá “O app mudou de endereço”.

## Instalar no celular
- **Android (Chrome):** abrir o endereço → menu ⋮ → **Instalar app** (ou Conta → “Instalar o app neste aparelho”).
- **iPhone:** abrir **no Safari** → Compartilhar → **Adicionar à Tela de Início**.

## Atualizar o app depois
1. Substitua o(s) arquivo(s) no GitHub (*Upload files* → *Commit*).
2. Em `sw.js`, aumente a versão: `var VERSAO = '2gather-v27';`.
3. Quem estiver com o app aberto vê **“Nova versão do 2Gather disponível — Atualizar”**.

## Segurança
- Os dados vão **só no corpo** das requisições (POST); nada trafega na URL.
- O servidor continua exigindo login, sessão de 7 dias e as permissões por nível.
- `_headers` bloqueia o app dentro de outros sites e só permite conexões com o Apps Script e o ViaCEP.
