const express = require('express');
const cheerio = require('cheerio');
const NodeCache = require('node-cache');
const { URL } = require('url');

const app = express();
const cache = new NodeCache({ stdTTL: 86400 }); // 24h cache
const PORT = process.env.PORT || 8080;

let currentStreamUrl = null;
let currentManifestUrl = null;
let lastRefreshTime = 0;

// Log avec timestamp
const log = (msg) => console.log(`[${new Date().toISOString()}] ${msg}`);

// Scrape l'ID de Fun Radio Anthology depuis la homepage
async function getFunRadioId() {
  try {
    const cached = cache.get('radioId');
    if (cached) {
      log(`📦 ID en cache: ${cached}`);
      return cached;
    }

    log('🔍 Scraping homepage pour trouver l\'ID...');
    const response = await fetch('https://www.funradio.fr/', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      signal: AbortSignal.timeout(10000)
    });

    const html = await response.text();
    const $ = cheerio.load(html);
    const button = $('[data-at-click="fun_radio_anthology"]');
    const radioId = button.attr('data-radio-id');

    if (radioId) {
      log(`✅ ID trouvé: ${radioId}`);
      cache.set('radioId', radioId, 86400 * 7); // Cache 7 jours
      return radioId;
    } else {
      log('❌ ID non trouvé dans la homepage');
      return null;
    }
  } catch (error) {
    log(`❌ Erreur scraping homepage: ${error.message}`);
    return null;
  }
}

// API pour récupérer l'URL de funradio.fr
async function getFunRadioUrl() {
  try {
    const radioId = await getFunRadioId();
    if (!radioId) {
      log('⚠️  Impossible de récupérer l\'ID radio');
      return null;
    }

    log('🔍 Appel API funradio...');
    const response = await fetch(`https://www.funradio.fr/ws/live/${radioId}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      signal: AbortSignal.timeout(10000)
    });

    const data = await response.json();

    // Extrait les URLs disponibles
    const urls = [];

    // URL principale (avec pubs)
    if (data.audio?.path) {
      urls.push({
        url: data.audio.path,
        source: 'audio.path',
        hasPotentialAds: true
      });
    }

    // URL alternative (potentiellement sans pubs)
    if (data.estat?.streaming?.newLevels?.newLevel_3) {
      urls.push({
        url: data.estat.streaming.newLevels.newLevel_3,
        source: 'newLevel_3',
        hasPotentialAds: false
      });
    }

    if (urls.length > 0) {
      log(`✅ ${urls.length} URL(s) trouvée(s)`);
      return urls;
    } else {
      log('❌ Aucune URL trouvée dans la réponse API');
      return null;
    }
  } catch (error) {
    log(`❌ Erreur API: ${error.message}`);
    return null;
  }
}

// Teste si une URL de stream fonctionne
async function testStreamUrl(url) {
  try {
    const response = await fetch(url, {
      method: 'HEAD',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      signal: AbortSignal.timeout(5000),
      redirect: 'follow'
    });
    return response.ok;
  } catch (error) {
    // HEAD peut ne pas fonctionner, essaie GET sur les premiers octets
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Range': 'bytes=0-100'
        },
        signal: AbortSignal.timeout(5000),
        redirect: 'follow'
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}

// Actualise l'URL du stream
async function refreshStreamUrl() {
  const now = Date.now();

  // Évite les refreshes trop rapprochés (< 1h)
  if (lastRefreshTime && now - lastRefreshTime < 3600000) {
    log('⏭️  Refresh trop rapide, skip');
    return;
  }

  lastRefreshTime = now;

  const urls = await getFunRadioUrl();
  if (!urls || urls.length === 0) {
    log('⚠️  Fallback: utilise l\'URL en cache si disponible');
    return;
  }

  // Teste les URLs dans l'ordre de préférence (sans pubs d'abord)
  const sortedUrls = urls.sort((a, b) => a.hasPotentialAds - b.hasPotentialAds);

  for (const item of sortedUrls) {
    const { url, source } = item;
    log(`🧪 Test (${source}): ${url.substring(0, 80)}...`);

    if (await testStreamUrl(url)) {
      log(`✅ URL ${source} valide!`);
      currentStreamUrl = url;
      currentManifestUrl = url;
      cache.set('streamUrl', url);
      cache.set('manifestUrl', url);
      return;
    }
  }

  // Si aucune n'a fonctionné en HEAD/GET, essaie quand même la première
  log('⚠️  Aucune variante ne répond au test, utilise la première URL');
  const fallbackUrl = sortedUrls[0]?.url;
  if (fallbackUrl) {
    currentStreamUrl = fallbackUrl;
    currentManifestUrl = fallbackUrl;
    cache.set('streamUrl', fallbackUrl);
    cache.set('manifestUrl', fallbackUrl);
  }
}

// Endpoint principal - M3U8 stable qui pointe vers le proxy
app.get('/stream.m3u8', async (req, res) => {
  try {
    if (!currentStreamUrl) {
      await refreshStreamUrl();
    }

    if (!currentStreamUrl) {
      return res.status(503).send('❌ Impossible de récupérer le stream');
    }

    // Génère un m3u8 stable qui pointe vers /live.m3u8 du proxy
    const host = req.get('host');
    const m3u8Content = `#EXTM3U
#EXT-X-VERSION:7
#EXTINF:-1, FunRadio Anthology
http://${host}/live.m3u8
`;

    res.set('Content-Type', 'application/vnd.apple.mpegurl');
    res.set('Cache-Control', 'no-cache');
    res.send(m3u8Content);
  } catch (error) {
    log(`❌ Erreur /stream.m3u8: ${error.message}`);
    res.status(500).send('Erreur serveur');
  }
});

// Endpoint pour le manifest HLS réel
app.get('/live.m3u8', async (req, res) => {
  try {
    if (!currentManifestUrl) {
      await refreshStreamUrl();
    }

    if (!currentManifestUrl) {
      return res.status(503).send('❌ Impossible de récupérer le manifest');
    }

    log(`📡 Retourne manifest depuis: ${currentManifestUrl.substring(0, 60)}...`);

    const response = await fetch(currentManifestUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      signal: AbortSignal.timeout(5000)
    });

    if (!response.ok) {
      return res.status(response.status).send('❌ Erreur récupération manifest');
    }

    let manifestContent = await response.text();

    // Convertit les URLs relatives en absolues
    const manifestUrl = new URL(currentManifestUrl);
    const manifestBaseUrl = manifestUrl.href.substring(0, manifestUrl.href.lastIndexOf('/') + 1);

    manifestContent = manifestContent
      .split('\n')
      .map(line => {
        // Si la ligne est une URL relative (pas de http/https et pas vide/commentaire)
        if (line && !line.startsWith('#') && !line.startsWith('http')) {
          return manifestBaseUrl + line;
        }
        return line;
      })
      .join('\n');

    res.set('Content-Type', 'application/vnd.apple.mpegurl');
    res.set('Cache-Control', 'no-cache');
    res.send(manifestContent);
  } catch (error) {
    log(`❌ Erreur /live.m3u8: ${error.message}`);
    res.status(500).send('Erreur serveur');
  }
});

// Endpoint pour forcer un refresh
app.get('/refresh', async (req, res) => {
  await refreshStreamUrl();
  res.json({
    status: 'refresh demandé',
    currentUrl: currentStreamUrl?.substring(0, 100) + '...'
  });
});

// Endpoint de santé
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    streamAvailable: !!currentStreamUrl,
    lastRefresh: new Date(lastRefreshTime).toISOString()
  });
});

// Refresh initial et périodique
(async () => {
  log('🚀 Démarrage du proxy FunRadio');
  await refreshStreamUrl();

  // Refresh toutes les 23h (juste avant l'expiration de 24h)
  setInterval(refreshStreamUrl, 23 * 3600000);
})();

app.listen(PORT, () => {
  log(`🎙️  Proxy lancé sur http://localhost:${PORT}`);
  log(`📡 Stream disponible à: http://localhost:${PORT}/stream.m3u8`);
});
