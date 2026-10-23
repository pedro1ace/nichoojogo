// Nicho: protótipo do jogo diário.
// Cada rodada mostra uma pergunta-tema; o jogador dá UMA resposta válida.
// Quanto mais nichada a resposta, mais anos-luz ela vale.
// Acertar a "supernova" (a resposta secreta da pergunta) dobra os pontos.
// criarCena e faixa vêm de cena.js; as perguntas vêm de dados.js (window.NICHO_DADOS).

const RODADAS_POR_DIA = 7;
const TENTATIVAS = 3;
const ICONES = { satelite: "🛰️", lua: "🌙", planeta: "🪐", supernova: "🌟", nada: "⚫" };

// Mesma regra de scripts/pontuar.py: minúsculas, sem acento, hífen vira espaço.
function normalizar(texto) {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// Sorteio determinístico pela data: todo mundo recebe as mesmas perguntas no dia.
function geradorDoDia(data) {
  let semente = Number(data.replaceAll("-", ""));
  return () => {
    semente = (semente * 1103515245 + 12345) % 2147483648;
    return semente / 2147483648;
  };
}

function embaralhar(lista, sortear) {
  const copia = [...lista];
  for (let i = copia.length - 1; i > 0; i--) {
    const j = Math.floor(sortear() * (i + 1));
    [copia[i], copia[j]] = [copia[j], copia[i]];
  }
  return copia;
}

function hojeLocal() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// Progresso do dia fica no navegador, para não perder ao recarregar.
// Se o armazenamento estiver bloqueado, o jogo funciona igual, só não lembra.
const CHAVE = () => `nicho:${estado.data}`;
function salvarProgresso() {
  try {
    localStorage.setItem(CHAVE(), JSON.stringify({ historico: estado.historico, total: estado.total }));
  } catch {}
}
function lerProgresso() {
  try {
    return JSON.parse(localStorage.getItem(CHAVE()) || "null");
  } catch {
    return null;
  }
}

const $ = (id) => document.getElementById(id);
const cena = criarCena($("cena"));

const estado = {
  data: hojeLocal(),
  categorias: [],
  rodada: 0,
  tentativas: TENTATIVAS,
  total: 0,
  historico: [], // { categoria, resposta, pontos, supernova }
};

function iniciar() {
  const dados = window.NICHO_DADOS;
  if (!dados) {
    $("carregando").textContent = "Não achei as perguntas (jogo/dados.js). Rode python3 scripts/pontuar.py.";
    return;
  }
  const escolhidas = embaralhar(dados.indice, geradorDoDia(estado.data)).slice(0, RODADAS_POR_DIA);
  estado.categorias = escolhidas.map((c) => prepararCategoria(dados.categorias[c.id]));
  $("carregando").hidden = true;

  const salvo = lerProgresso();
  if (salvo) {
    estado.historico = salvo.historico;
    estado.total = salvo.total;
    estado.rodada = salvo.historico.length;
  }
  if (estado.rodada >= estado.categorias.length) {
    mostrarFim();
    return;
  }
  $("painel").hidden = false;
  mostrarRodada();
}

function prepararCategoria(cat) {
  const mapa = new Map();
  for (const r of cat.respostas) {
    for (const nome of [r.resposta, ...r.apelidos]) mapa.set(normalizar(nome), r);
  }
  return { ...cat, mapa };
}

function mostrarRodada() {
  const cat = estado.categorias[estado.rodada];
  estado.tentativas = TENTATIVAS;
  $("rodada").textContent = `pergunta ${estado.rodada + 1}/${estado.categorias.length}`;
  $("pergunta").textContent = cat.pergunta || cat.titulo;
  avisar("", "");
  $("revelacao").hidden = true;
  $("palpite").value = "";
  $("palpite").disabled = false;
  $("formulario").querySelector("button").disabled = false;
  atualizarPainel();
  $("palpite").focus();
}

function atualizarPainel() {
  $("combustivel").textContent =
    "combustível " + "■".repeat(estado.tentativas) + "□".repeat(TENTATIVAS - estado.tentativas);
  $("distancia").textContent = `${estado.total} anos-luz`;
}

function palpitar(evento) {
  evento.preventDefault();
  const cat = estado.categorias[estado.rodada];
  const texto = $("palpite").value.trim();
  if (!texto) return;
  const achada = cat.mapa.get(normalizar(texto));

  if (!achada) {
    estado.tentativas -= 1;
    atualizarPainel();
    $("palpite").value = "";
    if (estado.tentativas > 0) {
      avisar(`"${texto}" não está no mapa estelar. Tente de novo.`, "erro");
      return;
    }
    avisar("Acabou o combustível nesta pergunta. 0 anos-luz.", "erro");
    encerrarRodada(null, 0, false);
    return;
  }

  const supernova = achada.resposta === cat.supernova;
  const pontos = supernova ? achada.pontos * 2 : achada.pontos;
  if (supernova) {
    avisar(`SUPERNOVA! ${achada.resposta} vale ${pontos} anos-luz.`, "supernova");
  } else {
    avisar(`${achada.resposta}: +${pontos} anos-luz.`, "acerto");
  }
  cena.comemorar(pontos, supernova);
  encerrarRodada(achada.resposta, pontos, supernova);
}

function encerrarRodada(resposta, pontos, supernova) {
  const cat = estado.categorias[estado.rodada];
  estado.total += pontos;
  estado.historico.push({ categoria: cat.titulo, resposta, pontos, supernova });
  salvarProgresso();
  atualizarPainel();
  $("palpite").disabled = true;
  $("formulario").querySelector("button").disabled = true;

  const top = [...cat.respostas].sort((a, b) => b.pontos - a.pontos).slice(0, 5);
  if (!top.some((r) => r.resposta === cat.supernova)) {
    top.push(cat.respostas.find((r) => r.resposta === cat.supernova));
  }
  $("top").innerHTML = "";
  for (const r of top) {
    const li = document.createElement("li");
    li.textContent = r.resposta + " ";
    const extra = document.createElement("span");
    extra.textContent = `${r.pontos} anos-luz${r.resposta === cat.supernova ? " · supernova" : ""}`;
    li.append(extra);
    $("top").append(li);
  }
  $("proxima").textContent = estado.rodada + 1 < estado.categorias.length ? "PRÓXIMA ▶" : "VER RESULTADO";
  $("revelacao").hidden = false;
  $("proxima").focus();
}

function avisar(texto, classe) {
  $("mensagem").textContent = texto;
  $("mensagem").className = classe;
}

function proxima() {
  estado.rodada += 1;
  if (estado.rodada < estado.categorias.length) {
    mostrarRodada();
    return;
  }
  mostrarFim();
}

function mostrarFim() {
  $("painel").hidden = true;
  $("fim").hidden = false;
  $("resumo").textContent = `Você viajou ${estado.total} anos-luz hoje.`;
  const icones = estado.historico.map((h) => (h.resposta === null ? ICONES.nada : ICONES[faixa(h.pontos, h.supernova)]));
  $("compartilhar").textContent = `NICHO ${estado.data}\n${icones.join("")}\n${estado.total} anos-luz 🚀`;
}

function copiar() {
  const texto = $("compartilhar").textContent;
  const selecionar = () => {
    // sem acesso à área de transferência: seleciona o texto para copiar à mão
    const faixaTexto = document.createRange();
    faixaTexto.selectNodeContents($("compartilhar"));
    getSelection().removeAllRanges();
    getSelection().addRange(faixaTexto);
    $("copiar").textContent = "SELECIONADO, É SÓ COPIAR";
  };
  try {
    navigator.clipboard.writeText(texto).then(() => ($("copiar").textContent = "COPIADO!"), selecionar);
  } catch {
    selecionar();
  }
}

$("formulario").addEventListener("submit", palpitar);
$("proxima").addEventListener("click", proxima);
$("copiar").addEventListener("click", copiar);
iniciar();
