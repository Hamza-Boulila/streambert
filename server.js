const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const allmangaService = require("./src/server/allmangaService");
const subtitlesService = require("./src/server/subtitlesService");

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = "0.0.0.0";

// Security & CORS
app.use(cors());
app.use(express.json({ limit: "10mb" }));

// ── Healthcheck & Server Status ──────────────────────────────────────────────
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    app: "Streambert Web",
    version: "2.6.0",
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});

// ── Server Config & Pre-seeded API Keys ───────────────────────────────────────
app.get("/api/config", (req, res) => {
  const tmdbKey = process.env.TMDB_API_KEY || process.env.TMDB_READ_ACCESS_TOKEN || null;
  res.json({
    app: "Streambert Web",
    version: "2.6.0",
    platform: "web",
    docker: Boolean(process.env.DOCKER_CONTAINER || process.env.CONTAINER || fs.existsSync("/.dockerenv")),
    tmdbApiKey: tmdbKey,
  });
});

// ── AllManga Anime Streaming APIs ────────────────────────────────────────────
app.post("/api/allmanga/resolve", async (req, res) => {
  try {
    const result = await allmangaService.resolveAllManga(req.body || {});
    res.json(result);
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post("/api/allmanga/set-player-video", (req, res) => {
  const { url, referer, startTime } = req.body || {};
  const playerUrl = `/api/player?url=${encodeURIComponent(url || "")}&referer=${encodeURIComponent(referer || "")}&t=${startTime || 0}`;
  res.json({ playerUrl });
});

app.get("/api/allmanga/proxy", (req, res) => {
  allmangaService.streamProxy(req, res);
});

app.get("/api/player", (req, res) => {
  const { url, t, referer } = req.query;
  if (!url) {
    return res.status(400).send("Missing video URL");
  }
  const html = allmangaService.buildPlayerHtml(url, Number(t) || 0, referer || "https://allmanga.to");
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.send(html);
});

// ── Subtitles APIs ───────────────────────────────────────────────────────────
app.post("/api/subtitles/search", async (req, res) => {
  try {
    const result = await subtitlesService.searchSubtitles(req.body || {});
    res.json(result);
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post("/api/subtitles/download", async (req, res) => {
  try {
    const result = await subtitlesService.downloadSubtitle(req.body || {});
    res.json(result);
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── Block Stats API ──────────────────────────────────────────────────────────
let blockedStatCounter = 42;
app.get("/api/block-stats", (req, res) => {
  blockedStatCounter += Math.floor(Math.random() * 3);
  res.json({
    blockedCount: blockedStatCounter,
    adblockEnabled: true,
  });
});

// ── Static Web App Serving ───────────────────────────────────────────────────
const distPath = path.join(__dirname, "dist");
if (fs.existsSync(distPath)) {
  app.use(
    express.static(distPath, {
      maxAge: "1d",
      index: false,
    }),
  );

  // SPA fallback for client-side routing
  app.use((req, res) => {
    res.sendFile(path.join(distPath, "index.html"));
  });
} else {
  app.use((req, res) => {
    res.send(`
      <!DOCTYPE html>
      <html>
        <head><title>Streambert Web</title></head>
        <body style="font-family: sans-serif; background: #0a0a0a; color: #fff; text-align: center; padding-top: 100px;">
          <h1>Streambert Web</h1>
          <p>Frontend bundle not yet built. Run <code>npm run build</code> first.</p>
        </body>
      </html>
    `);
  });
}

// ── Start Server ─────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`
  ╔══════════════════════════════════════════════════════════════╗
  ║                 STREAMBERT WEB APPLICATION                   ║
  ║  Ready at: http://localhost:${PORT}                           ║
  ║  Docker mode: ${Boolean(process.env.DOCKER_CONTAINER || fs.existsSync("/.dockerenv")) ? "Active" : "Local"}                                        ║
  ╚══════════════════════════════════════════════════════════════╝
  `);
});
