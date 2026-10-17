// ── Streambert Web Adapter ──────────────────────────────────────────────────
// Polyfills the Electron IPC bridge for standard web browsers and Docker deployment.

export function initWebAdapter() {
  if (typeof window === "undefined") return;

  // If already in real Electron with contextBridge, leave untouched
  if (window.electron && !window.electron._isWebPolyfill) {
    return;
  }

  const STORAGE_PREFIX = "streambert_sec_";
  const listeners = new Map();

  function addListener(channel, cb) {
    if (!listeners.has(channel)) listeners.set(channel, new Set());
    listeners.get(channel).add(cb);
    return cb;
  }

  function removeListener(channel, cb) {
    if (listeners.has(channel)) {
      listeners.get(channel).delete(cb);
    }
  }

  function emit(channel, data) {
    if (listeners.has(channel)) {
      for (const cb of listeners.get(channel)) {
        try {
          cb(data);
        } catch (e) {
          console.error(`[WebAdapter] Listener error on ${channel}:`, e);
        }
      }
    }
  }

  // Pre-fetch server config (e.g. TMDB key passed via Docker env)
  let serverConfig = null;
  fetch("/api/config")
    .then((r) => r.json())
    .then((cfg) => {
      serverConfig = cfg;
      if (cfg?.tmdbApiKey) {
        // If not already in localStorage, auto-populate with server-provided key
        if (!localStorage.getItem(STORAGE_PREFIX + "apikey")) {
          localStorage.setItem(STORAGE_PREFIX + "apikey", cfg.tmdbApiKey);
          window.dispatchEvent(new Event("streambert:apikey-ready"));
        }
      }
    })
    .catch(() => {
      // Non-critical if running in standalone Vite dev without backend
    });

  window.electron = {
    _isWebPolyfill: true,

    // Platform & version info
    getPlatform: async () => "web",
    getAppVersion: async () => (serverConfig?.version ? `${serverConfig.version} (Web)` : "2.6.0 (Web)"),
    getInstallPath: async () => null,

    // Secure key storage: falls back cleanly to localStorage
    secureGet: async (key) => {
      const val = localStorage.getItem(STORAGE_PREFIX + key);
      if (val) return val;
      if (key === "apikey" && serverConfig?.tmdbApiKey) {
        return serverConfig.tmdbApiKey;
      }
      return null;
    },
    secureSet: async (key, value) => {
      if (value === null || value === undefined || value === "") {
        localStorage.removeItem(STORAGE_PREFIX + key);
      } else {
        localStorage.setItem(STORAGE_PREFIX + key, value);
      }
    },

    // External navigation & URLs
    openExternal: (url) => {
      if (!url) return;
      window.open(url, "_blank", "noopener,noreferrer");
    },
    openPath: (filePath) => {
      if (!filePath) return;
      window.open(filePath, "_blank", "noopener,noreferrer");
    },
    openPathAtTime: (filePath) => {
      if (!filePath) return;
      window.open(filePath, "_blank", "noopener,noreferrer");
    },
    showInFolder: () => {},

    // Notifications: Web Notification API with permission handling
    showNotification: async ({ title, body }) => {
      try {
        if ("Notification" in window) {
          if (Notification.permission === "granted") {
            new Notification(title, { body, icon: "/logo.svg" });
          } else if (Notification.permission !== "denied") {
            const perm = await Notification.requestPermission();
            if (perm === "granted") {
              new Notification(title, { body, icon: "/logo.svg" });
            }
          }
        }
      } catch (err) {
        console.log(`[Notification] ${title}: ${body}`);
      }
    },

    // Fullscreen and window controls adapted to web
    windowMinimize: () => {},
    windowToggleMaximize: () => {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen?.().catch(() => {});
      } else {
        document.exitFullscreen?.().catch(() => {});
      }
    },
    windowClose: () => {
      window.close();
    },
    windowIsMaximized: async () => !!document.fullscreenElement,
    onWindowMaximize: (cb) => {
      const handler = () => cb(!!document.fullscreenElement);
      document.addEventListener("fullscreenchange", handler);
      return handler;
    },
    offWindowMaximize: (handler) => {
      document.removeEventListener("fullscreenchange", handler);
    },

    setZoomFactor: (factor) => {
      try {
        document.body.style.zoom = String(factor);
      } catch {}
    },

    // Picture-in-picture pop-out (opens standard browser popup)
    openPipWindow: (url, title) => {
      const w = 880;
      const h = 495;
      const left = Math.max(0, (window.screen.width - w) / 2);
      const top = Math.max(0, (window.screen.height - h) / 2);
      const win = window.open(
        url,
        "StreambertPiP",
        `width=${w},height=${h},top=${top},left=${left},resizable=yes,scrollbars=no,status=no,menubar=no`,
      );
      if (win) {
        emit("pip-window-opened");
        const poll = setInterval(() => {
          if (win.closed) {
            clearInterval(poll);
            emit("pip-window-closed");
          }
        }, 500);
      }
    },
    closePipWindow: () => {
      emit("pip-window-closed");
    },
    getPipWebContentsId: async () => null,
    onPipOpened: (cb) => addListener("pip-window-opened", cb),
    offPipOpened: (cb) => removeListener("pip-window-opened", cb),
    onPipClosed: (cb) => addListener("pip-window-closed", cb),
    offPipClosed: (cb) => removeListener("pip-window-closed", cb),

    // Anime resolution via web API
    resolveAllManga: async (args) => {
      try {
        const res = await fetch("/api/allmanga/resolve", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(args),
        });
        if (!res.ok) {
          return { ok: false, error: `Server returned HTTP ${res.status}` };
        }
        return await res.json();
      } catch (err) {
        return { ok: false, error: err.message };
      }
    },

    setPlayerVideo: async ({ url, referer, startTime }) => {
      try {
        const res = await fetch("/api/allmanga/set-player-video", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url, referer, startTime }),
        });
        if (res.ok) {
          return await res.json();
        }
      } catch {}
      // Fallback direct URL format
      return {
        playerUrl: `/api/player?url=${encodeURIComponent(url)}&referer=${encodeURIComponent(referer || "")}&t=${startTime || 0}`,
      };
    },

    debugAllManga: async () => ({ ok: true }),

    // Subtitle API
    searchSubtitles: async (args) => {
      try {
        const res = await fetch("/api/subtitles/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(args),
        });
        return await res.json();
      } catch {
        return [];
      }
    },
    getSubtitleUrl: async (args) => {
      return args?.url || null;
    },
    downloadSubtitlesForFile: async (args) => {
      try {
        const res = await fetch("/api/subtitles/download", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(args),
        });
        return await res.json();
      } catch (e) {
        return { ok: false, error: e.message };
      }
    },
    deleteSubtitleFile: async () => ({ ok: true }),
    pruneSubtitlePaths: async () => ({ ok: true, subtitlePaths: [] }),

    // Downloads & files
    getDownloads: async () => {
      try {
        const raw = localStorage.getItem("streambert_web_downloads");
        return raw ? JSON.parse(raw) : [];
      } catch {
        return [];
      }
    },
    deleteDownload: async ({ id }) => {
      try {
        const raw = localStorage.getItem("streambert_web_downloads");
        const list = raw ? JSON.parse(raw) : [];
        const next = list.filter((d) => d.id !== id);
        localStorage.setItem("streambert_web_downloads", JSON.stringify(next));
        return { ok: true };
      } catch {
        return { ok: false };
      }
    },
    runDownload: async (args) => {
      // For web, if it's a direct URL, trigger browser download
      if (args?.url) {
        const a = document.createElement("a");
        a.href = args.url;
        a.download = (args.title || "video").replace(/[^a-zA-Z0-9_-]/g, "_") + ".mp4";
        a.target = "_blank";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        return { ok: true, webDownload: true };
      }
      return { ok: false, error: "Download link unavailable" };
    },
    checkDownloader: async () => ({ ok: true }),
    pickFolder: async () => null,
    fileExists: async () => false,
    scanDirectory: async () => [],
    getVideoDuration: async () => ({ ok: false }),

    onDownloadProgress: (cb) => addListener("download-progress", cb),
    offDownloadProgress: (cb) => removeListener("download-progress", cb),

    // Ad-block stats
    onBlockedUpdate: (cb) => addListener("blocked-stats-update", cb),
    offBlockedUpdate: (cb) => removeListener("blocked-stats-update", cb),
    getBlockStats: async () => {
      try {
        const res = await fetch("/api/block-stats");
        if (res.ok) return await res.json();
      } catch {}
      return { blockedCount: 0, hosts: [] };
    },

    // Cache & storage management
    getCacheSize: async () => 0,
    getDownloadsSize: async () => 0,
    clearAppCache: async () => {
      sessionStorage.clear();
      return { ok: true };
    },
    clearWatchData: async () => {
      localStorage.removeItem("streambert_progress");
      localStorage.removeItem("streambert_watched");
      localStorage.removeItem("streambert_history");
      return { ok: true };
    },
    deleteAllDownloads: async () => {
      localStorage.removeItem("streambert_web_downloads");
      return { ok: true };
    },
    resetApp: async () => {
      localStorage.clear();
      sessionStorage.clear();
      window.location.reload();
      return { ok: true };
    },
    queryVideoProgress: async () => null,

    // App lifecycle
    playerStopped: () => {},
    quitApp: () => {
      window.close();
    },
    onConfirmClose: (cb) => addListener("confirm-close", cb),
    offConfirmClose: (cb) => removeListener("confirm-close", cb),
    respondClose: () => {},

    // Media capture stubs
    onM3u8Found: (cb) => addListener("m3u8-found", cb),
    offM3u8Found: (cb) => removeListener("m3u8-found", cb),
    onSubtitleFound: (cb) => addListener("subtitle-found", cb),
    offSubtitleFound: (cb) => removeListener("subtitle-found", cb),

    // Webview fullscreen stubs
    onWebviewEnterFullscreen: (cb) => addListener("webview-enter-fullscreen", cb),
    offWebviewEnterFullscreen: (cb) => removeListener("webview-enter-fullscreen", cb),
    onWebviewLeaveFullscreen: (cb) => addListener("webview-leave-fullscreen", cb),
    offWebviewLeaveFullscreen: (cb) => removeListener("webview-leave-fullscreen", cb),

    // Updater stubs
    detectUpdateFormat: async () => null,
    downloadAndInstallUpdate: async () => ({ ok: false }),
    cancelUpdate: () => {},
    onUpdateProgress: (cb) => addListener("update-progress", cb),
    offUpdateProgress: (cb) => removeListener("update-progress", cb),

    // Backup stubs
    getScheduledBackupSettings: async () => null,
    setScheduledBackupSettings: async () => {},
    performScheduledBackup: async () => ({ ok: true }),
    onScheduledBackupRequested: (cb) => addListener("scheduled-backup-requested", cb),
    offScheduledBackupRequested: (cb) => removeListener("scheduled-backup-requested", cb),

    fetchReleaseImage: async ({ url }) => url,

    // Discord RPC stubs
    discordRpcSetEnabled: async () => {},
    discordRpcUpdateActivity: async () => {},

    // Wyzie API key
    wyzieOpenRedeem: () => window.open("https://wyzie.ru", "_blank"),
    wyzieValidateKey: async () => ({ ok: true }),
  };
}
