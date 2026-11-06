const jsonHeaders = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
};

function jsonError(status, error) {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: jsonHeaders,
  });
}

function isLoopback(hostname) {
  const host = hostname.toLowerCase();
  return (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host === "::1" ||
    host === "127.0.0.1" ||
    host.startsWith("127.") ||
    host === "0.0.0.0" ||
    host.endsWith(".local") ||
    host.endsWith(".lan")
  );
}

export default {
  async fetch(request, env) {
    const requestUrl = new URL(request.url);

    if (requestUrl.pathname === "/api" || requestUrl.pathname.startsWith("/api/")) {
      const browserOrigin = request.headers.get("Origin");
      if (browserOrigin) {
        try {
          if (new URL(browserOrigin).origin !== requestUrl.origin) {
            return jsonError(403, "La solicitud no pertenece a FUNVERSE.");
          }
        } catch {
          return jsonError(403, "El origen de la solicitud no es válido.");
        }
      }

      const configuredOrigin = String(env.API_ORIGIN || "").trim();
      if (!configuredOrigin) {
        return jsonError(503, "El servidor de FUNVERSE todavía no está conectado.");
      }

      let apiOrigin;
      try {
        apiOrigin = new URL(configuredOrigin);
      } catch {
        return jsonError(503, "La dirección del servidor de FUNVERSE no es válida.");
      }

      if (
        apiOrigin.protocol !== "https:" ||
        apiOrigin.username ||
        apiOrigin.password ||
        apiOrigin.pathname !== "/" ||
        apiOrigin.search ||
        apiOrigin.hash ||
        isLoopback(apiOrigin.hostname)
      ) {
        return jsonError(503, "Configura API_ORIGIN con la dirección HTTPS pública de Cloudflare Tunnel.");
      }

      const upstreamUrl = new URL(requestUrl.pathname + requestUrl.search, apiOrigin.origin);
      const headers = new Headers(request.headers);
      headers.delete("host");
      headers.delete("origin");
      headers.delete("referer");

      const init = {
        method: request.method,
        headers,
        redirect: "manual",
      };
      if (request.method !== "GET" && request.method !== "HEAD") {
        init.body = request.body;
      }

      try {
        return await fetch(new Request(upstreamUrl, init));
      } catch {
        return jsonError(502, "No se pudo conectar con el servidor de FUNVERSE.");
      }
    }

    return env.ASSETS.fetch(request);
  },
};
