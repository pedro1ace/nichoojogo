// Apoio ao criador via Pix (Cloudflare Pages Function, em /api/apoio).
//
// Usa a API de pagamentos do Mercado Pago (POST /v1/payments com payment_method_id = "pix")
// e o banco D1 (tabela "apoios" em banco/schema.sql). Não guarda nome, CPF, e-mail nem IP:
// só o id do pedido, o id do pagamento no Mercado Pago, o valor, o status e um código
// (NICHO-XXXX-XXXX) entregue apenas depois que o Pix é aprovado, para liberar a skin
// de apoiador também em outros aparelhos.
//
//   POST /api/apoio {valor}                 cria a cobrança Pix e devolve o QR Code
//   GET  /api/apoio?id=<uuid>               consulta o status (e devolve o código se aprovado)
//   GET  /api/apoio?codigo=NICHO-XXXX-XXXX  valida um código de apoiador já pago
//
// Variáveis de ambiente no Cloudflare Pages:
//   MP_ACCESS_TOKEN    (obrigatória) Access Token do Mercado Pago (APP_USR-... ou TEST-...)
//   MP_WEBHOOK_SECRET  (opcional)    Assinatura secreta do Webhook no painel do Mercado Pago

const MP_API = "https://api.mercadopago.com/v1/payments";
const MIN_CENTAVOS = 200; // R$ 2,00
const MAX_CENTAVOS = 100000; // R$ 1.000,00
const EXPIRACAO_MS = 30 * 60 * 1000; // 30 minutos
const ALFABETO = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // 32 caracteres sem 0/O nem 1/I

export const json = (corpo, status = 200) =>
  new Response(JSON.stringify(corpo), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });

function gerarCodigo() {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  let s = "";
  for (let i = 0; i < 8; i++) s += ALFABETO[bytes[i] & 31];
  return `NICHO-${s.slice(0, 4)}-${s.slice(4, 8)}`;
}

export function normalizarCodigo(texto) {
  if (typeof texto !== "string") return null;
  let limpo = texto.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (limpo.startsWith("NICHO")) limpo = limpo.slice(5);
  if (limpo.length !== 8) return null;
  for (const c of limpo) if (!ALFABETO.includes(c)) return null;
  return `NICHO-${limpo.slice(0, 4)}-${limpo.slice(4, 8)}`;
}

// Consulta o pagamento direto no Mercado Pago (fonte da verdade) e sincroniza o D1.
export async function conferirNoMercadoPago(env, mpId) {
  if (!env.MP_ACCESS_TOKEN || !mpId || !/^\d+$/.test(String(mpId))) return null;
  let res;
  try {
    res = await fetch(`${MP_API}/${encodeURIComponent(String(mpId))}`, {
      headers: { Authorization: `Bearer ${env.MP_ACCESS_TOKEN}` },
    });
  } catch {
    return null;
  }
  if (!res.ok) return null;
  const pg = await res.json().catch(() => null);
  if (!pg || !pg.status) return null;

  const idExterno = typeof pg.external_reference === "string" ? pg.external_reference : "";
  const idMp = String(pg.id || mpId);

  if (pg.status === "approved" && env.DB) {
    const pagoEm = new Date().toISOString();
    await env.DB.prepare(
      "UPDATE apoios SET status = 'approved', pago_em = COALESCE(pago_em, ?), mp_id = COALESCE(mp_id, ?) WHERE mp_id = ? OR id = ?",
    )
      .bind(pagoEm, idMp, idMp, idExterno)
      .run();
  } else if ((pg.status === "cancelled" || pg.status === "rejected") && env.DB) {
    await env.DB.prepare(
      "UPDATE apoios SET status = ? WHERE (mp_id = ? OR id = ?) AND status = 'pending'",
    )
      .bind(pg.status, idMp, idExterno)
      .run();
  }

  return { status: pg.status, mp_id: idMp, external_reference: idExterno };
}

export async function onRequestGet({ request, env }) {
  if (!env.DB) return json({ erro: "Banco indisponível.", codigo: "sem_config" }, 503);
  const params = new URL(request.url).searchParams;

  if (params.has("codigo")) {
    const codigo = normalizarCodigo(params.get("codigo"));
    if (!codigo) return json({ erro: "Código inválido. Use o formato NICHO-XXXX-XXXX." }, 400);
    const linha = await env.DB.prepare("SELECT status, codigo FROM apoios WHERE codigo = ?")
      .bind(codigo)
      .first();
    if (!linha || linha.status !== "approved") {
      return json({ erro: "Código não encontrado ou pagamento ainda não confirmado." }, 404);
    }
    return json({ status: "approved", codigo: linha.codigo });
  }

  const id = params.get("id");
  if (typeof id !== "string" || !/^[0-9a-f-]{20,40}$/i.test(id)) {
    return json({ erro: "Pedido inválido." }, 400);
  }

  const linha = await env.DB.prepare("SELECT id, mp_id, status, codigo FROM apoios WHERE id = ?")
    .bind(id)
    .first();
  if (!linha) return json({ erro: "Pedido não encontrado." }, 404);

  if (linha.status === "approved") {
    return json({ status: "approved", codigo: linha.codigo });
  }

  if (linha.status === "pending" && linha.mp_id && env.MP_ACCESS_TOKEN) {
    const mp = await conferirNoMercadoPago(env, linha.mp_id);
    if (mp && mp.status === "approved") {
      return json({ status: "approved", codigo: linha.codigo });
    }
    if (mp && mp.status) {
      return json({ status: mp.status });
    }
  }

  return json({ status: linha.status });
}

export async function onRequestPost({ request, env }) {
  if (!env.DB || !env.MP_ACCESS_TOKEN) {
    return json({ erro: "O Pix ainda não está ativo neste servidor.", codigo: "sem_config" }, 503);
  }

  let corpo;
  try {
    corpo = await request.json();
  } catch {
    return json({ erro: "Corpo inválido." }, 400);
  }

  const valorBruto = Number(corpo?.valor);
  if (!Number.isFinite(valorBruto)) return json({ erro: "Informe um valor válido." }, 400);
  const centavos = Math.round(valorBruto * 100);
  if (centavos < MIN_CENTAVOS) return json({ erro: "O valor mínimo para Pix é R$ 2,00." }, 400);
  if (centavos > MAX_CENTAVOS) return json({ erro: "Valor acima do limite permitido." }, 400);

  const id = crypto.randomUUID();
  const agora = new Date();
  const expira = new Date(agora.getTime() + EXPIRACAO_MS);
  // O parser de datas do Mercado Pago exige offset explícito (+00:00) em vez de "Z".
  const expiraMp = expira.toISOString().replace("Z", "+00:00");
  const url = new URL(request.url);
  const emailPagador = `apoiador.${id.replace(/-/g, "").slice(0, 10)}@nichoojogo.com`;

  const pedidoMp = {
    transaction_amount: Number((centavos / 100).toFixed(2)),
    description: "Apoio ao Nicho",
    payment_method_id: "pix",
    external_reference: id,
    date_of_expiration: expiraMp,
    payer: { email: emailPagador },
  };
  if (url.protocol === "https:") {
    pedidoMp.notification_url = `${url.origin}/api/apoio/webhook`;
  }

  let resMp;
  try {
    resMp = await fetch(MP_API, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.MP_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
        "X-Idempotency-Key": id,
      },
      body: JSON.stringify(pedidoMp),
    });
  } catch {
    return json({ erro: "Não foi possível conectar ao Mercado Pago. Tente novamente." }, 502);
  }

  const dadosMp = await resMp.json().catch(() => null);
  const tx = dadosMp?.point_of_interaction?.transaction_data;
  if (!resMp.ok || !dadosMp?.id || !tx?.qr_code) {
    return json({ erro: "Não foi possível gerar o QR Code Pix agora. Tente novamente." }, 502);
  }

  const mpId = String(dadosMp.id);
  let gravado = false;
  for (let tentativa = 0; tentativa < 3 && !gravado; tentativa++) {
    const codigo = gerarCodigo();
    try {
      await env.DB.prepare(
        "INSERT INTO apoios (id, mp_id, centavos, status, codigo, criado_em) VALUES (?, ?, ?, 'pending', ?, ?)",
      )
        .bind(id, mpId, centavos, codigo, agora.toISOString())
        .run();
      gravado = true;
    } catch {
      // colisão improvável de código: gera outro
    }
  }
  if (!gravado) return json({ erro: "Erro ao registrar o pedido." }, 500);

  return json(
    {
      id,
      valor: centavos / 100,
      qr_code: tx.qr_code,
      qr_code_base64: tx.qr_code_base64 || null,
      expira_em: expira.toISOString(),
    },
    201,
  );
}
