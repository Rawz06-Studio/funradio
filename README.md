# 🎙️ FunRadio Anthology Proxy

A self-hosted proxy that scrapes FunRadio Anthology, filters out ads, and exposes a permanent, stable URL for HLS streaming.

## ✨ Features

| Feature | Description |
|---|---|
| **Stable URL** | One permanent URL for playback — no need to re-fetch the m3u8 manually |
| **Automatic renewal** | Refreshes the stream URL every 23h, ahead of expiration |
| **Ad removal** | Tests multiple stream variants to find the ad-free one |
| **Live scraping** | Extracts the stream URL directly from funradio.fr |
| **Health check** | Dedicated endpoint to monitor proxy status |

## 📋 Requirements

- **Docker** + Docker Compose *(recommended)*
- Or **Node.js 18+** for running locally (uses `pnpm`)

## 🚀 Getting Started

### Option 1 — Docker (local)

```bash
docker build -t funradio-proxy .
docker run -p 8080:8080 funradio-proxy

# Verify
curl http://localhost:8080/health
```

### Option 2 — Docker Compose (self-hosted server)

```bash
git clone <repo-url>
cd funradio-proxy
docker compose up -d
```

The stable URL to use everywhere is then:

```
http://<SERVER_IP>:8080/stream.m3u8
```

### Option 3 — Dokploy (recommended for production)

Deployments are automated via GitHub Actions on every push to `main`:

1. **Create an application** in Dokploy for this repository.
2. **Add the GitHub secret** `DOKPLOY_WEBHOOK` containing the deployment webhook URL.
3. Push to `main` — the workflow handles the rest.

### Option 4 — Node.js (no Docker)

```bash
pnpm install
pnpm start
```

## 📡 Usage

### Main endpoint

```
GET http://localhost:8080/stream.m3u8
```

Works with any HLS-capable player:

- **VLC** — `Media > Open Network Stream`
- **Kodi / Plex** — add the URL as a network stream
- **Mobile** — replace `localhost` with your server's IP (`http://192.168.x.x:8080/stream.m3u8`)

### Auxiliary endpoints

| Endpoint | Purpose |
|---|---|
| `GET /health` | Status check — returns stream availability and last refresh timestamp |
| `GET /refresh` | Force a manual re-scrape (useful if the stream expires early) |

Example `/health` response:

```json
{
  "status": "ok",
  "streamAvailable": true,
  "lastRefresh": "2026-09-02T10:30:45.123Z"
}
```

## 🔧 Configuration

Environment variables (also configurable in `docker-compose.yml`):

| Variable | Default | Description |
|---|---|---|
| `PORT` | `8080` | Server listen port |
| `NODE_ENV` | `production` | Runtime mode |

## 🏗️ Architecture

```
funradio.fr ──► Scraper ──► Cleaner ──► Cache (24h) ──► Server
                  │            │                          │
           extracts       tests 3 variants         exposes /stream.m3u8
             m3u8        to strip ads               (redirects to stream)
```

1. **Scraper** — extracts the m3u8 URL from funradio.fr
2. **Cleaner** — tries 3 variants to find the ad-free stream
3. **Cache** — holds the URL for 24 hours
4. **Server** — serves `/stream.m3u8`, redirecting to the live URL
5. **Auto-refresh** — renews the stream every 23 hours

## 📊 Observability

Tail the logs in real time:

```bash
docker compose logs -f funradio-proxy
```

Key log lines:

| Log | Meaning |
|---|---|
| `✅ URL trouvée` | Scraping succeeded |
| `✅ URL valide trouvée!` | Ad-free variant found |
| `🧪 Test:` | Testing a stream variant |

## 🐛 Troubleshooting

**"Impossible de récupérer le stream"**
- Check your internet connection and that `funradio.fr` is reachable.
- Force a refresh: `curl http://localhost:8080/refresh`

**"Aucune variante ne fonctionne"**
- Scraping likely failed — inspect the logs (`docker compose logs`).
- The HTML structure of funradio.fr may have changed; verify the scraper still matches it.

**Docker won't start**
```bash
docker compose build --no-cache
docker compose up -d
```

## ⚖️ License

MIT — do whatever you want, at your own risk.

> ⚠️ **Disclaimer:** This proxy is intended for personal use only. Do not publicly share the stream URL.
