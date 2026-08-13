// Cloudflare Pages Function — proxies /api/* to the Render API.
//
// _redirects' 200-status rewrite CANNOT target an external absolute URL —
// that's a Netlify-only feature; Cloudflare Pages only rewrites to paths
// inside the same project. Functions are the actual mechanism: this runs on
// Cloudflare's edge and does a real fetch() to Render, so the browser only
// ever talks to briefline.alexcuesta.dev. That matters here specifically
// because the app's session cookie is __Host- prefixed with SameSite=Lax
// (apps/api/src/modules/auth/auth.constants.ts) — it only works same-origin.
const API_ORIGIN = 'https://briefline-crm.onrender.com'

export async function onRequest(context) {
  const { request, params } = context
  const segments = Array.isArray(params.path) ? params.path : [params.path].filter(Boolean)
  const url = new URL(request.url)
  const target = new URL(`/api/${segments.join('/')}${url.search}`, API_ORIGIN)

  const upstream = await fetch(target, {
    method: request.method,
    headers: request.headers,
    body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.body,
    redirect: 'manual',
  })

  // Return the upstream response as-is — Set-Cookie (the __Host- session
  // cookie, CSRF cookie) passes through unchanged, binding to this origin.
  return new Response(upstream.body, upstream)
}
