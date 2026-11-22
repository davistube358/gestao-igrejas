// 2Gather - Edge Function "public-signup": DESATIVADA no Build 63 (LGPD-1).
// A v12 criava usuario Auth e pedido de acesso sem exigir nem gravar o aceite da Politica de Privacidade,
// o que burlava o aceite do cadastro (B63_1). O cadastro publico oficial e a acao "cadastro" da Edge "auth",
// que grava pedido + aceite numa transacao (app.edge_create_access_request_with_consent).
// O front v39 nao chama esta funcao (so functions/v1/auth). Reverter = publicar de novo a v12 (historico do Git).
// Este stub nao le o corpo, nao cria usuario e nao acessa o banco.
const headers = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
};

Deno.serve((req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
  return new Response(JSON.stringify({ error: "ENDPOINT_DESATIVADO" }), { status: 410, headers });
});
