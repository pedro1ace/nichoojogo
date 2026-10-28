// Manda quem entra por um endereço velho para o endereço oficial, nichoojogo.com.
//
//   nichoojogo.pages.dev/qualquer-coisa  ->  https://nichoojogo.com/qualquer-coisa
//   www.nichoojogo.com/qualquer-coisa     ->  https://nichoojogo.com/qualquer-coisa
//
// As prévias do Pages (algo.nichoojogo.pages.dev) continuam abrindo normalmente.
// Só roda nas páginas e na API (veja _routes.json), não em cada imagem ou fonte.

const OFICIAL = "nichoojogo.com";
const VELHOS = new Set(["nichoojogo.pages.dev", "www.nichoojogo.com"]);

export async function onRequest({ request, next }) {
  const url = new URL(request.url);
  // POST da pontuação segue no endereço onde a página abriu, para não perder a viagem
  if (VELHOS.has(url.hostname) && (request.method === "GET" || request.method === "HEAD")) {
    url.hostname = OFICIAL;
    url.protocol = "https:";
    url.port = "";
    return Response.redirect(url.toString(), 301);
  }
  return next();
}
