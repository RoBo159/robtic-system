# Deployment: Cloudflare → Nginx → Docker

The production topology. Nginx runs **on the host** and is the only public entry point; containers
publish to host loopback and are never reachable from the LAN or the internet directly.

```
Internet
   │
Cloudflare (proxied, orange cloud)
   │
   ▼
Host 192.168.1.127  ── Nginx (host, ports 80/443)
                          ├── robtic.org                → web app
                          ├── minecraft.api.robtic.org  → 127.0.0.1:3002
                          └── …
                                      │
                                      ▼
                        Docker containers, published to 127.0.0.1 only
                          robtic-platform-api → 127.0.0.1:3002
                          robtic-api          → 127.0.0.1:3001
                          robtic-activity     → 127.0.0.1:9452
```

## Why the port binding looks "wrong" and isn't

`docker-compose.yml` publishes the API as:

```yaml
ports:
  - "127.0.0.1:3002:3002"
```

Nginx runs on the host, so host loopback is exactly the right place for it. This binding is
**correct for this architecture and should not be changed.**

The consequence: `http://<host-lan-ip>:3002` from another machine is **refused, by design**. That
refusal is the security boundary working. It is not evidence of a broken container, and removing
the `127.0.0.1:` prefix to "fix" it would put the API on the LAN for no reason.

If the public URL fails, the fault is upstream — in the Nginx vhost or in DNS — not in the port
binding.

## Diagnostic ladder

Work down it. Stop at the first failure; each step assumes the ones above it passed.

### 1. Is the container healthy?

```bash
docker compose -p robtic-system ps robtic-platform-api
docker compose -p robtic-system logs --tail=30 robtic-platform-api
```

Expected:

```
Listening on 0.0.0.0:3002 — 46 routes, docs at /api/docs
```

`0.0.0.0` here is *inside* the container and is correct — it is what lets Docker forward the
published port. It does not mean the API is exposed to your network; the `127.0.0.1:` in the port
mapping controls that.

Restarting repeatedly usually means `MONGODB_URI` is missing from the env file.

### 2. Is it reachable from the host?

```bash
curl -i http://127.0.0.1:3002/api/health
```

Expected: `HTTP/1.1 200` and `{"ok":true,"data":{"status":"ok",...}}`.

- **Works** → the container is fine. The problem is Nginx or DNS. Continue to step 3.
- **Connection refused** → Docker is not forwarding. Check `docker ps` shows
  `127.0.0.1:3002->3002/tcp`.

Run this **on the host itself**, over SSH — not from a workstation. From any other machine it is
supposed to fail.

### 3. Is there a vhost for the hostname?

```bash
nginx -T 2>/dev/null | grep -n "minecraft.api.robtic.org" -A 20
```

No output means no vhost exists for that name. Nginx then falls through to its default server,
which typically closes the connection — and a browser reports that as `ERR_CONNECTION_REFUSED`,
which looks identical to the container being down. See the config below.

### 4. Does the proxy_pass target resolve?

```bash
nginx -T 2>/dev/null | grep -n "proxy_pass"
```

It must be `http://127.0.0.1:3002`. Common mistakes:

| Wrong | Why it fails |
|---|---|
| `http://robtic-platform-api:3002` | A Docker service name. Nginx is on the host and cannot resolve it. |
| `http://192.168.1.127:3002` | The LAN address, which the `127.0.0.1:` binding refuses. |
| `https://127.0.0.1:3002` | The API speaks plain HTTP behind the proxy. TLS terminates at Nginx. |
| `http://127.0.0.1:3001` | That is the Activity API, a different service. |

### 5. What do the Nginx logs say?

```bash
tail -50 /var/log/nginx/error.log
tail -20 /var/log/nginx/access.log | grep minecraft
```

| Log line | Meaning |
|---|---|
| `connect() failed (111: Connection refused) while connecting to upstream` | Nginx found the vhost; the container is down or on another port. Back to step 2. |
| `no live upstreams` | The upstream block is misconfigured. |
| *No entry at all for the request* | The request never reached Nginx — this is DNS or Cloudflare, not Nginx. See below. |

### 6. Is DNS pointing where you think?

```bash
dig +short minecraft.api.robtic.org
```

- **A Cloudflare IP** (`104.x`, `172.67.x`) → proxied correctly. A backend failure would show as a
  Cloudflare **521/522** error page, not a browser connection error.
- **A private IP** (`192.168.x.x`) → the record is DNS-only (grey cloud). Browsers then try to
  connect straight to a private address, which gives exactly `ERR_CONNECTION_REFUSED` and cannot
  work from outside your LAN. Switch the record to Proxied (orange cloud).

`ERR_CONNECTION_REFUSED` on a public hostname is a strong signal for this case: a proxied domain
whose backend is down returns a Cloudflare error *page*, not a refused connection.

## The vhost

`/etc/nginx/sites-available/minecraft.api.robtic.org`:

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name minecraft.api.robtic.org;

    # Cloudflare handles the public redirect; this covers direct origin hits.
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    listen [::]:443 ssl;
    http2 on;
    server_name minecraft.api.robtic.org;

    ssl_certificate     /etc/letsencrypt/live/minecraft.api.robtic.org/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/minecraft.api.robtic.org/privkey.pem;

    access_log /var/log/nginx/minecraft-api.access.log;
    error_log  /var/log/nginx/minecraft-api.error.log;

    # Staff-mode snapshots carry a whole serialised inventory as Base64. The default 1m limit
    # rejects those with a 413 — which surfaces in game as an inventory that will not save.
    client_max_body_size 10m;

    location / {
        proxy_pass http://127.0.0.1:3002;
        proxy_http_version 1.1;

        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # The Authorization header carries the plugin's API key. Nginx forwards it by default;
        # this is here so nobody "tidies up" the header list and silently breaks every request
        # into a 401.
        proxy_set_header Authorization $http_authorization;
        proxy_pass_request_headers on;

        proxy_connect_timeout 5s;
        proxy_send_timeout    30s;
        proxy_read_timeout    30s;

        # Every response is either live state or an explicit mutation. A cached 200 here would
        # hand a stale coin balance to a second server.
        proxy_buffering off;
    }
}
```

Enable and reload:

```bash
ln -s /etc/nginx/sites-available/minecraft.api.robtic.org /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
```

## Verify end to end

```bash
# 1. Container → host loopback (run on the host)
curl -s http://127.0.0.1:3002/api/health

# 2. Through Nginx, bypassing DNS and Cloudflare (run on the host)
curl -s -H "Host: minecraft.api.robtic.org" http://127.0.0.1/api/health

# 3. Public, through Cloudflare (run from anywhere)
curl -s https://minecraft.api.robtic.org/api/health
```

Whichever step first fails localises the fault precisely:

| First failure | Fault is in |
|---|---|
| 1 | The container or the Docker port mapping |
| 2 | The Nginx vhost or `proxy_pass` |
| 3 | DNS or Cloudflare |

## Cloudflare settings

- **SSL/TLS mode: Full (strict)** — Nginx holds a real certificate. "Flexible" would make
  Cloudflare speak HTTP to the origin and can cause redirect loops.
- **Proxy status: Proxied** (orange cloud).
- No caching rules for `minecraft.api.robtic.org`. A cached API response would serve one server's
  data to another.

## Security posture

| Layer | Exposure |
|---|---|
| Cloudflare | Public, TLS terminated at the edge |
| Nginx (host) | Ports 80/443 only |
| `robtic-platform-api` | `127.0.0.1:3002` — host loopback only |
| MongoDB | Container network only, no published port |

The API additionally requires `Authorization: Bearer <key>` on every route except `/api/health`,
`/api/openapi.json` and `/api/docs`. Those three stay open so a misconfigured key can be diagnosed
without a working key.
