// Teste de regressão da busca (jogo/busca.js) com o log de recusadas.
//
// Cada linha de dados/sinais/revisao/recusadas-<dia>.csv é algo que um jogador digitou, o jogo
// recusou e a IA julgou depois (coluna "ia"). Isso vira um gabarito:
//   ia = aceita, e ia_nome é uma resposta da lista  -> a busca TEM que achar essa resposta
//   ia = recusada                                    -> a busca NÃO pode aceitar direto
// Cada linha pesa "n" (quantos jogadores digitaram aquilo).
//
// Uso:
//   node scripts/avaliar_busca.mjs                      # busca atual
//   node scripts/avaliar_busca.mjs --busca outra.js     # outra versão do jogo/busca.js (antes/depois)
//   node scripts/avaliar_busca.mjs --exemplos 30        # lista os erros mais digitados
//   node scripts/avaliar_busca.mjs --json saida.json    # grava as métricas
//   node scripts/avaliar_busca.mjs --trava              # sai com código 1 se piorar a referência
//
// A referência fica em dados/sinais/revisao/busca-referencia.json (gravada com --gravar-referencia).
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REVISAO = path.join(RAIZ, "dados", "sinais", "revisao");
const REFERENCIA = path.join(REVISAO, "busca-referencia.json");

const args = process.argv.slice(2);
const opcao = (nome, padrao = null) => {
  const i = args.indexOf(nome);
  return i >= 0 ? args[i + 1] : padrao;
};
const arquivoBusca = path.resolve(opcao("--busca", path.join(RAIZ, "jogo", "busca.js")));
const nExemplos = Number(opcao("--exemplos", 0));

// carrega o busca.js como script comum (igual ao navegador), numa caixa isolada
export function carregarBusca(arquivo) {
  const caixa = {};
  vm.createContext(caixa);
  const codigo = fs.readFileSync(arquivo, "utf8").replace(/^export\s*\{[^}]*\};?\s*$/m, "");
  vm.runInContext(codigo + "\n;globalThis.__b = { buscar, prepararCategoria, compactar };", caixa);
  return caixa.__b;
}

export function carregarCategorias() {
  const texto = fs.readFileSync(path.join(RAIZ, "jogo", "dados.js"), "utf8");
  const inicio = texto.indexOf("{");
  const fim = texto.lastIndexOf("}");
  return JSON.parse(texto.slice(inicio, fim + 1)).categorias;
}

// CSV simples com aspas
export function lerCsv(arquivo) {
  const linhas = [];
  const t = fs.readFileSync(arquivo, "utf8");
  let campo = "", linha = [], aspas = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (aspas) {
      if (c === '"' && t[i + 1] === '"') { campo += '"'; i++; }
      else if (c === '"') aspas = false;
      else campo += c;
    } else if (c === '"') aspas = true;
    else if (c === ",") { linha.push(campo); campo = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && t[i + 1] === "\n") i++;
      linha.push(campo); campo = "";
      if (linha.length > 1 || linha[0]) linhas.push(linha);
      linha = [];
    } else campo += c;
  }
  if (campo || linha.length) { linha.push(campo); linhas.push(linha); }
  const [cab, ...resto] = linhas;
  return resto.map((l) => Object.fromEntries(cab.map((k, i) => [k, l[i] ?? ""])));
}

export function gabarito(busca, categorias) {
  const arquivos = fs.readdirSync(REVISAO).filter((f) => /^recusadas-\d{4}-\d{2}-\d{2}\.csv$/.test(f)).sort();
  const preparadas = new Map();
  const casos = new Map(); // categoria|texto -> caso (somando os dias)
  for (const f of arquivos) {
    for (const r of lerCsv(path.join(REVISAO, f))) {
      if (r.ia !== "aceita" && r.ia !== "recusada") continue;
      const cat = categorias[r.categoria];
      if (!cat) continue;
      if (!preparadas.has(r.categoria)) preparadas.set(r.categoria, busca.prepararCategoria(cat));
      const prep = preparadas.get(r.categoria);
      let alvo = null;
      if (r.ia === "aceita") {
        const nome = r.ia_nome || r.na_lista;
        const item = nome && prep.mapa.get(busca.compactar(nome));
        if (!item) continue; // a IA aceitou algo que a lista ainda não tem: é falta de resposta, não de busca
        alvo = item.resposta.resposta;
      }
      const chave = `${r.categoria}|${busca.compactar(r.texto)}`;
      const ja = casos.get(chave);
      if (ja) { ja.n += Number(r.n) || 1; continue; }
      casos.set(chave, { categoria: r.categoria, texto: r.texto, n: Number(r.n) || 1, ia: r.ia, alvo, dia: f.slice(10, 20) });
    }
  }
  return { casos: [...casos.values()], preparadas };
}

export function avaliar(busca, categorias) {
  const { casos, preparadas } = gabarito(busca, categorias);
  const m = {
    validas: { casos: 0, jogadores: 0, direto: 0, sugere: 0, errada: 0, nada: 0 },
    invalidas: { casos: 0, jogadores: 0, direto: 0, sugere: 0, nada: 0 },
    curadas: { casos: 0, jogadores: 0 }, // a IA recusou, mas alguém pôs a grafia na lista depois
  };
  const erros = [];
  for (const c of casos) {
    const achou = busca.buscar(preparadas.get(c.categoria), c.texto);
    if (c.ia === "aceita") {
      const v = m.validas;
      v.casos++; v.jogadores += c.n;
      if (!achou) { v.nada += c.n; erros.push({ ...c, tipo: "válida não achada" }); }
      else if (achou.resposta.resposta !== c.alvo) { v.errada += c.n; erros.push({ ...c, tipo: "achou outra", achou: achou.resposta.resposta }); }
      else if (achou.exato) v.direto += c.n;
      else v.sugere += c.n;
    } else if (preparadas.get(c.categoria).mapa.has(busca.compactar(c.texto))) {
      m.curadas.casos++; m.curadas.jogadores += c.n;
    } else {
      const v = m.invalidas;
      v.casos++; v.jogadores += c.n;
      if (!achou) v.nada += c.n;
      else if (achou.exato) { v.direto += c.n; erros.push({ ...c, tipo: "inválida aceita", achou: achou.resposta.resposta }); }
      else { v.sugere += c.n; erros.push({ ...c, tipo: "inválida sugerida", achou: achou.resposta.resposta }); }
    }
  }
  const pct = (a, b) => (b ? Math.round((1000 * a) / b) / 10 : 0);
  m.resumo = {
    validas_achadas_pct: pct(m.validas.direto + m.validas.sugere, m.validas.jogadores),
    validas_direto_pct: pct(m.validas.direto, m.validas.jogadores),
    validas_trocadas_pct: pct(m.validas.errada, m.validas.jogadores),
    invalidas_barradas_pct: pct(m.invalidas.nada, m.invalidas.jogadores),
    invalidas_aceitas_direto_pct: pct(m.invalidas.direto, m.invalidas.jogadores),
  };
  erros.sort((a, b) => b.n - a.n);
  return { metricas: m, erros };
}

// O que a IA aceitou e a busca de hoje não acha, nem pela grafia nem pelo nome que a IA deu:
// falta na lista. Soma os dias. É a entrada do scripts/recuperar_recusadas.py.
export function faltando(busca, categorias) {
  const arquivos = fs.readdirSync(REVISAO).filter((f) => /^recusadas-\d{4}-\d{2}-\d{2}\.csv$/.test(f)).sort();
  const preparadas = new Map();
  const juntas = new Map();
  for (const f of arquivos) {
    for (const r of lerCsv(path.join(REVISAO, f))) {
      const cat = categorias[r.categoria];
      if (r.ia !== "aceita" || !cat) continue;
      if (!preparadas.has(r.categoria)) preparadas.set(r.categoria, busca.prepararCategoria(cat));
      const prep = preparadas.get(r.categoria);
      if (busca.buscar(prep, r.texto) || (r.ia_nome && prep.mapa.has(busca.compactar(r.ia_nome)))) continue;
      const chave = `${r.categoria}|${r.texto}|${r.ia_nome}`;
      const ja = juntas.get(chave);
      if (ja) ja.n += Number(r.n) || 1;
      else juntas.set(chave, { categoria: r.categoria, texto: r.texto, n: Number(r.n) || 1, como: "", na_lista: "", ia: "aceita", ia_nome: r.ia_nome || "" });
    }
  }
  return [...juntas.values()];
}

if (import.meta.url === `file://${process.argv[1]}` && args.includes("--faltando")) {
  console.log(JSON.stringify(faltando(carregarBusca(arquivoBusca), carregarCategorias())));
  process.exit(0);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const busca = carregarBusca(arquivoBusca);
  const { metricas, erros } = avaliar(busca, carregarCategorias());
  const v = metricas.validas, inv = metricas.invalidas, r = metricas.resumo;
  console.log(`busca: ${path.relative(RAIZ, arquivoBusca)}`);
  console.log(`válidas (a IA aceitou, a lista tem): ${v.casos} grafias, ${v.jogadores} jogadores`);
  console.log(`  achadas ${r.validas_achadas_pct}%  (direto ${v.direto}, sugere ${v.sugere}, outra resposta ${v.errada}, nada ${v.nada})`);
  console.log(`inválidas (a IA recusou): ${inv.casos} grafias, ${inv.jogadores} jogadores`);
  console.log(`  barradas ${r.invalidas_barradas_pct}%  (aceitas direto ${inv.direto}, sugeridas ${inv.sugere})`);
  console.log(`(fora da conta: ${metricas.curadas.casos} grafias que a IA recusou e a curadoria pôs na lista depois)`);
  if (nExemplos) {
    console.log(`\nerros mais digitados:`);
    for (const e of erros.slice(0, nExemplos)) console.log(`  ${String(e.n).padStart(4)}  ${e.tipo.padEnd(18)} ${e.categoria}: "${e.texto}" -> ${e.alvo || "-"}${e.achou ? ` (achou ${e.achou})` : ""}`);
  }
  const saida = opcao("--json");
  if (saida) fs.writeFileSync(saida, JSON.stringify({ metricas, erros: erros.slice(0, 500) }, null, 1));
  if (args.includes("--gravar-referencia")) {
    fs.writeFileSync(REFERENCIA, JSON.stringify(metricas.resumo, null, 1) + "\n");
    console.log(`referência gravada em ${path.relative(RAIZ, REFERENCIA)}`);
  }
  if (args.includes("--trava") && fs.existsSync(REFERENCIA)) {
    const ref = JSON.parse(fs.readFileSync(REFERENCIA, "utf8"));
    const piorou = [];
    if (r.validas_achadas_pct < ref.validas_achadas_pct - 0.1) piorou.push(`válidas achadas ${ref.validas_achadas_pct}% -> ${r.validas_achadas_pct}%`);
    if (r.invalidas_aceitas_direto_pct > ref.invalidas_aceitas_direto_pct + 0.1) piorou.push(`inválidas aceitas direto ${ref.invalidas_aceitas_direto_pct}% -> ${r.invalidas_aceitas_direto_pct}%`);
    if (r.validas_trocadas_pct > ref.validas_trocadas_pct + 0.1) piorou.push(`válidas trocadas por outra ${ref.validas_trocadas_pct}% -> ${r.validas_trocadas_pct}%`);
    if (piorou.length) { console.log(`\nPIOROU:\n  ${piorou.join("\n  ")}`); process.exit(1); }
    console.log("\nok: não piorou a referência");
  }
}
