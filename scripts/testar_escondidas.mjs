// Testa as respostas escondidas de quem não está logado (functions/api/dia.js e /api/conferir):
//   node scripts/testar_escondidas.mjs
// Usa um banco SQLite em memória no lugar do D1 e a categoria "doencas" de jogo/dados.js.
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { criarTabelas, resumo, hojeBrasil, COOKIE } from "../servidor/conta.js";
import { PONTOS_ESCONDIDOS } from "../servidor/dias.js";
import * as dia from "../functions/api/dia.js";
import * as conferirApi from "../functions/api/conferir.js";

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
    async exec(sql) { sqlite.exec(sql); },
  };
}

let falhas = 0;
const conferir = (ok, msg) => {
  console.log(`${ok ? "ok  " : "FALHOU"}  ${msg}`);
  if (!ok) falhas++;
};

const dados = JSON.parse(readFileSync(new URL("../jogo/dados.js", import.meta.url), "utf8").replace(/^[\s\S]*?window\.NICHO_DADOS = /, "").replace(/;\s*$/, ""));
const doencas = dados.categorias["doencas"];
const outras = Object.values(dados.categorias).filter((c) => c.id !== "doencas").slice(0, 6);
const pacote = { categorias: [doencas, ...outras] };

const db = criarD1();
await criarTabelas(db);
db.sqlite.exec("CREATE TABLE dias (dia TEXT PRIMARY KEY, payload TEXT NOT NULL, criado_em TEXT)");
const hoje = hojeBrasil();
const ontem = new Date(Date.parse(hoje + "T12:00:00Z") - 86400000).toISOString().slice(0, 10);
const amanha = new Date(Date.parse(hoje + "T12:00:00Z") + 86400000).toISOString().slice(0, 10);
for (const d of [ontem, hoje, amanha]) db.prepare("INSERT INTO dias (dia, payload, criado_em) VALUES (?, ?, 'v1')").bind(d, JSON.stringify(pacote)).run();

// uma conta logada
db.sqlite.prepare("INSERT INTO contas (id, google, apelido, apelido_chave) VALUES ('c1', 'g1', 'Ana', 'ana')").run();
db.sqlite.prepare("INSERT INTO sessoes (token, conta, expira_em) VALUES (?, 'c1', '2999-01-01T00:00:00Z')").run(await resumo("token-da-ana"));
const logado = `${COOKIE}=token-da-ana`;

const env = { DB: db };
const pedir = async (fn, caminho, { cookie, corpo } = {}) => {
  const headers = { "content-type": "application/json" };
  if (cookie) headers.cookie = cookie;
  const request = new Request("https://nichoojogo.com" + caminho, { method: corpo ? "POST" : "GET", headers, body: corpo ? JSON.stringify(corpo) : undefined });
  const r = await fn({ request, env });
  return { status: r.status, cache: r.headers.get("cache-control"), corpo: await r.json() };
};
const raras = (c) => c.respostas.filter((r) => r.pontos >= PONTOS_ESCONDIDOS || r.resposta === c.supernova);

// ---------- /api/dia ----------
// hoje vai completo para todo mundo: o jogo tem que aceitar as raras de quem não está logado (12/11)
let r = await pedir(dia.onRequestGet, `/api/dia?dia=${hoje}`);
let c = r.corpo.categorias[0];
conferir(r.status === 200 && c.supernova === doencas.supernova && c.respostas.length === doencas.respostas.length && !c.ocultas, "sem login: hoje vem completo (o jogo aceita as raras)");
r = await pedir(dia.onRequestGet, `/api/dia?dia=${hoje}`, { cookie: logado });
c = r.corpo.categorias[0];
conferir(c.supernova === doencas.supernova && c.respostas.length === doencas.respostas.length && !c.ocultas, "logado: hoje vem completo");

r = await pedir(dia.onRequestGet, `/api/dia?dia=${ontem}`);
conferir(r.corpo.categorias[0].supernova === doencas.supernova && /public/.test(r.cache), "dia que já passou vem completo para todo mundo");

r = await pedir(dia.onRequestGet, `/api/dia?dia=${amanha}`, { cookie: logado });
conferir(!r.corpo.categorias[0].supernova && r.corpo.categorias[0].ocultas > 0, "dia que ainda não chegou vem sem as raras, mesmo logado");

// ---------- /api/conferir ----------
const perguntar = (texto, extra = {}) => pedir(conferirApi.onRequestPost, "/api/conferir", { corpo: { dia: hoje, categoria: "doencas", texto, ...extra } });
r = await perguntar(doencas.supernova);
conferir(r.corpo.achada?.resposta === doencas.supernova && r.corpo.supernova && r.corpo.exato, "acha a singularidade digitada certa");
conferir(!doencas.curiosidade || r.corpo.curiosidade === doencas.curiosidade, "devolve a descrição da singularidade");

r = await perguntar(doencas.supernova.toLowerCase().slice(0, -1) + "u");
conferir(r.corpo.achada?.resposta === doencas.supernova && r.corpo.exato === false && r.corpo.nome === doencas.supernova, "corrige erro de digitação (pede para confirmar)");

const rara = raras(doencas).find((x) => x.resposta !== doencas.supernova && x.apelidos?.length);
r = await perguntar(rara.apelidos[0]);
conferir(r.corpo.achada?.resposta === rara.resposta && !r.corpo.supernova && r.corpo.achada.pontos === rara.pontos, `acha resposta do espaço profundo pelo apelido (${rara.apelidos[0]} = ${rara.resposta})`);

const comum = doencas.respostas.find((x) => x.pontos < 20);
r = await perguntar(comum.resposta);
conferir(r.corpo.achada === null, "resposta que o jogo já tem não é devolvida");
r = await perguntar("xyzabc nada a ver");
conferir(r.corpo.achada === null, "o que não existe não é achado");
r = await perguntar("gripe", { categoria: "nao-e-de-hoje" });
conferir(r.status === 404, "categoria de outro dia é recusada");
r = await perguntar("gripe", { dia: amanha });
conferir(r.status === 400, "dia que ainda não chegou é recusado");

console.log(falhas ? `\n${falhas} falhas` : "\ntudo certo");
process.exit(falhas ? 1 : 0);
