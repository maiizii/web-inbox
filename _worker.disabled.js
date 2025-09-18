export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/api/health") {
      return new Response(JSON.stringify({ ok: true, ts: Date.now() }), {
        headers: { "Content-Type": "application/json" }
      });
    }

    // 明确标识现在走到了 fallback，便于你观察
    return new Response("FALLBACK:" + url.pathname, { status: 200 });
  }
}
