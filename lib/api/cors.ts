type JsonBody = Record<string, unknown>;

const allowHeaders = "Content-Type";

export function getAllowedApiOrigins() {
  return (process.env.ALLOWED_API_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

export function buildCorsHeaders(request: Request, headers?: HeadersInit) {
  const responseHeaders = new Headers(headers);
  const origin = request.headers.get("origin");
  const allowedOrigins = getAllowedApiOrigins();

  responseHeaders.set("Vary", appendVaryOrigin(responseHeaders.get("Vary")));

  if (origin && allowedOrigins.includes(origin)) {
    responseHeaders.set("Access-Control-Allow-Origin", origin);
  }

  return responseHeaders;
}

export function rejectDisallowedOrigin(request: Request) {
  const origin = request.headers.get("origin");

  if (
    !origin ||
    isSameOriginRequest(request, origin) ||
    getAllowedApiOrigins().includes(origin)
  ) {
    return null;
  }

  return jsonWithCors(
    request,
    { error: "This origin is not allowed to access the API." },
    { status: 403 },
  );
}

export function preflightResponse(request: Request, methods: string[]) {
  const forbidden = rejectDisallowedOrigin(request);

  if (forbidden) {
    return forbidden;
  }

  return new Response(null, {
    status: 204,
    headers: buildCorsHeaders(request, {
      "Access-Control-Allow-Methods": methods.join(", "),
      "Access-Control-Allow-Headers":
        request.headers.get("access-control-request-headers") ?? allowHeaders,
      "Access-Control-Max-Age": "86400",
    }),
  });
}

export function jsonWithCors(
  request: Request,
  body: JsonBody,
  init?: ResponseInit,
) {
  return Response.json(body, {
    ...init,
    headers: buildCorsHeaders(request, init?.headers),
  });
}

function isSameOriginRequest(request: Request, origin: string) {
  return origin === new URL(request.url).origin;
}

function appendVaryOrigin(vary: string | null) {
  if (!vary) {
    return "Origin";
  }

  const values = vary.split(",").map((value) => value.trim().toLowerCase());

  return values.includes("origin") ? vary : `${vary}, Origin`;
}
