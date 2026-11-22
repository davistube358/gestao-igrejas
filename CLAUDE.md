# CLAUDE.md — 2Gather v39

Projeto: plataforma de gestão para igrejas e GCs (PWA + Supabase/PostgreSQL). Dono: Diogo Alexandre Garcia. Idioma: português (Brasil). Projeto pessoal: não misturar conteúdo corporativo.

@AGENTS.md

**Leia antes de qualquer tarefa:** este arquivo, o `AGENTS.md` (acima) e, se existir na sua cópia local, `docs/privado/HANDOVER_2Gather_ClaudeCode.md` (estado, pendências e mapa de documentos; fica fora do Git porque o repositório é público).

## Estrutura do repositório
- Raiz: **v38** (PWA + Apps Script + Sheets), referência funcional. `app.js` = `app_v38.js`.
- `/v39`: **v39** (PWA + Supabase). `app.js` (SYNC-V39-22) + módulos `app_v39_*.js` carregados depois dele. Versões publicadas: ver os `?v=` em `v39/index.html`.
- `.claude/agents/`: time de agentes (orquestrador, data, dev, qa).
- `sql/`: scripts de banco, sempre em par `*_teste_rollback.sql` / `*_aplicar.sql`.
- `docs/privado/`: handovers e documentos internos (ignorado pelo Git).

## Regras inegociáveis
1. **Não regressão.** Não remova nem simplifique campos, ações, filtros, validações, permissões ou relatórios existentes.
2. **Banco real é a autoridade.** Consulte o banco antes de assumir tabela, coluna ou função. O editor do Supabase corta em 100 linhas: filtre.
3. **Escrita só por RPC** no schema `app`. `church_id` nunca vem do navegador como prova de autorização. Toda função nova confere conta ativa e acesso ativo à igreja.
4. **Nada é apagado.** Inativar, cancelar ou estornar, com motivo.
5. **Todo SQL novo tem teste com rollback** antes do script de aplicar. Não execute migration sem aprovação explícita.
6. **Base única de pessoas.** Sem cadastro paralelo.
7. **Financeiro:** compromisso ≠ receita; aprovação ≠ pagamento; transferência ≠ receita/despesa. Mês da fatura = mês do vencimento.
8. **Segredos:** nunca escreva senha, token, service-role ou connection string em arquivo, chat ou commit.
9. **Dados com fonte e limite.** Não invente número; separe o confirmado da suposição e marque **[CONFIRMAR]**.

## Como trabalhar com o Diogo
- Execução contínua das etapas, sem pedir confirmação a cada passo. Pare só quando houver escolha material que dependa dele; se uma opção for claramente superior, siga com ela.
- Entregue arquivos prontos (SQL, JS, teste, passo de publicação), não explicações genéricas.
- Ele cola o texto exato do erro do Supabase de volta; ajuste de forma incremental até o teste passar.
- Valide antes de entregar (`node --check`, teste, consulta). Se algo não pôde ser rodado, diga.
- Respostas objetivas; detalhe só quando o assunto for complexo.

## Publicação do front
A cada release: troque o `?v=` no `index.html` e a `VERSAO` no `sw.js`; confirme a versão no Console (ex.: `[2Gather] financeiro FIN-ALL-21`).

## Estado em 21/11/2026
- **FIN-ALL-21 já está publicado** (`v39/index.html` carrega `app_v39_financeiro.js?v=FIN-ALL-21`). Falta validar no navegador: cartão sem fatura no mês; fatura anterior em aberto (linha vermelha); mais de 4 meses futuros ("+N mês(es)").
- **[CONFIRMAR]** se `FIN_S18_convenios_totais.sql` foi aplicado (Handoff 47) e se `COMPRA-1` está no ar.
- **[CONFIRMAR]** `v39/app.js` ainda tem referências a `chamarBruto`/`jsonp` (item P0 "cortar Apps Script").
- Próximo bloco do backlog: **LGPD e Auditoria (Build 63)** → Administração de Identidade → Comunicação outbound.

## LGPD — bloqueador de produção
Ações legadas ainda sem RPC: `aceitarPolitica`, `anonimizarPessoa`, `auditoria` (auditoria administrativa em *fail-closed*). Não há evidência de tela/RPC para direitos do titular, base legal, retenção ou DPO. Prontuário, receitas, foto do atendido e CPF são dados de alto risco.

## Convênios (Financeiro)
O convênio só se liga a uma **conta bancária** (`contaId` em `v39_fin_grants`); recebido, gasto e saldo são o que entrou e saiu dessa conta, só lançamentos efetivados. Não há vínculo direto despesa → convênio. Passo a passo completo no handover (seção 5.1).
