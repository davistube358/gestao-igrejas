import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2";

export const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") ?? "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
};

export const genericAuthError = "Usuário ou senha inválidos.";
export const genericSignupMessage = "Se os dados puderem ser processados, a solicitação seguirá para análise.";

export function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

export function preflight(req: Request): Response | null {
  return req.method === "OPTIONS" ? new Response("ok", { headers: corsHeaders }) : null;
}

export function requirePost(req: Request): Response | null {
  return req.method === "POST" ? null : json(405, { error: "METHOD_NOT_ALLOWED" });
}

export function env(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

export function adminClient(): SupabaseClient {
  return createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function anonClient(): SupabaseClient {
  return createClient(env("SUPABASE_URL"), env("SUPABASE_ANON_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function userClient(req: Request): SupabaseClient {
  return createClient(env("SUPABASE_URL"), env("SUPABASE_ANON_KEY"), {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function bodyJson<T>(req: Request): Promise<T> {
  const type = req.headers.get("content-type") ?? "";
  if (!type.toLowerCase().includes("application/json")) throw new Error("INVALID_CONTENT_TYPE");
  return await req.json() as T;
}

export function normalizeEmail(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

export function normalizeUsername(value: unknown): string {
  return String(value ?? "")
    .trim()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

export function validUsername(value: string): boolean {
  return /^[a-z0-9._-]{3,30}$/.test(value);
}

export function validUuid(value: unknown): value is string {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value ?? ""));
}

export function validPassword(value: unknown): value is string {
  return typeof value === "string" && value.length >= 8 && value.length <= 128;
}

export function requestFingerprint(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const agent = req.headers.get("user-agent") ?? "unknown";
  return `${forwarded}|${agent}`.slice(0, 500);
}

export async function authenticatedUser(req: Request) {
  const client = userClient(req);
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) throw new Error("UNAUTHORIZED");
  return { client, user: data.user };
}

export async function actorAccount(req: Request) {
  const { user } = await authenticatedUser(req);
  const admin = adminClient();
  const { data, error } = await admin
    .schema("app")
    .from("user_accounts")
    .select("id,status")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (error || !data || data.status !== "active") throw new Error("UNAUTHORIZED");
  return { admin, user, accountId: data.id as string };
}

export async function permissionAllowed(
  accountId: string,
  permission: string,
  churchId?: string | null,
): Promise<boolean> {
  const db = adminClient();
  let query = db
    .schema("app")
    .from("my_effective_permissions")
    .select("permission_code,church_id,is_allowed")
    .eq("user_account_id", accountId)
    .eq("permission_code", permission)
    .eq("is_allowed", true);
  if (churchId) query = query.eq("church_id", churchId);
  const { data, error } = await query.limit(1);
  return !error && !!data?.length;
}

export function safeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
