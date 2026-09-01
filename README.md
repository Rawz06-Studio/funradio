# 🎙️ FunRadio Anthology Proxy

Un proxy qui scrape FunRadio Anthology, supprime les pubs et fournit une URL stable/permanente pour écouter en streaming.

## 🎯 Fonctionnalités

- ✅ **URL stable** - Même URL pour écouter en permanence (pas besoin de retélécharger le m3u8)
- ✅ **Renouvellement automatique** - Récupère une nouvelle URL toutes les 23h avant expiration
- ✅ **Suppression des pubs** - Teste différentes variantes pour trouver le flux sans publicités
- ✅ **Scraping automatique** - Extrait l'URL de funradio.fr
- ✅ **Health check** - Endpoint pour vérifier l'état du proxy

## 📋 Prérequis

- Docker & Docker Compose (recommandé)
- Ou Node.js 18+ en local

## 🚀 Démarrage

### Avec Docker (en local)

```bash
docker build -t funradio-proxy .
docker run -p 8080:8080 funradio-proxy
```

Vérifier que ça fonctionne:
```bash
curl http://localhost:8080/health
```

### Avec Dokploy (recommandé - production)

1. **Push sur GitHub** - Le workflow GitHub Actions se charge du reste
   ```bash
   git push origin main
   ```

2. **Configurer Dokploy:**
   - Crée une app sur Dokploy
   - Définir les secrets GitHub:
     - `DOKPLOY_WEBHOOK`: URL webhook de déploiement

3. **Les déploiements sont automatiques** après chaque push sur `main`

### Sans Docker (en local)

```bash
pnpm install
pnpm start
```

## 📡 Utilisation

### Endpoint principal

```
GET http://localhost:8080/stream.m3u8
```

Utilise cette URL dans:
- VLC: `Media > Open Network Stream > http://localhost:8080/stream.m3u8`
- Kodi, Plex, ou n'importe quel lecteur HLS
- Ton téléphone (via l'IP du serveur): `http://192.168.x.x:8080/stream.m3u8`

### Endpoints utiles

- **Health check**: `http://localhost:8080/health`
  ```json
  {
    "status": "ok",
    "streamAvailable": true,
    "lastRefresh": "2026-09-02T10:30:45.123Z"
  }
  ```

- **Forcer un refresh**: `http://localhost:8080/refresh`
  - Utile si le stream expire plus tôt que prévu

## 🔧 Configuration

Variables d'environnement:

```bash
PORT=8080              # Port du serveur (défaut: 8080)
NODE_ENV=production    # Mode production (défaut: production)
```

Modifier dans `docker-compose.yml` si besoin d'un port différent.

## 🧪 Tester localement

```bash
# Test du scraping
curl http://localhost:8080/health

# Récupérer le m3u8
curl http://localhost:8080/stream.m3u8

# Forcer refresh
curl http://localhost:8080/refresh
```

## 📝 Logs

Pour voir les logs en direct:

```bash
docker-compose logs -f funradio-proxy
```

Logs importants:
- `✅ URL trouvée` - Scraping réussi
- `✅ URL valide trouvée!` - Variante sans pub trouvée
- `🧪 Test:` - Test des variantes

## 🎚️ Architecture

1. **Scraper** - Extrait l'URL m3u8 de funradio.fr
2. **Cleaner** - Teste 3 variantes pour enlever les pubs
3. **Cache** - Garde l'URL en cache 24h
4. **Server** - Expose `/stream.m3u8` qui redirige vers l'URL
5. **Auto-refresh** - Actualise toutes les 23h

## 🐛 Troubleshooting

### "Impossible de récupérer le stream"
- Vérifie la connexion internet
- Vérifie que funradio.fr est accessible
- Force un refresh: `curl http://localhost:8080/refresh`

### "Aucune variante ne fonctionne"
- Le scraping a peut-être échoué
- Consulte les logs: `docker-compose logs`
- Vérifiez que le HTML de funradio.fr n'a pas changé

### Docker refuse de démarrer
```bash
# Rebuild l'image
docker-compose build --no-cache
docker-compose up -d
```

## 📦 Déploiement sur serveur

```bash
# Sur ton serveur
git clone <repo>
cd funradio-proxy
docker-compose up -d

# Vérifier
curl http://localhost:8080/health
```

L'URL stable à utiliser partout:
```
http://[IP_DU_SERVEUR]:8080/stream.m3u8
```

## 📄 Licence

MIT - Fais ce que tu veux avec, mais at your own risk ;)

---

**Note**: Ce proxy respecte l'utilisation personnelle. Ne partage pas l'URL publiquement (c'est pour ton usage perso).
