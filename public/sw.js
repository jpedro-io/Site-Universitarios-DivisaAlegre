/*
 * ARQUIVO: public/sw.js  -  Service Worker para cache de arquivos estáticos
 * Site da Comissão de Transporte dos Universitários de Divisa Alegre - MG
 * ---------------------------------------------------------------------------
 * Serve arquivos do cache quando possível, cai na rede se não tiver.
 */

const NOME_CACHE = "site-universitarios-v1";
const ARQUIVOS_CACHE = [
  "/",
  "/index.html",
  "/css/style.css",
  "/js/main.js",
  "/img/logo-contorno.png",
  "/img/favicon.png",
];

// Instalação: precache dos arquivos essenciais
self.addEventListener("install", (evento) => {
  evento.waitUntil(
    caches.open(NOME_CACHE).then((cache) => cache.addAll(ARQUIVOS_CACHE))
  );
  self.skipWaiting();
});

// Ativação: limpa caches antigos
self.addEventListener("activate", (evento) => {
  evento.waitUntil(
    caches.keys().then((chaves) =>
      Promise.all(
        chaves
          .filter((chave) => chave !== NOME_CACHE)
          .map((chave) => caches.delete(chave))
      )
    )
  );
  self.clients.claim();
});

// Fetch: serve do cache, cai na rede se não tiver
self.addEventListener("fetch", (evento) => {
  const { request } = evento;
  // Só cacheia GET
  if (request.method !== "GET") return;

  evento.respondWith(
    caches.match(request).then((respostaCache) => {
      if (respostaCache) return respostaCache;
      return fetch(request).then((respostaRede) => {
        // Não cacheia respostas de API ou opacas
        if (!respostaRede.ok || respostaRede.type === "opaque") return respostaRede;
        const respostaClonada = respostaRede.clone();
        caches.open(NOME_CACHE).then((cache) => cache.put(request, respostaClonada));
        return respostaRede;
      });
    })
  );
});
