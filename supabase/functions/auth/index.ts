// 2Gather - Edge Function "auth": login por usuario, cadastro, senha e sessoes.
// Implantar com "Verify JWT" DESLIGADO. As acoes publicas nao trazem JWT e as protegidas sao conferidas aqui.
// Nunca registre em log o corpo da requisicao nem a resposta: ha senhas.
// B63 (LGPD-1): acao publica "politica"; cadastro grava o aceite na mesma transacao
//   (edge_create_access_request_with_consent, D1b); acao protegida "anonimizarConta" (D9/D10).
// CONFIG_1: acao publica "configPublica" (nome, cor e imagens da igreja para a tela de login).
import { createClient } from "npm:@supabase/supabase-js@2";

type Json = Record<string, unknown>;
type Dep = { createClient: typeof createClient; env: (n: string) => string };

const dep: Dep = {
  createClient,
  env: (n: string) => (typeof Deno !== "undefined" ? (Deno.env.get(n) ?? "") : ((globalThis as any).__env?.[n] ?? "")),
};
export function __setDeps(d: Partial<Dep>) { Object.assign(dep, d); }

const first = (...names: string[]) => { for (const n of names) { const v = dep.env(n); if (v) return v; } return ""; };

// ---------- mensagens (as do v38, quando existem) ----------
const M = {
  informe: "Informe usuário e senha.",
  bloqueio: "Muitas tentativas. Aguarde 10 minutos e tente de novo.",
  invalido: "Usuário ou senha incorretos.",
  pendente: "Seu cadastro ainda está aguardando aprovação.",
  recusado: "Seu cadastro não foi aprovado. Fale com a liderança.",
  bloqueado: "Usuário bloqueado. Fale com a liderança.",
  usuarioFormato: "Usuário deve ter de 3 a 30 caracteres: letras, números, ponto, hífen ou _.",
  nome: "Informe o nome completo.",
  senhaMin: "A senha precisa ter pelo menos 6 caracteres.",
  aceite: "Para se cadastrar é preciso ler e aceitar a Política de Privacidade.",
  email: "Informe um e-mail válido — ele é usado para recuperar a senha.",
  usuarioExiste: "Este usuário já existe. Escolha outro.",
  muitosPendentes: "Muitos cadastros pendentes. Tente mais tarde.",
  cadastroGenerico: "Não foi possível concluir o cadastro. Se você já se cadastrou, aguarde a aprovação ou procure a liderança.",
  semPermissao: "Sem permissão.",
  naoEncontrado: "Usuário não encontrado.",
  masterReset: "Somente o master redefine a senha de outro master.",
  masterSessoes: "Somente o master encerra sessões de outro master.",
  masterCorrigir: "Somente o master corrige o cadastro de outro master.",
  loginCorrecao: "Usuário de acesso: 3 a 30 caracteres, sem espaços ou acentos.",
  emailEmUso: "Este e-mail já está em uso por outra conta.",
  senhaAtual: "Senha atual incorreta.",
  senhaNova: "Nova senha inválida. Use pelo menos 6 caracteres.",
  esqueci: "Se houver cadastro com esse e-mail ou usuário, o pedido foi enviado à liderança, que vai informar sua senha temporária.",
  identificador: "Informe o e-mail ou o usuário.",
  erroGeral: "Não foi possível concluir agora. Tente novamente.",
  config: "Serviço indisponível no momento.",
  politicaAtualizada: "A Política de Privacidade foi atualizada. Abra a política, leia a versão atual e aceite de novo para concluir o cadastro.",
  politicaAusente: "O cadastro está temporariamente indisponível: a Política de Privacidade ainda não foi publicada. Tente mais tarde.",
  anonNaoAtivo: "A anonimização da conta ainda não está ativada no servidor.",
  pedidoNaoEncontrado: "Pedido de anonimização concluído não encontrado.",
};

const RE_USER = /^[a-z0-9._-]{3,30}$/;
const RE_MAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RE_VERSAO = /^\S[\s\S]{0,39}$/; // mesma faixa da coluna version (1 a 40 caracteres)
const BUCKET_FOTOS = "person-photos";
const BUCKET_MEDIA = "2gather-media"; // CONFIG_1: logo, ícone e favicon da igreja em <igreja>/branding/
const BAN_DURACAO = "876000h"; // ~100 anos: a conta Auth fica banida, nao e apagada (D10)

// ---------- utilitarios ----------
function allowedOrigin(origin: string | null): string {
  if (!origin) return "";
  const lista = (first("ALLOWED_ORIGINS") || "https://2gather-e1f.pages.dev").split(",").map((x) => x.trim()).filter(Boolean);
  if (lista.includes(origin)) return origin;
  if (/^https:\/\/[a-z0-9-]+\.2gather-e1f\.pages\.dev$/.test(origin)) return origin;
  if (/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return origin;
  return "";
}
function corsHeaders(origin: string | null): Record<string, string> {
  const o = allowedOrigin(origin);
  const h: Record<string, string> = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Vary": "Origin",
  };
  if (o) {
    h["Access-Control-Allow-Origin"] = o;
    h["Access-Control-Allow-Headers"] = "authorization, x-client-info, apikey, content-type";
    h["Access-Control-Allow-Methods"] = "POST, OPTIONS";
  }
  return h;
}
const out = (status: number, body: Json, origin: string | null) => new Response(JSON.stringify(body), { status, headers: corsHeaders(origin) });
const fail = (status: number, erro: string, origin: string | null, extra: Json = {}) => out(status, { ok: false, erro, ...extra }, origin);

async function sha256hex(txt: string): Promise<string> {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(txt));
  return Array.from(new Uint8Array(b)).map((x) => x.toString(16).padStart(2, "0")).join("");
}
async function fingerprint(req: Request): Promise<string> {
  const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim();
  return (await sha256hex(ip + "|" + (req.headers.get("user-agent") || ""))).slice(0, 32);
}
const norm = (s: unknown) => String(s ?? "").toLowerCase().trim();

function tempPassword(): string {
  const abc = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789"; // sem 0 O 1 l I
  for (;;) {
    const bytes = crypto.getRandomValues(new Uint8Array(40));
    let p = "";
    for (const b of bytes) { if (b < 224 && p.length < 10) p += abc[b % abc.length]; }
    if (p.length === 10 && /[a-z]/.test(p) && /[A-Z]/.test(p) && /[0-9]/.test(p)) return p;
  }
}

// ---------- clientes ----------
function makeClients() {
  const url = first("SUPABASE_URL");
  const secret = first("APP_SECRET_KEY", "SB_SECRET_KEY", "SUPABASE_SECRET_KEY", "SUPABASE_SERVICE_ROLE_KEY");
  const pub = first("APP_PUBLISHABLE_KEY", "SB_PUBLISHABLE_KEY", "SUPABASE_PUBLISHABLE_KEY", "SUPABASE_ANON_KEY");
  if (!url || !secret || !pub) throw new Error("CONFIG_INCOMPLETA");
  const opt = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
  const admin = dep.createClient(url, secret, { ...opt, db: { schema: "app" } });
  const anon = () => dep.createClient(url, pub, opt);
  // cliente com o JWT de quem chamou: as RPCs app.v39_* conferem permissao e igreja como esse usuario
  const asUser = (jwt: string) => dep.createClient(url, pub, { ...opt, db: { schema: "app" }, global: { headers: { Authorization: `Bearer ${jwt}` } } });
  return { admin, anon, asUser };
}
type Clients = ReturnType<typeof makeClients>;

// codigo de dominio vindo do banco: raise_domain_error usa errcode P0001 e message = codigo
async function rpc(admin: any, fn: string, args: Json): Promise<{ data: any; code: string | null }> {
  const { data, error } = await admin.rpc(fn, args);
  if (!error) return { data, code: null };
  const code = error.code === "P0001" ? String(error.message || "DB_ERROR") : (error.code === "PGRST202" || error.code === "42883" ? "RPC_MISSING" : "DB_ERROR");
  return { data: null, code };
}

async function callerOf(admin: any, req: Request) {
  const m = /^Bearer\s+(.+)$/i.exec(req.headers.get("authorization") || "");
  if (!m) return null;
  const { data, error } = await admin.auth.getUser(m[1]);
  if (error || !data?.user) return null;
  return { ...(data.user as { id: string; email?: string }), jwt: m[1] };
}

// ---------- acoes ----------
async function aLogin(c: Clients, b: Json, req: Request, origin: string | null) {
  const usuario = norm(b.usuario), senha = String(b.senha ?? "");
  if (!usuario || !senha) return fail(400, M.informe, origin);

  const pre = await rpc(c.admin, "edge_login_precheck", { p_username: usuario });
  if (pre.code) return fail(500, M.erroGeral, origin);
  const st = pre.data?.state as string;
  const fp = await fingerprint(req);

  if (st === "locked") return fail(429, M.bloqueio, origin);
  if (st === "unknown" || !pre.data?.login_email) return fail(401, M.invalido, origin);

  const { data, error } = await c.anon().auth.signInWithPassword({ email: pre.data.login_email, password: senha });
  if (error || !data?.session) {
    if (pre.data.user_account_id) {
      await rpc(c.admin, "edge_login_register_failure", { p_user_account_id: pre.data.user_account_id, p_request_fingerprint: fp });
    }
    return fail(401, M.invalido, origin);
  }

  // senha correta: so agora revela a situacao do cadastro (como no v38)
  if (st !== "active") {
    await c.admin.auth.admin.signOut(data.session.access_token).catch(() => {});
    if (st === "pending") return fail(403, M.pendente, origin);
    if (st === "refused") return fail(403, M.recusado, origin);
    return fail(403, M.bloqueado, origin);
  }

  await rpc(c.admin, "edge_login_register_success", { p_user_account_id: pre.data.user_account_id, p_request_fingerprint: fp });
  const s = data.session;
  return out(200, {
    ok: true,
    must_change_password: !!pre.data.must_change_password,
    session: { access_token: s.access_token, refresh_token: s.refresh_token, expires_in: s.expires_in, expires_at: s.expires_at, token_type: s.token_type },
  }, origin);
}

async function aRegister(c: Clients, b: Json, req: Request, origin: string | null) {
  const usuario = norm(b.usuario), nome = String(b.nome ?? "").trim().slice(0, 80);
  const senha = String(b.senha ?? ""), email = norm(b.email);
  if (!RE_USER.test(usuario)) return fail(400, M.usuarioFormato, origin);
  if (!nome) return fail(400, M.nome, origin);
  if (senha.length < 6) return fail(400, M.senhaMin, origin);
  if (b.aceite !== true) return fail(400, M.aceite, origin);
  if (!RE_MAIL.test(email)) return fail(400, M.email, origin);
  const church = first("DEFAULT_CHURCH_ID");
  if (!RE_UUID.test(church)) return fail(503, M.config, origin);
  const gc = b.gcId && RE_UUID.test(String(b.gcId)) ? String(b.gcId) : null;

  // B63/D1b: o aceite precisa citar a versao exibida. Sem versao (front antigo em cache), nada e criado.
  const politicaV = String(b.politicaV ?? "").trim();
  if (!RE_VERSAO.test(politicaV)) {
    const pol = await rpc(c.admin, "edge_privacy_policy_public", { p_church_id: church });
    if (pol.code === "RPC_MISSING") return fail(503, M.config, origin);
    if (pol.code) return fail(500, M.erroGeral, origin);
    if (!pol.data?.versao) return fail(503, M.politicaAusente, origin, { codigo: "PRIVACY_POLICY_MISSING" });
    return fail(409, M.politicaAtualizada, origin, { codigo: "PRIVACY_VERSION_NOT_CURRENT" });
  }

  const av = await rpc(c.admin, "edge_username_available", { p_username: usuario });
  if (av.code) return fail(500, M.erroGeral, origin);
  if (av.data !== true) return fail(409, M.usuarioExiste, origin);

  const created = await c.admin.auth.admin.createUser({ email, password: senha, email_confirm: true });
  if (created.error || !created.data?.user) return fail(409, M.cadastroGenerico, origin);
  const uid = created.data.user.id;

  // pedido de acesso + aceite da politica numa transacao so (se o aceite falhar, o pedido e desfeito no banco)
  const r = await rpc(c.admin, "edge_create_access_request_with_consent", {
    p_auth_user_id: uid, p_username: usuario, p_email: email, p_church_id: church, p_full_name: nome,
    p_term_version: politicaV,
    p_whatsapp: String(b.fone ?? "").slice(0, 20) || null, p_preferred_name: null,
    p_requested_profile_code: String(b.perfil ?? "") || null, p_requested_gc_id: gc, p_notes: String(b.obs ?? "").slice(0, 300) || null,
    p_fingerprint: await fingerprint(req),
  });
  if (r.code) {
    await c.admin.auth.admin.deleteUser(uid).catch(() => {}); // nao deixa conta Auth orfa
    if (r.code === "USERNAME_UNAVAILABLE") return fail(409, M.usuarioExiste, origin);
    if (r.code === "TOO_MANY_PENDING_REQUESTS") return fail(429, M.muitosPendentes, origin);
    if (r.code === "USERNAME_INVALID") return fail(400, M.usuarioFormato, origin);
    if (r.code === "PERSON_NAME_REQUIRED") return fail(400, M.nome, origin);
    if (r.code === "GC_SCOPE_INVALID") return fail(400, "GC inválido.", origin);
    if (r.code === "PRIVACY_VERSION_NOT_CURRENT") return fail(409, M.politicaAtualizada, origin, { codigo: r.code });
    if (r.code === "PRIVACY_POLICY_MISSING") return fail(503, M.politicaAusente, origin, { codigo: r.code });
    if (r.code === "RPC_MISSING") return fail(503, M.config, origin); // banco sem B63_1: nao cria conta sem aceite
    return fail(500, M.cadastroGenerico, origin);
  }
  return out(200, { ok: true }, origin);
}

async function aForgot(c: Clients, b: Json, req: Request, origin: string | null) {
  const chave = norm(b.chave);
  if (chave.length < 3) return fail(400, M.identificador, origin);
  const r = await rpc(c.admin, "edge_request_password_reset", { p_identifier: chave, p_fingerprint: await fingerprint(req) });
  if (r.code && r.code !== "IDENTIFIER_REQUIRED") return fail(500, M.erroGeral, origin);
  return out(200, { ok: true, msg: M.esqueci }, origin); // resposta sempre igual
}

async function aGcs(c: Clients, origin: string | null) {
  const church = first("DEFAULT_CHURCH_ID");
  if (!RE_UUID.test(church)) return out(200, { ok: true, gcs: [] }, origin);
  // funcao da v3: devolve id, church_id e name. Aqui so saem id e nome, sempre da igreja configurada.
  const r = await rpc(c.admin, "edge_list_public_growth_groups", { p_church_id: church });
  if (r.code === "RPC_MISSING") return out(200, { ok: true, gcs: [], em_preparacao: true }, origin);
  if (r.code) return fail(500, M.erroGeral, origin);
  const lista = (Array.isArray(r.data) ? r.data : []).map((g: any) => ({ id: g.id, nome: g.name }));
  return out(200, { ok: true, gcs: lista }, origin);
}

// B63: texto vigente da politica para quem ainda nao entrou (tela de login e cadastro). Sempre da igreja configurada.
async function aPolicy(c: Clients, origin: string | null) {
  const church = first("DEFAULT_CHURCH_ID");
  if (!RE_UUID.test(church)) return out(200, { ok: true, texto: "", versao: null, em_preparacao: true }, origin);
  const r = await rpc(c.admin, "edge_privacy_policy_public", { p_church_id: church });
  if (r.code === "RPC_MISSING") return out(200, { ok: true, texto: "", versao: null, em_preparacao: true }, origin);
  if (r.code) return fail(500, M.erroGeral, origin);
  return out(200, { ok: true, texto: String(r.data?.texto ?? ""), versao: r.data?.versao ?? null }, origin);
}

// CONFIG_1: nome, cor e imagens da igreja para a tela de login (antes de entrar). Sempre da igreja configurada.
//   Imagens saem como links assinados de 1 hora (o bucket é privado). Sem configuração salva pelo Supabase,
//   devolve config null e o front segue com a fonte antiga.
async function aConfigPublic(c: Clients, origin: string | null) {
  const church = first("DEFAULT_CHURCH_ID");
  if (!RE_UUID.test(church)) return out(200, { ok: true, config: null, em_preparacao: true }, origin);
  const r = await rpc(c.admin, "edge_config_public", { p_church_id: church });
  if (r.code === "RPC_MISSING") return out(200, { ok: true, config: null, em_preparacao: true }, origin);
  if (r.code) return fail(500, M.erroGeral, origin);
  const d = r.data ?? {};
  if (!d.salvoEm) return out(200, { ok: true, config: null, semConfig: true }, origin);
  const pref = church + "/branding/";
  const assinar = async (p: unknown) => {
    const s = String(p ?? "");
    if (!s || !s.startsWith(pref) || s.includes("..")) return "";
    const u = await c.admin.storage.from(BUCKET_MEDIA).createSignedUrl(s, 3600);
    return u.error ? "" : String(u.data?.signedUrl ?? "");
  };
  return out(200, {
    ok: true,
    config: { nome: String(d.nome ?? ""), cor: String(d.cor ?? ""), logoV: String(d.logoPath ?? ""), iconeV: String(d.iconePath ?? ""), faviconV: String(d.faviconPath ?? "") },
    logo: await assinar(d.logoPath), icone: await assinar(d.iconePath), favicon: await assinar(d.faviconPath),
  }, origin);
}

// B63 (D9/D10): chamada pelo front logo depois de app.v39_privacy_anonymize_execute.
// O navegador manda so a igreja e o pedido. A autorizacao e a pessoa vem do banco, consultado COM O JWT
// de quem chamou (v39_privacy_requests_list exige privacy.requests.manage e acesso ativo a igreja).
// Para cada conta Auth da pessoa: bane (nao apaga), revoga sessoes e, se anonimizada, troca o e-mail.
// Se anonimizada: apaga do bucket privado as fotos da pessoa (app.files ja ficou "archived" no banco).
// Restringida (prontuario/receita, D7): so bane e revoga; dados e foto ficam sob guarda legal.
// Repetir a chamada e seguro (idempotente).
async function aAnonymizeAccount(c: Clients, b: Json, user: { id: string; jwt: string }, origin: string | null) {
  const church = String(b.igrejaId ?? ""), pedido = String(b.pedidoId ?? "");
  if (!RE_UUID.test(church) || !RE_UUID.test(pedido)) return fail(400, M.pedidoNaoEncontrado, origin);

  const lst = await rpc(c.asUser(user.jwt), "v39_privacy_requests_list", { p_church_id: church, p_status: "completed" });
  if (lst.code === "RPC_MISSING") return fail(503, M.anonNaoAtivo, origin, { codigo: "RPC_MISSING" });
  if (lst.code === "PERMISSION_DENIED" || lst.code === "ACCESS_DENIED") return fail(403, M.semPermissao, origin);
  if (lst.code) return fail(500, M.erroGeral, origin);
  const d = (Array.isArray(lst.data) ? lst.data : []).find((x: any) => x && x.id === pedido && x.tipo === "anonymization");
  if (!d || !RE_UUID.test(String(d.pessoaId ?? ""))) return fail(404, M.pedidoNaoEncontrado, origin);
  const anonimizado = d.resultado === "anonymized";
  if (!anonimizado && d.resultado !== "restricted_health_retention") return fail(404, M.pedidoNaoEncontrado, origin);
  const pessoa = String(d.pessoaId);

  const contas = await c.admin.from("user_accounts").select("auth_user_id").eq("person_id", pessoa);
  if (contas.error) return fail(500, M.erroGeral, origin);
  const ids = [...new Set<string>((contas.data || []).map((x: any) => String(x.auth_user_id ?? "")))]
    .filter((x) => RE_UUID.test(x) && x !== user.id);

  let contasOk = 0, contasFalha = 0;
  for (const uid of ids) {
    const patch: Record<string, unknown> = { ban_duration: BAN_DURACAO };
    if (anonimizado) { patch.email = `anon-${uid}@anonimizado.invalid`; patch.email_confirm = true; }
    const up = await c.admin.auth.admin.updateUserById(uid, patch);
    const rv = await rpc(c.admin, "edge_revoke_sessions", { p_auth_user_id: uid });
    if (up.error || rv.code) contasFalha++; else contasOk++;
  }

  let fotos = 0, fotosFalha = 0;
  if (anonimizado) {
    // caminhos usados pelo front v39: <igreja>/people/<pessoa>/<arquivo> e <igreja>/<pessoa>/<arquivo>
    for (const pasta of [`${church}/people/${pessoa}`, `${church}/${pessoa}`]) {
      const ls = await c.admin.storage.from(BUCKET_FOTOS).list(pasta, { limit: 1000 });
      if (ls.error) { fotosFalha++; continue; }
      const nomes = (ls.data || []).filter((o: any) => o && o.name && o.id).map((o: any) => `${pasta}/${o.name}`);
      if (!nomes.length) continue;
      const rm = await c.admin.storage.from(BUCKET_FOTOS).remove(nomes);
      if (rm.error) fotosFalha += nomes.length; else fotos += nomes.length;
    }
  }
  const ok = contasFalha === 0 && fotosFalha === 0;
  const resumo: Json = { ok, resultado: anonimizado ? "anonimizado" : "restringido", contas: contasOk, contasFalha, fotos, fotosFalha };
  if (!ok) resumo.erro = "Parte da desativação da conta não foi concluída. Tente de novo pelo mesmo botão.";
  return out(ok ? 200 : 207, resumo, origin);
}

async function authorize(c: Clients, actorId: string, target: string, perm: string) {
  const r = await rpc(c.admin, "edge_authorize_admin_action", { p_actor_auth_user_id: actorId, p_target_user_account_id: target, p_permission_code: perm });
  return r;
}
function authErr(code: string, masterMsg: string, origin: string | null) {
  if (code === "MASTER_ONLY") return fail(403, masterMsg, origin);
  if (code === "USER_ACCOUNT_NOT_FOUND") return fail(404, M.naoEncontrado, origin);
  if (code === "PERMISSION_DENIED") return fail(403, M.semPermissao, origin);
  return fail(500, M.erroGeral, origin);
}

async function aAdminReset(c: Clients, b: Json, user: { id: string }, origin: string | null) {
  const target = String(b.user_account_id ?? "");
  if (!RE_UUID.test(target)) return fail(400, M.naoEncontrado, origin);
  const a = await authorize(c, user.id, target, "auth.user.reset_password");
  if (a.code) return authErr(a.code, M.masterReset, origin);
  const { actor_user_account_id, target_auth_user_id } = a.data;

  // 1) marca a troca obrigatoria (se o passo seguinte falhar, o usuario so e obrigado a trocar)
  const mk = await rpc(c.admin, "edge_mark_password_reset", { p_user_account_id: target, p_actor_user_account_id: actor_user_account_id });
  if (mk.code) return fail(500, M.erroGeral, origin);
  // 2) define a senha temporaria na conta Auth
  const temp = tempPassword();
  const up = await c.admin.auth.admin.updateUserById(target_auth_user_id, { password: temp });
  if (up.error) return fail(500, M.erroGeral, origin);
  // 3) derruba as sessoes abertas e fecha os pedidos de "esqueci"
  if (target_auth_user_id !== user.id) await rpc(c.admin, "edge_revoke_sessions", { p_auth_user_id: target_auth_user_id });
  await rpc(c.admin, "edge_close_password_reset_requests", { p_user_account_id: target, p_actor_user_account_id: actor_user_account_id });
  return out(200, { ok: true, senha_temporaria: temp }, origin);
}

async function aAdminRevoke(c: Clients, b: Json, user: { id: string }, origin: string | null) {
  const target = String(b.user_account_id ?? "");
  if (!RE_UUID.test(target)) return fail(400, M.naoEncontrado, origin);
  const a = await authorize(c, user.id, target, "auth.user.reset_password");
  if (a.code) return authErr(a.code, M.masterSessoes, origin);
  const r = await rpc(c.admin, "edge_revoke_sessions", { p_auth_user_id: a.data.target_auth_user_id });
  if (r.code) return fail(500, M.erroGeral, origin);
  return out(200, { ok: true }, origin);
}

async function aAdminCorrect(c: Clients, b: Json, user: { id: string }, origin: string | null) {
  const target = String(b.user_account_id ?? "");
  if (!RE_UUID.test(target)) return fail(400, M.naoEncontrado, origin);
  const novoUser = norm(b.usuario), novoMail = norm(b.email);
  if (!RE_USER.test(novoUser)) return fail(400, M.loginCorrecao, origin);
  if (!RE_MAIL.test(novoMail)) return fail(400, M.email, origin);
  const a = await authorize(c, user.id, target, "auth.user.correct_login");
  if (a.code) return authErr(a.code, M.masterCorrigir, origin);
  const { actor_user_account_id, target_auth_user_id } = a.data;

  const idn = await rpc(c.admin, "edge_get_login_identity", { p_user_account_id: target });
  if (idn.code || !idn.data) return fail(500, M.erroGeral, origin);
  const oldUser = String(idn.data.username ?? ""), oldMail = norm(idn.data.email);
  const trocouLogin = novoUser !== oldUser, trocouEmail = novoMail !== oldMail;
  if (!trocouLogin && !trocouEmail) return out(200, { ok: true, trocouLogin: false }, origin);

  if (trocouEmail) {
    const u = await c.admin.auth.admin.updateUserById(target_auth_user_id, { email: novoMail, email_confirm: true });
    if (u.error) return fail(409, M.emailEmUso, origin);
  }
  const r = await rpc(c.admin, "edge_correct_login_identity", { p_user_account_id: target, p_username: novoUser, p_email_changed: trocouEmail, p_actor_user_account_id: actor_user_account_id });
  if (r.code) {
    if (trocouEmail) await c.admin.auth.admin.updateUserById(target_auth_user_id, { email: oldMail, email_confirm: true }).catch(() => {});
    if (r.code === "USERNAME_UNAVAILABLE") return fail(409, "Já existe outro usuário com esse acesso.", origin);
    if (r.code === "USERNAME_INVALID") return fail(400, M.loginCorrecao, origin);
    return fail(500, M.erroGeral, origin);
  }
  if (trocouLogin && target_auth_user_id !== user.id) await rpc(c.admin, "edge_revoke_sessions", { p_auth_user_id: target_auth_user_id });
  return out(200, { ok: true, trocouLogin }, origin);
}

async function aChangePassword(c: Clients, b: Json, user: { id: string; email?: string }, origin: string | null) {
  const atual = String(b.atual ?? ""), nova = String(b.nova ?? "");
  if (nova.length < 6) return fail(400, M.senhaNova, origin);
  const acc = await rpc(c.admin, "edge_account_by_auth_user", { p_auth_user_id: user.id });
  if (acc.code || !acc.data) return fail(404, M.naoEncontrado, origin);
  if (acc.data.status !== "active") return fail(403, M.bloqueado, origin);
  // v38: quem entrou com a senha temporaria nao precisa informar a atual
  if (!acc.data.must_change_password) {
    if (!user.email) return fail(500, M.erroGeral, origin);
    const t = await c.anon().auth.signInWithPassword({ email: user.email, password: atual });
    if (t.error || !t.data?.session) return fail(403, M.senhaAtual, origin);
    await c.admin.auth.admin.signOut(t.data.session.access_token).catch(() => {}); // descarta a sessao de teste
  }
  const up = await c.admin.auth.admin.updateUserById(user.id, { password: nova });
  if (up.error) return fail(500, M.erroGeral, origin);
  const done = await rpc(c.admin, "edge_complete_password_change", { p_user_account_id: acc.data.user_account_id });
  if (done.code) return fail(500, M.erroGeral, origin);
  return out(200, { ok: true }, origin);
}

// ---------- entrada ----------
export async function handle(req: Request): Promise<Response> {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(origin) });
  if (req.method !== "POST") return fail(405, "Método não permitido.", origin);
  if (Number(req.headers.get("content-length") || 0) > 20000) return fail(413, "Requisição muito grande.", origin);

  let b: Json;
  try { b = await req.json(); } catch { return fail(400, "Requisição inválida.", origin); }

  let c: Clients;
  try { c = makeClients(); } catch { return fail(503, M.config, origin); }

  try {
    const acao = String(b.acao ?? "");
    switch (acao) {
      case "login": return await aLogin(c, b, req, origin);
      case "cadastro": return await aRegister(c, b, req, origin);
      case "recuperar": return await aForgot(c, b, req, origin);
      case "gcsPublico": return await aGcs(c, origin);
      case "politica": return await aPolicy(c, origin);
      case "configPublica": return await aConfigPublic(c, origin);
    }
    if (["trocarSenha", "redefinirSenha", "encerrarSessoes", "corrigirUsuario", "anonimizarConta"].includes(acao)) {
      const user = await callerOf(c.admin, req);
      if (!user) return fail(401, "Sessão expirada. Entre novamente.", origin, { sessao: false });
      if (acao === "trocarSenha") return await aChangePassword(c, b, user, origin);
      if (acao === "redefinirSenha") return await aAdminReset(c, b, user, origin);
      if (acao === "encerrarSessoes") return await aAdminRevoke(c, b, user, origin);
      if (acao === "anonimizarConta") return await aAnonymizeAccount(c, b, user, origin);
      return await aAdminCorrect(c, b, user, origin);
    }
    return fail(400, "Ação desconhecida.", origin);
  } catch {
    return fail(500, M.erroGeral, origin); // sem detalhes: nada de segredo na resposta
  }
}

if (typeof Deno !== "undefined" && (Deno as any).serve) (Deno as any).serve(handle);
