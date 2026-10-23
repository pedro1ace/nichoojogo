// Nicho: regras do jogo diário.
// Cada pergunta pede uma palavra de um tema; o jogador tem 25 segundos.
// Quanto mais nichada a resposta, mais pontos e mais fundo o foguete desce.
// Acertar a "supernova" (a resposta secreta da pergunta) dobra os pontos.
// Vem de outros arquivos: window.NICHO_DADOS (dados.js), Som (som.js),
// criarCena, faixaDe, FAIXAS, AL_POR_PONTO, DURACAO_DESCIDA (cena.js).

const RODADAS_POR_DIA = 7;
const SEGUNDOS = 25;
const LANCAMENTO = "2026-10-23"; // dia #1

// ---------- texto e autocorreção ----------

// Mesma regra de scripts/pontuar.py: minúsculas, sem acento, hífen vira espaço.
function normalizar(texto) {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// Tira artigos do começo ("o Acre", "a Lua") e espaços, para comparar.
function compactar(texto) {
  return normalizar(texto).replace(/^(o|a|os|as|um|uma) /, "").replaceAll(" ", "");
}

// Distância de edição com troca de letras vizinhas: quantas letras faltam,
// sobram, estão erradas ou trocadas de lugar ("eroupa" -> "europa" = 1).
function distancia(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const custo = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + custo);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }
  return d[a.length][b.length];
}

// Palavras curtas precisam vir quase certas; longas aceitam mais erros.
function tolerancia(tamanho) {
  if (tamanho <= 3) return 0;
  if (tamanho <= 5) return 1;
  if (tamanho <= 9) return 2;
  return 3;
}

// Procura a resposta. Devolve { resposta, nome, exato } ou null.
// "nome" é a grafia que casou (pode ser um apelido), para mostrar ao jogador.
function buscar(cat, texto) {
  const alvo = compactar(texto);
  if (!alvo) return null;
  if (cat.mapa.has(alvo)) return { ...cat.mapa.get(alvo), exato: true };
  const limite = tolerancia(alvo.length);
  let melhor = null;
  let menor = Infinity;
  for (const [chave, item] of cat.mapa) {
    if (Math.abs(chave.length - alvo.length) > limite) continue;
    const d = distancia(alvo, chave);
    if (d < menor) {
      menor = d;
      melhor = item;
    }
  }
  return menor <= limite ? { ...melhor, exato: false } : null;
}

// ---------- dia, sorteio e progresso ----------

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

function numeroDoDia(data) {
  return Math.round((new Date(data + "T12:00") - new Date(LANCAMENTO + "T12:00")) / 86400000) + 1;
}

// Progresso do dia fica no navegador, para não perder ao recarregar.
// Se o armazenamento estiver bloqueado, o jogo funciona igual, só não lembra.
function salvarProgresso() {
  try {
    localStorage.setItem(`nicho:${estado.data}`, JSON.stringify({ historico: estado.historico, total: estado.total }));
  } catch {}
}
function lerProgresso() {
  try {
    return JSON.parse(localStorage.getItem(`nicho:${estado.data}`) || "null");
  } catch {
    return null;
  }
}

// ---------- estado e tela ----------

const $ = (id) => document.getElementById(id);
const cena = criarCena($("cena"), $("camada"), $("tela"));
const numero = (n) => Math.round(n).toLocaleString("pt-BR");

const estado = {
  data: hojeLocal(),
  categorias: [],
  rodada: 0,
  total: 0,
  totalMostrado: 0,
  historico: [], // { categoria, resposta, pontos, supernova, percentil }
  relogio: null,
  fimDoTempo: 0,
  ativa: false, // aceitando respostas agora
};

cena.aoQuadro((al) => {
  $("distancia").textContent = `${numero(al)} AL`;
  // os pontos sobem contando, junto com a descida
  if (estado.totalMostrado < estado.total) {
    estado.totalMostrado = Math.min(estado.total, estado.totalMostrado + Math.max(0.4, (estado.total - estado.totalMostrado) * 0.06));
    $("pontos").textContent = numero(estado.totalMostrado);
  }
});

function prepararCategoria(cat) {
  const mapa = new Map();
  for (const r of cat.respostas) {
    for (const nome of [r.resposta, ...r.apelidos]) mapa.set(compactar(nome), { resposta: r, nome });
  }
  return { ...cat, mapa };
}

function iniciar() {
  const dados = window.NICHO_DADOS;
  if (!dados) {
    $("regras").textContent = "Não achei as perguntas (jogo/dados.js). Rode python3 scripts/pontuar.py.";
    $("comecar").hidden = true;
    return;
  }
  const escolhidas = embaralhar(dados.indice, geradorDoDia(estado.data)).slice(0, RODADAS_POR_DIA);
  estado.categorias = escolhidas.map((c) => prepararCategoria(dados.categorias[c.id]));

  // título com as letras soltas, para a onda
  const titulo = $("titulo");
  [..."NICHO"].forEach((letra, i) => {
    const s = document.createElement("span");
    s.textContent = letra;
    s.style.animationDelay = `${i * -0.25}s`;
    s.setAttribute("aria-hidden", "true");
    titulo.append(s);
  });
  $("regras").textContent = `${estado.categorias.length} perguntas · ${SEGUNDOS} segundos cada · quanto mais rara, mais fundo`;
  $("dia").textContent = `DIA #${numeroDoDia(estado.data)}`;
  $("fim-dia").textContent = `DIA #${numeroDoDia(estado.data)}`;
  $("som").classList.toggle("mudo", Som.estaMudo());

  const salvo = lerProgresso();
  if (salvo) {
    estado.historico = salvo.historico;
    estado.total = estado.totalMostrado = salvo.total;
    estado.rodada = salvo.historico.length;
    cena.irPara(estado.total * AL_POR_PONTO);
    $("pontos").textContent = numero(estado.total);
  }
  montarQuadrados();
  if (estado.rodada >= estado.categorias.length) {
    $("inicio").hidden = true;
    $("hud").hidden = false;
    mostrarFim(false);
    return;
  }
  if (estado.rodada > 0) {
    $("comecar").textContent = "▼ CONTINUAR DESCIDA ▼";
    document.querySelector("#inicio [data-zerar]").hidden = false;
  }
}

function montarQuadrados() {
  const caixa = $("quadrados");
  caixa.innerHTML = "";
  estado.categorias.forEach((_, i) => {
    const q = document.createElement("span");
    const h = estado.historico[i];
    if (h) q.style.background = h.resposta ? faixaDe(h.pontos, h.supernova).cor : "#3a3470";
    if (i === estado.rodada && !h) q.className = "atual";
    caixa.append(q);
  });
  const n = Math.min(estado.rodada + 1, estado.categorias.length);
  $("rotulo-rodada").textContent = `PERGUNTA ${n} DE ${estado.categorias.length}`;
}

function comecar() {
  Som.ligar();
  $("inicio").hidden = true;
  $("hud").hidden = false;
  iniciarRodada();
}

// ---------- rodada ----------

function iniciarRodada() {
  const cat = estado.categorias[estado.rodada];
  cena.novaRodada();
  montarQuadrados();
  $("rotulo-pergunta").textContent = `· PERGUNTA ${estado.rodada + 1} DE ${estado.categorias.length}`;
  $("pergunta").textContent = cat.pergunta || cat.titulo;
  $("formulario").hidden = true;
  $("relogio").hidden = true;
  $("sugestao").hidden = true;
  avisar("", "");
  $("palpite").value = "";
  $("cartao-pergunta").hidden = false;

  // contagem antes do relógio, para dar tempo de ler
  let n = 3;
  const contar = () => {
    if (n === 0) {
      $("aviso").hidden = true;
      abrirRelogio();
      return;
    }
    $("aviso").innerHTML = `descendo · o relógio começa em <b>${n}</b>`;
    $("aviso").hidden = false;
    Som.contagem(false);
    n--;
    setTimeout(contar, 1000);
  };
  contar();
}

function abrirRelogio() {
  Som.contagem(true);
  estado.ativa = true;
  estado.fimDoTempo = performance.now() + SEGUNDOS * 1000;
  $("formulario").hidden = false;
  $("relogio").hidden = false;
  $("palpite").focus();
  let ultimoSegundo = SEGUNDOS + 1;
  const atualizar = () => {
    const resta = Math.max(0, estado.fimDoTempo - performance.now()) / 1000;
    $("barra-tempo").style.width = `${(resta / SEGUNDOS) * 100}%`;
    const s = Math.ceil(resta);
    $("tempo").textContent = `${s}s`;
    $("relogio").classList.toggle("urgente", s <= 5);
    if (s < ultimoSegundo) {
      ultimoSegundo = s;
      if (s <= 5 && s > 0) Som.tique(true);
    }
    if (resta <= 0) {
      tempoEsgotado();
      return;
    }
    estado.relogio = requestAnimationFrame(atualizar);
  };
  atualizar();
}

function pararRelogio() {
  estado.ativa = false;
  cancelAnimationFrame(estado.relogio);
}

function avisar(texto, classe) {
  $("mensagem").textContent = texto;
  $("mensagem").className = classe;
}

// Enquanto digita: se parece um erro de digitação, oferece a correção.
let esperaSugestao = 0;
function aoDigitar() {
  Som.tecla();
  $("palpite").classList.remove("tremendo");
  clearTimeout(esperaSugestao);
  esperaSugestao = setTimeout(() => {
    const texto = $("palpite").value.trim();
    const busca = texto.length >= 3 ? buscar(estado.categorias[estado.rodada], texto) : null;
    if (busca && !busca.exato) mostrarSugestao(busca.nome);
    else $("sugestao").hidden = true;
  }, 250);
}

function mostrarSugestao(nome) {
  $("sugestao").textContent = `você quis dizer “${nome}”? (Tab para usar)`;
  $("sugestao").dataset.nome = nome;
  $("sugestao").hidden = false;
}

// Preenche o campo com a correção, mas não envia: o jogador confirma.
function usarSugestao() {
  const nome = $("sugestao").dataset.nome;
  if (!nome) return;
  clearTimeout(esperaSugestao);
  $("palpite").value = nome;
  $("sugestao").hidden = true;
  avisar(`Corrigido para “${nome}”. Aperte LANÇAR para confirmar.`, "aviso");
  Som.sugestao();
  $("palpite").focus();
}

function palpitar(evento) {
  evento.preventDefault();
  if (!estado.ativa) return;
  const cat = estado.categorias[estado.rodada];
  const texto = $("palpite").value.trim();
  if (!texto) return;
  const busca = buscar(cat, texto);

  if (!busca) {
    avisar(`“${texto}” não está no mapa estelar. Tente outra.`, "erro");
    $("palpite").classList.remove("tremendo");
    void $("palpite").offsetWidth; // reinicia a animação
    $("palpite").classList.add("tremendo");
    $("palpite").select();
    Som.erro();
    return;
  }
  if (!busca.exato) {
    // escrito quase certo: corrige no campo e espera a confirmação
    $("sugestao").dataset.nome = busca.nome;
    usarSugestao();
    avisar(`Você digitou “${texto}”. Corrigido para “${busca.nome}”: aperte LANÇAR para confirmar.`, "aviso");
    return;
  }

  pararRelogio();
  const achada = busca.resposta;
  const supernova = achada.resposta === cat.supernova;
  const pontos = supernova ? achada.pontos * 2 : achada.pontos;
  const percentil = cat.respostas.filter((r) => r.pontos < achada.pontos).length / cat.respostas.length;
  $("cartao-pergunta").hidden = true;
  cena.descer(achada.resposta, pontos, supernova);
  Som.descer(Math.min(1, pontos / 100));
  registrar(cat, achada.resposta, pontos, supernova, percentil);
  setTimeout(() => mostrarResultado(cat, achada.resposta, pontos, supernova), DURACAO_DESCIDA + 200);
}

function tempoEsgotado() {
  pararRelogio();
  const cat = estado.categorias[estado.rodada];
  $("cartao-pergunta").hidden = true;
  Som.erro();
  registrar(cat, null, 0, false, 0);
  mostrarResultado(cat, null, 0, false);
}

function registrar(cat, resposta, pontos, supernova, percentil) {
  estado.total += pontos;
  estado.historico.push({ categoria: cat.titulo, resposta, pontos, supernova, percentil });
  salvarProgresso();
}

function mostrarResultado(cat, resposta, pontos, supernova) {
  const faixa = resposta
    ? faixaDe(pontos, supernova)
    : { id: "nada", nome: "TEMPO ESGOTADO", cor: "#9aa3c7", frase: "O relógio zerou. Esta fica sem pontos." };
  const card = $("resultado");
  card.style.setProperty("--cor-faixa", faixa.cor);
  $("icone").src = cena.icones[faixa.id];
  $("nome-faixa").textContent = faixa.nome;
  $("palavra").textContent = resposta ? `“${resposta}”` : "";
  $("linha-pontos").innerHTML = resposta
    ? `<b>+${pontos} PONTOS</b> · desceu ${numero(pontos * AL_POR_PONTO)} AL`
    : "+0 PONTOS";
  $("frase").textContent = faixa.frase;

  const top = [...cat.respostas].sort((a, b) => b.pontos - a.pontos).slice(0, 4);
  if (!top.some((r) => r.resposta === cat.supernova)) top.push(cat.respostas.find((r) => r.resposta === cat.supernova));
  $("mais-nichadas").innerHTML = "";
  for (const r of top) {
    const li = document.createElement("li");
    li.textContent = r.resposta + " ";
    const extra = document.createElement("span");
    extra.textContent = r.resposta === cat.supernova ? `${r.pontos} ★` : `${r.pontos}`;
    li.append(extra);
    $("mais-nichadas").append(li);
  }
  const ultima = estado.rodada + 1 >= estado.categorias.length;
  $("proxima").textContent = ultima ? "VER RESULTADO ▼" : "DESCER ▼";
  card.hidden = false;
  if (supernova) Som.supernova();
  else if (resposta) Som.faixa(FAIXAS.length - 1 - FAIXAS.indexOf(faixa));
  Som.profundidade(estado.total * AL_POR_PONTO);
  montarQuadrados();
  $("proxima").focus();
}

function proxima() {
  $("resultado").hidden = true;
  estado.rodada += 1;
  if (estado.rodada < estado.categorias.length) {
    iniciarRodada();
    return;
  }
  mostrarFim(true);
}

// ---------- fim ----------

function mostrarFim(comSom) {
  if (comSom) Som.fim();
  cena.limpar();
  $("cartao-pergunta").hidden = true;
  $("fim").hidden = false;
  montarQuadrados();
  $("rotulo-rodada").textContent = "VIAGEM COMPLETA";
  $("fim-pontos").textContent = numero(estado.total);
  $("fim-profundidade").textContent = `↓ ${numero(estado.total * AL_POR_PONTO)} AL de profundidade`;
  const media = estado.historico.reduce((s, h) => s + (h.percentil || 0), 0) / Math.max(1, estado.historico.length);
  $("fim-comparacao").textContent = `Suas respostas foram mais nichadas que ${Math.round(media * 100)}% das respostas possíveis.`;
  montarGrafico();

  const icones = estado.historico.map((h) => (h.resposta ? faixaDe(h.pontos, h.supernova).emoji : "⚫"));
  $("compartilhar").textContent =
    `NICHO · DIA #${numeroDoDia(estado.data)}\n${icones.join(" ")}\n${numero(estado.total)} pontos · ↓ ${numero(estado.total * AL_POR_PONTO)} AL 🚀`;
  $("enviar").hidden = !navigator.share;
  contarAteAmanha();
}

function montarGrafico() {
  const g = $("grafico");
  g.innerHTML = "";
  const maximo = Math.max(100, ...estado.historico.map((h) => h.pontos));
  const altura = 200;
  [0, 0.25, 0.5, 0.75, 1].forEach((f) => {
    const e = document.createElement("div");
    e.className = "eixo";
    e.style.top = `${f * altura}px`;
    e.textContent = Math.round(f * maximo);
    g.append(e);
  });
  estado.historico.forEach((h, i) => {
    const faixa = h.resposta ? faixaDe(h.pontos, h.supernova) : { id: "nada", cor: "#5a5490" };
    const col = document.createElement("div");
    col.className = "coluna";
    col.tabIndex = 0;
    col.style.color = faixa.cor;
    const fio = document.createElement("div");
    fio.className = "fio";
    fio.style.height = `${Math.max(2, (h.pontos / maximo) * altura)}px`;
    const img = document.createElement("img");
    img.src = cena.icones[faixa.id];
    img.alt = "";
    const num = document.createElement("span");
    num.className = "numero";
    num.textContent = i + 1;
    const dica = document.createElement("span");
    dica.className = "dica-coluna";
    dica.textContent = h.resposta ? `${h.categoria}: ${h.resposta} (+${h.pontos})` : `${h.categoria}: sem resposta`;
    col.append(fio, img, num, dica);
    g.append(col);
  });
}

function contarAteAmanha() {
  const atualizar = () => {
    const agora = new Date();
    const amanha = new Date(agora);
    amanha.setHours(24, 0, 0, 0);
    const s = Math.floor((amanha - agora) / 1000);
    const p = (n) => String(n).padStart(2, "0");
    $("amanha").textContent = `Novas perguntas em ${p(Math.floor(s / 3600))}:${p(Math.floor(s / 60) % 60)}:${p(s % 60)}`;
  };
  atualizar();
  setInterval(atualizar, 1000);
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

function enviar() {
  navigator.share?.({ text: $("compartilhar").textContent }).catch(() => {});
}

// ---------- eventos ----------

$("comecar").addEventListener("click", comecar);
$("formulario").addEventListener("submit", palpitar);
$("palpite").addEventListener("input", aoDigitar);
$("palpite").addEventListener("keydown", (e) => {
  if (e.key === "Tab" && !$("sugestao").hidden) {
    e.preventDefault();
    usarSugestao();
  }
});
$("sugestao").addEventListener("click", usarSugestao);
$("proxima").addEventListener("click", proxima);
$("copiar").addEventListener("click", copiar);
$("enviar").addEventListener("click", enviar);
$("som").addEventListener("click", () => {
  Som.ligar();
  $("som").classList.toggle("mudo", Som.alternar());
});
// Modo teste: apaga o progresso de hoje e recomeça, sem esperar o dia seguinte.
// (Tirar antes do lançamento, ou deixar só para quem desenvolve.)
function zerarDia() {
  try {
    localStorage.removeItem(`nicho:${estado.data}`);
  } catch {}
  location.reload();
}
document.querySelectorAll("[data-zerar]").forEach((b) => b.addEventListener("click", zerarDia));

iniciar();
