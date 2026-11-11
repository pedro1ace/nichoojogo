// Testa a conta, o progresso e o placar sem a Cloudflare: node scripts/testar_conta.mjs
// Usa um banco SQLite em memória no lugar do D1 e um token do Google assinado aqui mesmo (chave de teste).
import { DatabaseSync } from "node:sqlite";
import { generateKeyPairSync, createSign } from "node:crypto";
import { conferirTokenGoogle, hojeBrasil } from "../servidor/conta.js";
import * as conta from "../functions/api/conta/index.js";
import * as entrar from "../functions/api/conta/entrar.js";
import * as sair from "../functions/api/conta/sair.js";
import * as apelido from "../functions/api/conta/apelido.js";
import * as progresso from "../functions/api/conta/progresso.js";
import * as placar from "../functions/api/placar/index.js";
import * as denunciar from "../functions/api/placar/denunciar.js";

// ---------- D1 de mentira ----------
function criarD1() {
  const sqlite = new DatabaseSync(":memory:");
  const comando = (sql, args = []) => ({
    sql,
    args,
    bind: (...a) => comando(sql, a),
    first: async () => sqlite.prepare(sql).all(...args)[0] ?? null,
    all: async () => ({ results: sqlite.prepare(sql).all(...args) }),
    run: async () => ({ meta: { changes: sqlite.prepare(sql).run(...args).changes } }),
  });
  return {
    sqlite,
    prepare: (sql) => comando(sql),
    async batch(lista) {
      const saida = [];
      for (const st of lista) saida.push(/^\s*(SELECT|WITH)/i.test(st.sql) ? await st.all() : await st.run());
      return saida;
    },
  };
}

// ---------- Google de mentira ----------
const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: "jwk" }), kid: "teste", alg: "RS256", use: "sig" };
const b64 = (o) => Buffer.from(typeof o === "string" ? o : JSON.stringify(o)).toString("base64url");
function tokenGoogle(sub, { aud = "cliente-teste", exp = Math.floor(Date.now() / 1000) + 600, iss = "https://accounts.google.com", email = "nao-guardar@exemplo.com" } = {}) {
  const h = b64({ alg: "RS256", kid: "teste", typ: "JWT" });
  const p = b64({ sub, aud, exp, iss, iat: Math.floor(Date.now() / 1000), email, email_verified: true });
  const s = createSign("RSA-SHA256").update(`${h}.${p}`).sign(privateKey).toString("base64url");
  return `${h}.${p}.${s}`;
}
globalThis.fetch = async (url) => {
  if (String(url).includes("googleapis.com/oauth2/v3/certs"))
    return new Response(JSON.stringify({ keys: [jwk] }), { headers: { "cache-control": "max-age=3600" } });
  throw new Error("rede desligada no teste: " + url);
};

// ---------- ajudas ----------
let falhas = 0;
const conferir = (ok, msg) => {
  console.log(`${ok ? "ok  " : "FALHOU"}  ${msg}`);
  if (!ok) falhas++;
};
const ORIGEM = "https://nichoojogo.com";
const db = criarD1();
const hoje = hojeBrasil();
const env = { DB: db, GOOGLE_CLIENT_ID: "cliente-teste" };
// pacote do dia, com uma categoria só repetida 7 vezes
const cat = (i) => ({ id: `cat${i}`, titulo: `Tema ${i}`, supernova: "Rara", respostas: [{ resposta: "Comum", pontos: 10 }, { resposta: "Rara", pontos: 50 }] });
db.sqlite.exec("CREATE TABLE dias (dia TEXT PRIMARY KEY, payload TEXT NOT NULL, criado_em TEXT)");
db.sqlite.exec("CREATE TABLE vereditos (categoria TEXT, texto TEXT, veredito TEXT, nome TEXT, pontos INTEGER)");
db.sqlite.exec("CREATE TABLE juiz_uso (dia TEXT PRIMARY KEY, n INTEGER NOT NULL DEFAULT 0)");
db.prepare("INSERT INTO dias (dia, payload) VALUES (?, ?)").bind(hoje, JSON.stringify({ dia: hoje, categorias: [0, 1, 2, 3, 4, 5, 6].map(cat) })).run();
db.prepare("INSERT INTO vereditos VALUES ('cat6', 'nova da ia', 'aceita', 'Nova da IA', 30)").run();

function pedido(caminho, { metodo = "GET", corpo, cookie, origem = ORIGEM } = {}) {
  const headers = { "content-type": "application/json" };
  if (cookie) headers.cookie = cookie;
  if (origem && metodo !== "GET") headers.origin = origem;
  return { request: new Request(ORIGEM + caminho, { method: metodo, headers, body: corpo ? JSON.stringify(corpo) : undefined }), env };
}
const ler = async (r) => ({ status: r.status, corpo: await r.json(), cookie: (r.headers.get("set-cookie") || "").split(";")[0] });

// ---------- token ----------
await conferirTokenGoogle(tokenGoogle("1"), "cliente-teste").then(() => conferir(true, "token bom passa"));
for (const [nome, t] of [
  ["outro site (aud)", tokenGoogle("1", { aud: "outro" })],
  ["vencido", tokenGoogle("1", { exp: 1000 })],
  ["outro emissor", tokenGoogle("1", { iss: "https://malvado.com" })],
  ["assinatura trocada", tokenGoogle("1").slice(0, -4) + "AAAA"],
]) {
  await conferirTokenGoogle(t, "cliente-teste").then(
    () => conferir(false, `token ${nome} devia falhar`),
    () => conferir(true, `token ${nome} é recusado`),
  );
}

// ---------- fluxo ----------
let r = await ler(await conta.onRequestGet(pedido("/api/conta")));
conferir(r.corpo.google === "cliente-teste" && r.corpo.conta === null, "GET /api/conta sem login");

r = await ler(await entrar.onRequestPost(pedido("/api/conta/entrar", { metodo: "POST", corpo: { credential: tokenGoogle("ana") }, origem: "https://malvado.com" })));
conferir(r.status === 403, "login vindo de outro site é recusado");

r = await ler(await entrar.onRequestPost(pedido("/api/conta/entrar", { metodo: "POST", corpo: { credential: tokenGoogle("ana") } })));
const ana = r.cookie;
conferir(r.status === 200 && r.corpo.nova && /^Viajante-\d{4}$/.test(r.corpo.conta.apelido), `1º login cria a conta (${r.corpo.conta?.apelido})`);
const linha = db.sqlite.prepare("SELECT * FROM contas").get();
conferir(!JSON.stringify(linha).includes("ana") && !JSON.stringify(linha).includes("@"), "o banco não guarda o id nem o e-mail do Google");

r = await ler(await entrar.onRequestPost(pedido("/api/conta/entrar", { metodo: "POST", corpo: { credential: tokenGoogle("ana") } })));
conferir(r.corpo.nova === false, "2º login acha a mesma conta");

r = await ler(await apelido.onRequestPost(pedido("/api/conta/apelido", { metodo: "POST", corpo: { apelido: "h1tl3r" }, cookie: ana })));
conferir(r.corpo.ok === false, `apelido ofensivo é recusado (${r.corpo.motivo})`);
r = await ler(await apelido.onRequestPost(pedido("/api/conta/apelido", { metodo: "POST", corpo: { apelido: "Ana Astro" }, cookie: ana })));
conferir(r.corpo.ok && r.corpo.apelido === "Ana Astro", "apelido bom é aceito");

const bruno = (await ler(await entrar.onRequestPost(pedido("/api/conta/entrar", { metodo: "POST", corpo: { credential: tokenGoogle("bruno") } })))).cookie;
r = await ler(await apelido.onRequestPost(pedido("/api/conta/apelido", { metodo: "POST", corpo: { apelido: "ana_astro" }, cookie: bruno })));
conferir(r.corpo.ok === false, "apelido de outra pessoa (mesmo com _ e minúsculas) é recusado");

// viagem de hoje: Ana diz que fez 7 x 100, mas só "Rara" (singularidade, 50 x 2) é verdade
const historico = (resp, pts) => [0, 1, 2, 3, 4, 5, 6].map((i) => ({ categoria: `Tema ${i}`, resposta: resp[i], pontos: pts[i], supernova: false, percentil: 0.5 }));
const trapaca = { historico: historico(["Rara", "Comum", "Inventada", "Comum", null, "Rara", "Nova da IA"], [100, 100, 100, 10, 0, 100, 100]), total: 510 };
r = await ler(await progresso.onRequestPost(pedido("/api/conta/progresso", { metodo: "POST", corpo: { registros: { [hoje]: trapaca, "2026-10-29": trapaca, "2099-01-01": trapaca } }, cookie: ana })));
conferir(r.corpo.placar?.pontos === 100 + 10 + 0 + 10 + 0 + 100 + 30, `pontos conferidos pelo servidor (${r.corpo.placar?.pontos}, não 510)`);
conferir(r.corpo.guardados === 2, "dia futuro não é guardado");

const outra = { historico: historico(["Comum", "Comum", "Comum", "Comum", "Comum", "Comum", "Comum"], [10, 10, 10, 10, 10, 10, 10]), total: 70 };
r = await ler(await progresso.onRequestPost(pedido("/api/conta/progresso", { metodo: "POST", corpo: { registros: { [hoje]: outra } }, cookie: ana })));
conferir(r.corpo.placar?.pontos === 250, "a 1ª viagem completa do dia não é sobrescrita");

r = await ler(await progresso.onRequestGet(pedido("/api/conta/progresso", { cookie: ana })));
conferir(r.corpo.registros[hoje]?.historico.length === 7 && r.corpo.registros["2026-10-29"], "GET do progresso devolve os dias guardados");

const dia29 = await ler(await placar.onRequestGet(pedido("/api/placar?dia=2026-10-29", { cookie: ana })));
conferir(dia29.corpo.total === 0 && dia29.corpo.fechado, "viagem de dia passado não entra no placar");

await progresso.onRequestPost(pedido("/api/conta/progresso", { metodo: "POST", corpo: { registros: { [hoje]: outra } }, cookie: bruno }));
r = await ler(await placar.onRequestGet(pedido(`/api/placar?dia=${hoje}`, { cookie: bruno })));
conferir(r.corpo.total === 2 && r.corpo.top[0].apelido === "Ana Astro" && r.corpo.voce?.posicao === 2, "placar de hoje em ordem, com a posição de quem pediu");
conferir(!r.corpo.fechado, "placar de hoje ainda está aberto");

// denúncias: 3 contas diferentes escondem o apelido
const idAna = r.corpo.top[0].id;
for (const sub of ["c1", "c2", "c3"]) {
  const ck = (await ler(await entrar.onRequestPost(pedido("/api/conta/entrar", { metodo: "POST", corpo: { credential: tokenGoogle(sub) } })))).cookie;
  r = await ler(await denunciar.onRequestPost(pedido("/api/placar/denunciar", { metodo: "POST", corpo: { id: idAna }, cookie: ck })));
}
conferir(r.corpo.escondido === true, "3 denúncias escondem o apelido");
r = await ler(await conta.onRequestGet(pedido("/api/conta", { cookie: ana })));
conferir(/^Viajante-/.test(r.corpo.conta.apelido) && !r.corpo.conta.escolheuApelido, "a dona volta para o apelido automático");
r = await ler(await apelido.onRequestPost(pedido("/api/conta/apelido", { metodo: "POST", corpo: { apelido: "Ana Astro" }, cookie: bruno })));
conferir(r.corpo.ok === false, "apelido denunciado fica barrado para todos");

const dev = await ler(await entrar.onRequestPost(pedido("/api/conta/entrar", { metodo: "POST", corpo: { credential: tokenGoogle("equipe", { email: "NichoOJogo@gmail.com" }) } })));
conferir(dev.corpo.conta.dev === true && r.corpo.ok !== undefined, "conta da equipe ganha o selo DEV");
conferir(!JSON.stringify(db.sqlite.prepare("SELECT * FROM contas").all()).includes("@"), "o e-mail da equipe também não é guardado");
await progresso.onRequestPost(pedido("/api/conta/progresso", { metodo: "POST", corpo: { registros: { [hoje]: outra } }, cookie: dev.cookie }));
r = await ler(await placar.onRequestGet(pedido(`/api/placar?dia=${hoje}`)));
conferir(r.corpo.top.some((l) => l.dev) && r.corpo.top.filter((l) => l.dev).length === 1, "o placar marca só a conta da equipe como DEV");
db.sqlite.exec("CREATE TABLE IF NOT EXISTS apoios (id TEXT, codigo TEXT, status TEXT)");
db.prepare("INSERT INTO apoios VALUES ('1', 'NICHO-ABCD-EFGH', 'approved'), ('2', 'NICHO-ZZZZ-ZZZZ', 'pending')").run();
r = await ler(await progresso.onRequestPost(pedido("/api/conta/progresso", { metodo: "POST", corpo: { extras: { skins: ["alien", "apoiador"], skin: "apoiador", apoio: "NICHO-ZZZZ-ZZZZ" } }, cookie: bruno })));
conferir(r.corpo.extras.skins.join() === "alien" && r.corpo.extras.skin === null, "Laika não libera sem código pago (Neil sim)");
r = await ler(await progresso.onRequestPost(pedido("/api/conta/progresso", { metodo: "POST", corpo: { extras: { skin: "apoiador", apoio: "nicho abcd efgh" } }, cookie: bruno })));
conferir(r.corpo.extras.skins.includes("apoiador") && r.corpo.extras.skin === "apoiador" && r.corpo.extras.apoio === "NICHO-ABCD-EFGH", "código pago libera a Laika na conta");
r = await ler(await progresso.onRequestGet(pedido("/api/conta/progresso", { cookie: bruno })));
conferir(r.corpo.extras.skins.includes("alien") && r.corpo.extras.apoio === "NICHO-ABCD-EFGH", "outro aparelho recebe as skins da conta");
r = await ler(await sair.onRequestPost(pedido("/api/conta/sair", { metodo: "POST", cookie: bruno })));
r = await ler(await conta.onRequestGet(pedido("/api/conta", { cookie: bruno })));
conferir(r.corpo.conta === null, "sair apaga a sessão");

r = await ler(await conta.onRequestDelete(pedido("/api/conta", { metodo: "DELETE", cookie: ana })));
r = await ler(await placar.onRequestGet(pedido(`/api/placar?dia=${hoje}`)));
conferir(r.corpo.total === 2, "excluir a conta tira a viagem do placar");
conferir(db.sqlite.prepare("SELECT COUNT(*) n FROM progresso").get().n === 2, "excluir a conta apaga o progresso dela");

console.log(falhas ? `\n${falhas} falhas` : "\ntudo certo");
process.exit(falhas ? 1 : 0);
