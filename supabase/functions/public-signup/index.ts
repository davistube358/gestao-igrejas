import {
  adminClient, bodyJson, genericSignupMessage, json, normalizeEmail, normalizeUsername,
  preflight, requirePost, validPassword, validUsername, validUuid,
} from "../_shared/common.ts";

type Payload = {
  username?: string; password?: string; email?: string; church_id?: string;
  full_name?: string; preferred_name?: string | null; requested_profile_id?: string | null;
  requested_gc_id?: string | null; notes?: string | null;
};

Deno.serve(async (req) => {
  const options = preflight(req); if (options) return options;
  const method = requirePost(req); if (method) return method;

  const generic = () => json(202, { accepted: true, message: genericSignupMessage });
  let createdUserId: string | null = null;

  try {
    const body = await bodyJson<Payload>(req);
    const username = normalizeUsername(body.username);
    const email = normalizeEmail(body.email);
    const fullName = String(body.full_name ?? "").trim();
    if (!validUsername(username) || !validPassword(body.password) || !email.includes("@") || !validUuid(body.church_id) || fullName.length < 2 || fullName.length > 200) return generic();

    const admin = adminClient();
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email,
      password: body.password,
      email_confirm: true,
      user_metadata: { signup_source: "2gather-public-signup" },
    });
    if (createError || !created.user) return generic();
    createdUserId = created.user.id;

    const { error: requestError } = await admin.schema("private").rpc("create_public_access_request", {
      p_auth_user_id: created.user.id,
      p_username: username,
      p_email: email,
      p_church_id: body.church_id,
      p_full_name: fullName,
      p_preferred_name: body.preferred_name?.trim() || null,
      p_requested_profile_id: validUuid(body.requested_profile_id) ? body.requested_profile_id : null,
      p_requested_gc_id: validUuid(body.requested_gc_id) ? body.requested_gc_id : null,
      p_notes: body.notes?.trim().slice(0, 2000) || null,
    });

    if (requestError) {
      await admin.auth.admin.deleteUser(created.user.id, false);
      createdUserId = null;
    }
    return generic();
  } catch {
    if (createdUserId) {
      try { await adminClient().auth.admin.deleteUser(createdUserId, false); } catch { /* generic response */ }
    }
    return generic();
  }
});
