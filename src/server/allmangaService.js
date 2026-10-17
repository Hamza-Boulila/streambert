// ── AllManga Service ──────────────────────────────────────────────────────────
// Handles episode resolution, stream deciphering, and video proxying for the webapp.

const https = require("https");
const http = require("http");
const crypto = require("crypto");

const ALLANIME_HEX_MAP = {
  79: "A", "7a": "B", "7b": "C", "7c": "D", "7d": "E", "7e": "F", "7f": "G",
  70: "H", 71: "I", 72: "J", 73: "K", 74: "L", 75: "M", 76: "N", 77: "O",
  68: "P", 69: "Q", "6a": "R", "6b": "S", "6c": "T", "6d": "U", "6e": "V", "6f": "W",
  60: "X", 61: "Y", 62: "Z", 59: "a", "5a": "b", "5b": "c", "5c": "d", "5d": "e",
  "5e": "f", "5f": "g", 50: "h", 51: "i", 52: "j", 53: "k", 54: "l", 55: "m",
  56: "n", 57: "o", 48: "p", 49: "q", "4a": "r", "4b": "s", "4c": "t", "4d": "u",
  "4e": "v", "4f": "w", 40: "x", 41: "y", 42: "z", "08": "0", "09": "1", "0a": "2",
  "0b": "3", "0c": "4", "0d": "5", "0e": "6", "0f": "7", "00": "8", "01": "9",
  15: "-", 16: ".", 67: "_", 46: "~", "02": ":", 17: "/", "07": "?", "1b": "#",
  63: "[", 65: "]", 78: "@", 19: "!", "1c": "$", "1e": "&", 10: "(", 11: ")",
  12: "*", 13: "+", 14: ",", "03": ";", "05": "=", "1d": "%",
};

function decodeAllanimeUrl(encoded) {
  if (encoded.startsWith("--")) encoded = encoded.slice(2);
  let result = "";
  for (let i = 0; i < encoded.length; i += 2) {
    const pair = encoded.slice(i, i + 2);
    result += ALLANIME_HEX_MAP[pair] !== undefined ? ALLANIME_HEX_MAP[pair] : pair;
  }
  return result.replace(/\\u002F/gi, "/").replace(/\\\|/g, "");
}

const ALLANIME_KEY = crypto.createHash("sha256").update("Xot36i3lK3:v1").digest();

function decodeTobeparsed(blob) {
  try {
    const buf = Buffer.from(blob, "base64");
    const iv12 = buf.slice(1, 13);
    const iv16 = Buffer.concat([iv12, Buffer.from([0, 0, 0, 2])]);
    const ct = buf.slice(13, buf.length - 16);
    const decipher = crypto.createDecipheriv("aes-256-ctr", ALLANIME_KEY, iv16);
    decipher.setAutoPadding(false);
    const plain = Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
    const sources = [];
    for (const chunk of plain.split(/[{}]/)) {
      const urlMatch = chunk.match(/"sourceUrl"\s*:\s*"(--[^"]+)"/);
      const nameMatch = chunk.match(/"sourceName"\s*:\s*"([^"]+)"/);
      const prioMatch = chunk.match(/"priority"\s*:\s*([0-9.]+)/);
      if (urlMatch) {
        sources.push({
          sourceUrl: urlMatch[1],
          sourceName: nameMatch ? nameMatch[1] : "",
          priority: prioMatch ? parseFloat(prioMatch[1]) : 0,
        });
      }
    }
    return sources;
  } catch {
    return [];
  }
}

function parseEpisodeSourceUrls(body) {
  const tbMatch = body.match(/"tobeparsed"\s*:\s*"([^"]+)"/);
  if (tbMatch) {
    const sources = decodeTobeparsed(tbMatch[1]);
    if (sources.length) return sources;
  }
  try {
    const sourceUrls = JSON.parse(body)?.data?.episode?.sourceUrls;
    return sourceUrls?.length ? sourceUrls : null;
  } catch {
    return null;
  }
}

function httpsGet(urlStr) {
  return new Promise((resolve, reject) => {
    function doGet(url) {
      let u;
      try {
        u = new URL(url);
      } catch (err) {
        return reject(err);
      }
      const lib = u.protocol === "https:" ? https : http;
      const req = lib.request(
        {
          hostname: u.hostname,
          path: u.pathname + u.search,
          method: "GET",
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/121.0",
            Referer: "https://allmanga.to",
            Origin: "https://allmanga.to",
            Accept: "*/*",
          },
        },
        (res) => {
          if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            const loc = res.headers.location.startsWith("http")
              ? res.headers.location
              : new URL(res.headers.location, url).href;
            res.resume();
            doGet(loc);
            return;
          }
          let data = "";
          res.on("data", (c) => (data += c));
          res.on("end", () => resolve({ status: res.statusCode, body: data }));
        },
      );
      req.on("error", reject);
      req.setTimeout(12000, () => {
        req.destroy();
        reject(new Error("timeout"));
      });
      req.end();
    }
    doGet(urlStr);
  });
}

function followRedirects(urlStr, maxHops = 10) {
  return new Promise((resolve, reject) => {
    let hops = 0;
    function step(url) {
      if (++hops > maxHops) return resolve(url);
      let u;
      try {
        u = new URL(url);
      } catch {
        return reject(new Error("invalid url: " + url));
      }
      const lib = u.protocol === "https:" ? https : http;
      const req = lib.request(
        {
          hostname: u.hostname,
          path: u.pathname + u.search,
          method: "HEAD",
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/121.0",
            Referer: "https://allmanga.to",
            Accept: "*/*",
          },
        },
        (res) => {
          res.resume();
          if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            const loc = res.headers.location.startsWith("http")
              ? res.headers.location
              : new URL(res.headers.location, url).href;
            step(loc);
          } else {
            resolve(url);
          }
        },
      );
      req.on("error", reject);
      req.setTimeout(10000, () => {
        req.destroy();
        reject(new Error("timeout"));
      });
      req.end();
    }
    step(urlStr);
  });
}

const SEARCH_GQL = `query($search:SearchInput $limit:Int $page:Int $translationType:VaildTranslationTypeEnumType $countryOrigin:VaildCountryOriginEnumType){shows(search:$search limit:$limit page:$page translationType:$translationType countryOrigin:$countryOrigin){edges{_id name availableEpisodes __typename}}}`;
const EPISODE_GQL = `query($showId:String! $translationType:VaildTranslationTypeEnumType! $episodeString:String!){episode(showId:$showId translationType:$translationType episodeString:$episodeString){episodeString sourceUrls}}`;
const EPISODE_GQL_HASH = "d405d0edd690624b66baba3068e0edc3ac90f1597d898a1ec8db4e5c43c00fec";

function allanimeGQL(variables, query) {
  const body = JSON.stringify({ variables, query });
  return new Promise((resolve, reject) => {
    const u = new URL("https://api.allanime.day/api");
    const req = https.request(
      {
        hostname: u.hostname,
        path: u.pathname,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/121.0",
          Referer: "https://allmanga.to",
          Origin: "https://allmanga.to",
        },
      },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => resolve({ status: res.statusCode, body: data }));
      },
    );
    req.on("error", reject);
    req.setTimeout(12000, () => {
      req.destroy();
      reject(new Error("timeout"));
    });
    req.write(body);
    req.end();
  });
}

async function allanimeGQLEpisode(variables) {
  try {
    const encodedVars = encodeURIComponent(JSON.stringify(variables));
    const extensions = JSON.stringify({
      persistedQuery: { version: 1, sha256Hash: EPISODE_GQL_HASH },
    });
    const encodedExt = encodeURIComponent(extensions);
    const getUrl = `https://api.allanime.day/api?variables=${encodedVars}&extensions=${encodedExt}`;

    const getRes = await new Promise((resolve, reject) => {
      const u = new URL(getUrl);
      const req = https.request(
        {
          hostname: u.hostname,
          path: u.pathname + u.search,
          method: "GET",
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/121.0",
            Referer: "https://allmanga.to",
            Origin: "https://youtu-chan.com",
            Accept: "*/*",
          },
        },
        (res) => {
          let data = "";
          res.on("data", (c) => (data += c));
          res.on("end", () => resolve({ status: res.statusCode, body: data }));
        },
      );
      req.on("error", reject);
      req.setTimeout(12000, () => {
        req.destroy();
        reject(new Error("timeout"));
      });
      req.end();
    });

    if (getRes.body && getRes.body.includes("tobeparsed")) return getRes;
  } catch {}

  return allanimeGQL(variables, EPISODE_GQL);
}

function sanitizeTitle(t) {
  return t
    .replace(/[''`´]/g, "")
    .replace(/[:!.]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function anilistSeasonTitle(baseTitle, seasonNumber) {
  return new Promise((resolve) => {
    const resolveS1 = seasonNumber <= 1;
    const query = `query($search:String){Media(search:$search,type:ANIME,sort:SEARCH_MATCH){title{english romaji}episodes relations{edges{relationType node{type format title{english romaji}episodes startDate{year}seasonYear}}}}}`;
    const body = JSON.stringify({ query, variables: { search: baseTitle } });
    const opts = {
      hostname: "graphql.anilist.co",
      path: "/",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "Content-Length": Buffer.byteLength(body),
      },
    };

    const fallback = {
      title: baseTitle,
      romaji: null,
      episodes: null,
      nextTitle: null,
      nextRomaji: null,
    };

    const req = https.request(opts, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => {
        try {
          const json = JSON.parse(data);
          const media = json?.data?.Media;
          if (!media) return resolve(fallback);

          const s1Romaji = media?.title?.romaji || null;
          const s1Episodes = media?.episodes || null;
          const sequels = (media.relations?.edges || [])
            .filter(
              (e) =>
                e.relationType === "SEQUEL" &&
                e.node.type === "ANIME" &&
                (e.node.format === "TV" || e.node.format === "TV_SHORT"),
            )
            .sort((a, b) => {
              const ya = a.node.startDate?.year || a.node.seasonYear || 9999;
              const yb = b.node.startDate?.year || b.node.seasonYear || 9999;
              return ya - yb;
            });

          const getTitle = (node) => node.title?.english || node.title?.romaji || null;
          const getRomaji = (node) => node.title?.romaji || null;

          if (resolveS1) {
            const next = sequels[0]?.node ?? null;
            return resolve({
              title: media.title?.english || baseTitle,
              romaji: s1Romaji,
              episodes: s1Episodes,
              nextTitle: next ? getTitle(next) : null,
              nextRomaji: next ? getRomaji(next) : null,
            });
          }

          const target = sequels[seasonNumber - 2];
          if (!target) return resolve({ ...fallback, romaji: s1Romaji });

          const nextNode = sequels[seasonNumber - 1]?.node ?? null;
          resolve({
            title: getTitle(target.node) || baseTitle,
            romaji: getRomaji(target.node) || s1Romaji,
            episodes: target.node.episodes || null,
            nextTitle: nextNode ? getTitle(nextNode) : null,
            nextRomaji: nextNode ? getRomaji(nextNode) : null,
          });
        } catch {
          resolve(fallback);
        }
      });
    });
    req.on("error", () => resolve(fallback));
    req.setTimeout(8000, () => {
      req.destroy();
      resolve(fallback);
    });
    req.write(body);
    req.end();
  });
}

const HARDCODED_SHOW_IDS = {
  "jojo's bizarre adventure": [
    "MeX4czvkwKGo3zdDp", "zyqDjR8te4z6taKyk", "GTAQH8Z9K6WbAdXsS",
    "JS9PzKiPanesGRvs5", "b6xFsr7MDSMcJArB9", "pwduJkjBLytqiWCvM",
  ],
};

const SPLIT_SEASONS = {
  "spy x family": {
    1: [
      { from: 1, showId: null, offset: 0 },
      { from: 13, showId: "H8Aey6QXE7HSqwvW3", offset: 12 },
    ],
  },
};

const PROVIDER_PRIORITY = ["S-mp4", "Luf-Mp4", "Yt-mp4", "Default", "Sl-Hls"];

async function trySourceUrls(sourceUrls) {
  const decodedSources = sourceUrls
    .filter((s) => s.sourceUrl?.startsWith("--"))
    .map((s) => ({
      sourceName: s.sourceName || "",
      priority: s.priority || 0,
      path: decodeAllanimeUrl(s.sourceUrl).replace("/clock", "/clock.json"),
    }))
    .sort((a, b) => {
      const ai = PROVIDER_PRIORITY.indexOf(a.sourceName);
      const bi = PROVIDER_PRIORITY.indexOf(b.sourceName);
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    });

  for (const src of decodedSources) {
    let fetchUrl = src.path;
    if (fetchUrl.startsWith("//")) fetchUrl = "https:" + fetchUrl;
    else if (fetchUrl.startsWith("/")) fetchUrl = "https://allanime.day" + fetchUrl;
    else if (!fetchUrl.startsWith("http")) fetchUrl = "https://allanime.day/" + fetchUrl;

    try {
      if (fetchUrl.includes("fast4speed.rsvp") || src.sourceName === "Yt-mp4") {
        const finalUrl = await followRedirects(fetchUrl).catch(() => null);
        if (!finalUrl) continue;

        let isGoogleVideoHost = false;
        try {
          const parsedFinalUrl = new URL(finalUrl);
          const host = parsedFinalUrl.hostname.toLowerCase();
          isGoogleVideoHost = host === "googlevideo.com" || host.endsWith(".googlevideo.com");
        } catch {
          isGoogleVideoHost = false;
        }

        if (
          /\.(mp4|webm|mkv|m3u8)(\?|$)/i.test(finalUrl) ||
          isGoogleVideoHost ||
          (!finalUrl.includes("youtube.com/watch") && !finalUrl.includes("youtu.be/"))
        ) {
          return {
            ok: true,
            url: finalUrl,
            resolution: "?",
            sourceName: src.sourceName,
            isDirectMp4: !finalUrl.includes(".m3u8"),
            referer: "https://allmanga.to",
          };
        }
        continue;
      }

      const linkRes = await httpsGet(fetchUrl);
      if (linkRes.status !== 200 || !linkRes.body) continue;
      let linkJson;
      try {
        linkJson = JSON.parse(linkRes.body);
      } catch {
        continue;
      }
      const links = linkJson?.links;
      if (!links?.length) continue;
      const allLinks = links.filter((l) => l.link);
      const mp4Links = allLinks.filter(
        (l) => !l.link.includes(".m3u8") && !l.link.includes("master."),
      );
      const best = (mp4Links.length ? mp4Links : allLinks).sort(
        (a, b) => (parseInt(b.resolutionStr) || 0) - (parseInt(a.resolutionStr) || 0),
      )[0];
      if (!best) continue;
      return {
        ok: true,
        url: best.link,
        resolution: best.resolutionStr || "?",
        sourceName: src.sourceName,
        isDirectMp4: !best.link.includes(".m3u8"),
        referer: "https://allmanga.to",
      };
    } catch {
      continue;
    }
  }
  return null;
}

async function resolveEpisodeFromId(showId, epStr, dubSub) {
  const candidates = [epStr];
  if (!epStr.includes(".")) candidates.push(epStr + ".0");

  let sourceUrls = null;
  for (const attempt of candidates) {
    const epRes = await allanimeGQLEpisode({
      showId,
      translationType: dubSub,
      episodeString: attempt,
    });
    if (!epRes.body) continue;
    const urls = parseEpisodeSourceUrls(epRes.body);
    if (urls?.length) {
      sourceUrls = urls;
      break;
    }
  }
  if (!sourceUrls) return null;
  return trySourceUrls(sourceUrls);
}

async function resolveAllManga({ title, seasonNumber, episodeNumber, isMovie, translationType }) {
  try {
    const season = seasonNumber || 1;
    const dubSub = translationType === "dub" ? "dub" : "sub";

    // 1. Check split season map
    if (!isMovie) {
      const splitParts = SPLIT_SEASONS[title.toLowerCase()]?.[season];
      if (splitParts) {
        let activePart = splitParts[0];
        for (const part of splitParts) {
          if (episodeNumber >= part.from) activePart = part;
        }
        const partEp = episodeNumber - activePart.offset;
        if (activePart.showId) {
          const result = await resolveEpisodeFromId(activePart.showId, String(partEp), dubSub);
          if (result) return result;
        }
      }
    }

    // 2. Check hardcoded show IDs
    if (!isMovie) {
      const hardcodedIds = HARDCODED_SHOW_IDS[title.toLowerCase()];
      if (hardcodedIds) {
        const showId = hardcodedIds[season - 1] ?? hardcodedIds[hardcodedIds.length - 1];
        const result = await resolveEpisodeFromId(showId, String(episodeNumber), dubSub);
        if (result) return result;
      }
    }

    // 3. AniList season title lookup
    const anilistResult = isMovie
      ? { title, romaji: null, episodes: null, nextTitle: null, nextRomaji: null }
      : await anilistSeasonTitle(title, season);

    let searchTitle = anilistResult.title;
    let adjustedEpisodeNumber = episodeNumber;

    if (
      !isMovie &&
      anilistResult.episodes &&
      episodeNumber > anilistResult.episodes &&
      anilistResult.nextTitle
    ) {
      adjustedEpisodeNumber = episodeNumber - anilistResult.episodes;
      searchTitle = anilistResult.nextTitle;
    }

    const epStr = isMovie ? "1" : String(adjustedEpisodeNumber);

    const candidateSet = new Set([
      searchTitle,
      sanitizeTitle(searchTitle),
      ...(anilistResult.romaji && searchTitle === anilistResult.title ? [anilistResult.romaji] : []),
      ...(anilistResult.nextRomaji && searchTitle === anilistResult.nextTitle
        ? [anilistResult.nextRomaji]
        : []),
      title,
      sanitizeTitle(title),
    ]);
    const candidates = [...candidateSet].filter(Boolean);

    async function searchAllmanga(query) {
      const vars = {
        search: {
          allowAdult: true,
          allowUnknown: false,
          query: query.toLowerCase(),
        },
        limit: 40,
        page: 1,
        translationType: dubSub,
        countryOrigin: "ALL",
      };
      const res = await allanimeGQL(vars, SEARCH_GQL);
      if (!res.body) return null;
      try {
        const edges = JSON.parse(res.body)?.data?.shows?.edges;
        return edges?.length ? edges : null;
      } catch {
        return null;
      }
    }

    let edges = null;
    let matchedTitle = searchTitle;
    for (const candidate of candidates) {
      edges = await searchAllmanga(candidate);
      if (edges) {
        matchedTitle = candidate;
        break;
      }
    }
    if (!edges) return { ok: false, error: "No results for: " + searchTitle };

    const titleLower = matchedTitle.toLowerCase();
    const anime = edges.find((e) => (e.name || "").toLowerCase() === titleLower) || edges[0];

    const epCandidates = [epStr];
    if (!epStr.includes(".")) epCandidates.push(epStr + ".0");

    let sourceUrls = null;
    for (const attempt of epCandidates) {
      const epRes = await allanimeGQLEpisode({
        showId: anime._id,
        translationType: dubSub,
        episodeString: attempt,
      });
      if (!epRes.body) continue;
      const urls = parseEpisodeSourceUrls(epRes.body);
      if (urls?.length) {
        sourceUrls = urls;
        break;
      }
    }
    if (!sourceUrls?.length) return { ok: false, error: "No sourceUrls for ep " + epStr };

    const result = await trySourceUrls(sourceUrls);
    if (result) return { ...result, searchTitle };

    return { ok: false, error: "No playable link found" };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

function streamProxy(req, res) {
  const target = req.query.url;
  const referer = req.query.referer || "https://allmanga.to";
  if (!target) {
    res.status(400).send("Missing target URL");
    return;
  }
  try {
    const targetUrl = new URL(target);
    const lib = targetUrl.protocol === "https:" ? https : http;
    const proxyReq = lib.request(
      {
        hostname: targetUrl.hostname,
        path: targetUrl.pathname + targetUrl.search,
        method: req.method || "GET",
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/121.0",
          Referer: referer,
          Range: req.headers["range"] || "",
          Accept: "*/*",
        },
      },
      (proxyRes) => {
        const passHeaders = {};
        for (const h of [
          "content-type",
          "content-length",
          "content-range",
          "accept-ranges",
          "last-modified",
          "etag",
        ]) {
          if (proxyRes.headers[h]) passHeaders[h] = proxyRes.headers[h];
        }
        passHeaders["Access-Control-Allow-Origin"] = "*";
        passHeaders["Cache-Control"] = "no-store";
        res.writeHead(proxyRes.statusCode, passHeaders);
        proxyRes.pipe(res);
      },
    );
    proxyReq.on("error", () => {
      if (!res.headersSent) res.status(502).end();
    });
    req.pipe(proxyReq);
  } catch {
    if (!res.headersSent) res.status(500).end();
  }
}

function buildPlayerHtml(videoUrl, startTime = 0, referer = "https://allmanga.to") {
  const isM3u8 = videoUrl.includes(".m3u8");
  const streamSrc = isM3u8
    ? videoUrl
    : `/api/allmanga/proxy?url=${encodeURIComponent(videoUrl)}&referer=${encodeURIComponent(referer)}`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Streambert Player</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: 100%; height: 100%; background: #000; overflow: hidden; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    video { width: 100%; height: 100%; object-fit: contain; display: block; }
  </style>
</head>
<body>
  <video id="v" src="${isM3u8 ? "" : streamSrc}" autoplay controls playsinline crossorigin="anonymous"></video>
  ${
    isM3u8
      ? `
  <script src="https://cdn.jsdelivr.net/npm/hls.js@latest/dist/hls.min.js"></script>
  <script>
    const video = document.getElementById('v');
    const src = decodeURIComponent("${encodeURIComponent(videoUrl)}");
    const startTime = ${Number(startTime) || 0};
    if (Hls.isSupported()) {
      const hls = new Hls();
      hls.loadSource(src);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        if (startTime > 0) video.currentTime = startTime;
        video.play().catch(() => {});
      });
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = src;
      if (startTime > 0) video.addEventListener('loadedmetadata', () => { video.currentTime = startTime; }, { once: true });
    }
  </script>`
      : startTime > 0
        ? `<script>
    const v = document.getElementById('v');
    v.addEventListener('loadedmetadata', () => { v.currentTime = ${Number(startTime) || 0}; }, { once: true });
  </script>`
        : ""
  }
</body>
</html>`;
}

module.exports = {
  resolveAllManga,
  streamProxy,
  buildPlayerHtml,
};
