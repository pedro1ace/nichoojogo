// Regras dos apelidos do placar. Sem banco e sem rede: dá para testar com node (scripts/testar_apelidos.mjs).
//
// Três camadas contra apelido preconceituoso, racista, sexual ou de ódio:
//   1. formato: de 3 a 16 caracteres, só letras, números, espaço, "_" e "-";
//   2. listas (dados/apelidos-proibidos.js), conferidas depois de desfazer os disfarces mais comuns:
//      acentos, maiúsculas, números no lugar de letras (n4z1), separadores (h.i.t.l.e.r), letras
//      repetidas (viiiado) e trocas de som (k por c, y por i, w por v, ph por f);
//   3. juiz de IA (servidor/conta.js, julgarApelido), para o que escapar das listas.
// Depois de no ar, qualquer jogador logado pode denunciar (functions/api/placar/denunciar.js).

import PROIBIDOS from "../dados/apelidos-proibidos.js";

export const APELIDO_MIN = 3;
export const APELIDO_MAX = 16;

const semAcento = (t) => t.normalize("NFD").replace(/[̀-ͯ]/g, "");

// "Pedro_Silva 2" e "pedro silva2" são o mesmo apelido: é a chave única no banco.
export const chaveDoApelido = (t) => semAcento(String(t)).toLowerCase().replace(/[^a-z0-9]/g, "");

// Como o apelido aparece: espaços juntos, sem espaço nas pontas.
export const limparApelido = (t) => String(t ?? "").normalize("NFC").replace(/\s+/g, " ").trim();

const LEET = { 0: "o", 1: "i", 2: "z", 3: "e", 4: "a", 5: "s", 6: "g", 7: "t", 8: "b", 9: "g", "@": "a", $: "s", "!": "i", "|": "i", "€": "e", "£": "l" };
const trocarLeet = (t) => [...t].map((c) => LEET[c] ?? c).join("");
const juntarRepetidas = (t) => t.replace(/([a-z])\1+/g, "$1");
const trocarSons = (t) => t.replace(/ph/g, "f").replace(/qu/g, "c").replace(/k/g, "c").replace(/y/g, "i").replace(/w/g, "v").replace(/ç/g, "c");

// As formas do apelido que vão contra as listas. Cada forma tem a versão colada (sem separador nenhum)
// e as palavras soltas.
export function formas(apelido) {
  const base = semAcento(String(apelido)).toLowerCase();
  const comLeet = trocarLeet(base);
  const semNumeros = base.replace(/[0-9]/g, " ");
  const saida = new Set();
  for (const t of [base, comLeet, semNumeros]) {
    const palavras = t.split(/[^a-z0-9]+/).filter(Boolean);
    for (const f of [(x) => x, juntarRepetidas, (x) => trocarSons(juntarRepetidas(x))]) {
      const soltas = palavras.map((p) => f(p.replace(/[^a-z]/g, ""))).filter(Boolean);
      saida.add(JSON.stringify({ colado: f(t.replace(/[^a-z0-9]/g, "")), soltas }));
      // "c u z a o" -> as letras soltas viram uma palavra só
      if (palavras.length > 1 && palavras.every((p) => p.length <= 2)) saida.add(JSON.stringify({ colado: f(palavras.join("")), soltas: [f(palavras.join(""))] }));
    }
  }
  return [...saida].map((s) => JSON.parse(s));
}

const prepararLista = (lista) => [...new Set(lista.map((p) => chaveDoApelido(trocarLeet(semAcento(p).toLowerCase()))).filter(Boolean))];
const DENTRO = prepararLista(PROIBIDOS.dentro || []);
const INTEIRAS = new Set(prepararLista(PROIBIDOS.inteiras || []));
// as formas "com som trocado" também comparam contra a lista com som trocado
const DENTRO_SOM = DENTRO.map((p) => trocarSons(juntarRepetidas(p)));
const INTEIRAS_SOM = new Set([...INTEIRAS].map((p) => trocarSons(juntarRepetidas(p))));

// Devolve a palavra da lista que barrou, ou null.
export function palavraProibida(apelido) {
  for (const { colado, soltas } of formas(apelido)) {
    const achada = DENTRO.find((p) => p.length >= 3 && colado.includes(p)) || DENTRO_SOM.find((p) => p.length >= 4 && colado.includes(p));
    if (achada) return achada;
    if (INTEIRAS.has(colado) || INTEIRAS_SOM.has(colado)) return colado;
    const solta = soltas.find((p) => INTEIRAS.has(p) || INTEIRAS_SOM.has(p));
    if (solta) return solta;
  }
  return null;
}

// Confere formato e listas. Devolve { ok: true, apelido, chave } ou { ok: false, motivo }.
export function conferirApelido(texto) {
  const apelido = limparApelido(texto);
  const tamanho = [...apelido].length;
  if (tamanho < APELIDO_MIN) return { ok: false, motivo: `O apelido precisa de pelo menos ${APELIDO_MIN} letras.` };
  if (tamanho > APELIDO_MAX) return { ok: false, motivo: `O apelido pode ter no máximo ${APELIDO_MAX} caracteres.` };
  if (!/^[\p{L}\p{N} _-]+$/u.test(apelido)) return { ok: false, motivo: "Use só letras, números, espaço, _ e -." };
  if ((apelido.match(/\p{L}/gu) || []).length < 2) return { ok: false, motivo: "O apelido precisa ter pelo menos 2 letras." };
  if (/(.)\1{4,}/u.test(apelido)) return { ok: false, motivo: "Muitas letras repetidas seguidas." };
  const chave = chaveDoApelido(apelido);
  if (chave.length < APELIDO_MIN) return { ok: false, motivo: "Use letras sem tantos símbolos." };
  if (/^viajante\d*$/.test(chave)) return { ok: false, motivo: "Esse formato é reservado para os apelidos automáticos." };
  if (palavraProibida(apelido)) return { ok: false, motivo: "Esse apelido não pode. Escolha outro, sem palavrão, ofensa ou preconceito." };
  return { ok: true, apelido, chave };
}

// "Viajante-4821": o apelido de quem ainda não escolheu (e de quem teve o apelido escondido por denúncia).
export function apelidoAutomatico() {
  const n = crypto.getRandomValues(new Uint32Array(1))[0] % 10000;
  return `Viajante-${String(n).padStart(4, "0")}`;
}
