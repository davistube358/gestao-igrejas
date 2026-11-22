# AGENTS.md — 2Gather

> **Atualização v39 (21/11/2026, migração Copilot → Claude Code).** Este bloco **prevalece** sobre as seções 3 e 12 abaixo, que foram escritas quando a v38 (Google Sheets + Apps Script) era o sistema principal. O restante do arquivo continua valendo integralmente.
>
> **Arquitetura vigente**
> - **v38 (raiz do repositório):** PWA + Google Apps Script + Google Sheets. Em produção como **referência funcional**. Só manutenção; nenhuma funcionalidade nova.
> - **v39 (pasta `/v39`):** PWA + Supabase/PostgreSQL + Supabase Auth. Em construção e homologação (Build 69D). Módulos `app_v39_*.js` carregam **depois** do `app.js`.
> - **Escrita só por RPC** no schema `app`. `church_id` nunca vem do navegador como prova de autorização. Toda função que um usuário comum possa chamar confere conta ativa e acesso ativo à igreja (`app.has_permission(...)`, `private.v39_fin_need(...)`). Permissões vêm do backend; não fazer hardcode por nome de perfil.
> - **Banco real é a autoridade.** Antes de assumir tabela, coluna ou função, consultar o banco (somente leitura). O editor do Supabase corta resultados em 100 linhas: filtrar.
> - **Todo SQL novo tem teste com rollback** (`do $t$ ... raise exception 'TESTE X CONCLUIDO (nada foi gravado): ...'`) antes do script de aplicar. Arquivos em `sql/`, um par `*_teste_rollback.sql` / `*_aplicar.sql` por etapa. Nenhuma migration é aplicada sem aprovação explícita do Diogo.
> - **Segredos:** nunca escrever senha, token, chave service-role/secret ou connection string em arquivo, chat ou commit. A chave *publishable* do Supabase é pública por desenho (`v39/config.js`). **O repositório é público.**
> - **Publicação:** a cada release, trocar o `?v=` no `index.html` e a `VERSAO` no `sw.js`; confirmar a versão no Console (ex.: `[2Gather] financeiro FIN-ALL-21`).
> - **Fluxo de agentes:** `2gather-orquestrador` → `2gather-data` (diagnóstico) → aprovação do Diogo → `2gather-dev` → `2gather-qa`. Definições em `.claude/agents/`.

2Gather - Regras Centrais do Projeto
1. Fonte de verdade
A versão atual do 2Gather é a fonte de verdade funcional.
Antes de modificar qualquer módulo existente:
1.	Ler e analisar os arquivos atuais relacionados ao módulo.
2.	Inventariar todos os campos existentes.
3.	Inventariar todas as funcionalidades, botões e ações existentes.
4.	Identificar todas as regras de negócio e validações.
5.	Identificar perfis, permissões e escopos de acesso.
6.	Identificar integrações e dependências com outros módulos.
7.	Identificar dados, históricos e registros afetados.
8.	Identificar comportamentos condicionais e automações.
9.	Apresentar riscos de regressão antes de implementar alterações.
2. Regra crítica de não regressão
É proibido remover, substituir, ocultar ou simplificar qualquer item existente sem autorização explícita do responsável pelo projeto.
Isso inclui:
•	campos;
•	informações;
•	funcionalidades;
•	botões;
•	ações;
•	filtros;
•	indicadores;
•	regras de negócio;
•	validações;
•	permissões;
•	integrações;
•	históricos;
•	configurações;
•	automações;
•	relatórios;
•	notificações.
Modernização visual significa melhorar UX/UI sem reduzir funcionalidade.
Ao modernizar uma tela, comparar obrigatoriamente:
TELA ATUAL versus NOVA TELA
Classificar cada elemento como:
•	PRESERVADO
•	MELHORADO
•	NOVO
•	AUSENTE / REGRESSÃO
Nenhuma tela pode ser considerada concluída enquanto houver regressão não autorizada.
3. Arquitetura atual
O 2Gather utiliza atualmente:
•	PWA;
•	JavaScript;
•	Google Apps Script;
•	Google Sheets;
•	Service Worker.
Existe migração futura planejada para Supabase/PostgreSQL.
A implementação atual não deve ser quebrada somente para facilitar a arquitetura futura.
Sempre distinguir claramente:
IMPLEMENTAÇÃO ATUAL
e
PREPARAÇÃO FUTURA
4. Base única de pessoas
O 2Gather deve utilizar uma base única de pessoas sempre que possível.
Não criar cópias independentes da mesma pessoa para representar condições diferentes.
Exemplos:
•	visitante;
•	membro;
•	discípulo;
•	líder;
•	aluno;
•	voluntário;
•	beneficiário;
•	participante do Instituto;
•	participante de campanha;
•	doador.
Essas condições devem preferencialmente ser representadas por relacionamentos, vínculos, papéis ou status associados à mesma pessoa.
Mudanças de status devem preservar o histórico da pessoa.
5. Segurança e permissões
Nunca confiar exclusivamente no frontend para proteger dados ou ações sensíveis.
Sempre verificar:
•	perfil;
•	permissão;
•	escopo;
•	igreja;
•	GC;
•	função específica;
•	autorização individual quando aplicável.
Aplicar o princípio do menor acesso necessário.
Dar atenção especial a:
•	dados pessoais;
•	dados financeiros;
•	dízimos e ofertas;
•	comprovantes;
•	Instituto;
•	Mercado Solidário;
•	Farmácia Solidária;
•	receitas e documentos;
•	informações sensíveis.
Nenhuma modernização visual pode ampliar permissões existentes silenciosamente.
6. Dados e banco
O agente DEV não deve alterar estruturas de dados ou banco silenciosamente.
Quando uma implementação precisar de:
•	nova tabela;
•	nova aba;
•	nova coluna;
•	novo relacionamento;
•	nova chave;
•	mudança estrutural;
•	migração;
•	índice;
•	policy;
•	alteração de integridade;
deve registrar explicitamente:
DEPENDÊNCIA DATA
O agente DATA deve analisar a alteração antes da implementação estrutural.
7. Identificadores
Não utilizar como identificador permanente:
•	nome;
•	telefone;
•	e-mail;
•	número da linha da planilha;
•	posição do registro.
Preferir identificadores únicos e imutáveis.
8. Exclusão e histórico
Para registros relevantes, evitar exclusão física quando houver necessidade de auditoria.
Avaliar preferência por:
•	status;
•	inativação;
•	cancelamento;
•	estorno;
•	soft delete;
•	histórico.
Operações financeiras e registros sensíveis devem preservar rastreabilidade.
9. Regras de negócio
Nenhum agente pode alterar uma regra de negócio por conveniência técnica.
Quando houver conflito entre:
REGRA DE NEGÓCIO
e
FACILIDADE DE IMPLEMENTAÇÃO
a regra de negócio deve ser preservada.
O conflito deve ser documentado e uma alternativa técnica deve ser proposta.
10. Modernização visual
O novo padrão visual do 2Gather deve priorizar:
•	tema claro;
•	layout moderno;
•	experiência mobile-first;
•	responsividade;
•	hierarquia visual;
•	baixa necessidade de treinamento;
•	ações principais evidentes;
•	informações organizadas;
•	cards quando adequados;
•	formulários claros;
•	status de fácil identificação.
As cores do 2Gather são configuráveis.
Nenhuma combinação específica de cores deve ficar rigidamente incorporada aos componentes caso o tema possa fornecer essas cores.
Design novo não autoriza remoção de informações da versão atual.
11. Multi-igreja
Toda nova arquitetura deve considerar a futura utilização do 2Gather por múltiplas igrejas.
Dados de uma igreja não devem ficar acessíveis a outra sem autorização explícita.
Novas estruturas devem avaliar desde o início o vínculo com a igreja/tenant quando aplicável.
12. Migração futura
Existe intenção de futura migração para Supabase/PostgreSQL.
Novas decisões devem evitar dependência desnecessária da posição física dos dados no Google Sheets.
Porém:
não reescrever funcionalidades existentes apenas para preparar a migração.
A evolução deve ser gradual e controlada.
13. Responsabilidades dos agentes
2Gather DATA
Responsável por:
•	modelagem;
•	estrutura de dados;
•	relacionamentos;
•	integridade;
•	migrações;
•	segurança de dados;
•	preparação para Supabase;
•	multi-tenant;
•	auditoria;
•	LGPD.
2Gather DEV
Responsável por:
•	frontend;
•	PWA;
•	JavaScript;
•	Google Apps Script;
•	integrações;
•	UX;
•	regras de negócio;
•	implementação;
•	manutenção;
•	performance.
DEV não deve alterar o modelo de dados silenciosamente.
2Gather QA
Responsável por:
•	testes funcionais;
•	testes negativos;
•	regressão;
•	permissões;
•	integridade dos dados;
•	fluxo mobile;
•	PWA;
•	Service Worker;
•	atualização de versões;
•	segurança funcional.
QA não deve corrigir o próprio problema encontrado.
Fluxo:
QA encontra problema -> DEV ou DATA corrige -> QA testa novamente.
14. Entrega obrigatória
Toda alteração relevante deve informar:
IMPLEMENTAÇÃO
O que foi implementado.
ARQUIVOS ALTERADOS
Quais arquivos foram modificados.
FUNÇÕES ALTERADAS
Quais funções ou componentes foram afetados.
REGRAS CONSIDERADAS
Quais regras de negócio foram preservadas ou implementadas.
DADOS
Impactos sobre estruturas ou registros.
PERMISSÕES
Perfis e acessos afetados.
DEPENDÊNCIA DATA
Informar se existe alteração estrutural necessária.
RISCOS DE REGRESSÃO
Listar possíveis impactos sobre funcionalidades existentes.
ENTREGA PARA QA
Listar os testes necessários.
15. Critério de conclusão
Uma funcionalidade não deve ser considerada concluída somente porque funciona no fluxo principal.
Antes da conclusão devem ser avaliados:
•	funcionalidade;
•	dados;
•	permissões;
•	regressão;
•	segurança;
•	mobile;
•	compatibilidade com PWA;
•	impacto em outros módulos.
Nenhuma alteração pode ser considerada aprovada quando remover uma funcionalidade existente sem autorização explícita.
