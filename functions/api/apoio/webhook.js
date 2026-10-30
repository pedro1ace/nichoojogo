// Webhook do Mercado Pago (Cloudflare Pages Function, em /api/apoio/webhook).
//
// Quando o Pix é pago, o Mercado Pago envia um POST avisando o id do pagamento.
// Se MP_WEBHOOK_SECRET estiver configurada, validamos o HMAC-SHA256 do cabeçalho
// x-signature. Em seguida, consultamos o pagamento direto na API do Mercado Pago
// com MP_ACCESS_TOKEN antes de marcar o apoio como aprovado no banco D1.

import { conferirNoMercadoPago, json } from "./index.js";

function iguaisTempoConstante(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function assinaturaValida(request, segredo, dataIdFallback) {
  const cabecalho = request.headers.get("x-signature");
  if (!cabecalho) return false;

  let ts = null;
  let v1 = null;
  for (const parte of cabecalho.split(",")) {
    const idx = parte.indexOf("=");
    if (idx === -1) continue;
    const k = parte.slice(0, idx).trim();
    const val = parte.slice(idx + 1).trim();
    if (k === "ts") ts = val;
    else if (k === "v1") v1 = val.toLowerCase();
  }
  if (!ts || !v1) return false;

  const url = new URL(request.url);
  const dataId = url.searchParams.get("data.id") || dataIdFallback || "";
  const requestId = request.headers.get("x-request-id") || "";

  const partes = [];
  if (dataId) partes.push(`id:${String(dataId).toLowerCase()}`);
  if (requestId) partes.push(`request-id:${requestId}`);
  partes.push(`ts:${ts}`);
  const manifesto = `${partes.join(";")};`;

  const enc = new TextEncoder();
  const chave = await crypto.subtle.importKey(
    "raw",
    enc.encode(segredo),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const buf = await crypto.subtle.sign("HMAC", chave, enc.encode(manifesto));
  const calculado = Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
  return iguaisTempoConstante(calculado, v1);
}

export async function onRequestGet() {
  return json({ ok: true });
}

export async function onRequestPost({ request, env }) {
  const url = new URL(request.url);
  const corpo = await request.json().catch(() => ({}));

  const dataId =
    url.searchParams.get("data.id") ||
    (corpo?.data?.id != null ? String(corpo.data.id) : "") ||
    url.searchParams.get("id") ||
    "";
  const tipo =
    url.searchParams.get("type") ||
    url.searchParams.get("topic") ||
    corpo?.type ||
    corpo?.topic ||
    "";

  if (env.MP_WEBHOOK_SECRET) {
    const ok = await assinaturaValida(request, env.MP_WEBHOOK_SECRET, dataId);
    if (!ok) return json({ erro: "Assinatura inválida." }, 401);
  }

  if (dataId && (!tipo || tipo === "payment" || String(corpo?.action || "").startsWith("payment."))) {
    await conferirNoMercadoPago(env, String(dataId));
  }

  return json({ ok: true });
}
