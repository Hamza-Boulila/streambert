// ── Subtitles Service ────────────────────────────────────────────────────────
// Handles SubDL and Wyzie subtitle searches and downloads for the webapp.

const zlib = require("zlib");
const path = require("path");

function fetchWithTimeout(url, options = {}, ms = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return fetch(url, { ...options, signal: controller.signal }).finally(() =>
    clearTimeout(timer),
  );
}

const ZIP_MAX_OUTPUT_BYTES = 10 * 1024 * 1024;
const SUBTITLE_EXTS = new Set(["srt", "vtt", "ass", "ssa"]);

function extractFirstSubtitleFromZip(buf) {
  let offset = 0;
  while (offset < buf.length - 30) {
    if (
      buf[offset] === 0x50 &&
      buf[offset + 1] === 0x4b &&
      buf[offset + 2] === 0x03 &&
      buf[offset + 3] === 0x04
    ) {
      const compression = buf.readUInt16LE(offset + 8);
      const compressedSize = buf.readUInt32LE(offset + 18);
      const fileNameLen = buf.readUInt16LE(offset + 26);
      const extraLen = buf.readUInt16LE(offset + 28);
      const rawFileName = buf
        .slice(offset + 30, offset + 30 + fileNameLen)
        .toString("utf8");
      const dataOffset = offset + 30 + fileNameLen + extraLen;
      const fileName = path.basename(rawFileName);
      const ext = fileName.toLowerCase().split(".").pop();

      if (SUBTITLE_EXTS.has(ext)) {
        const compressedData = buf.slice(dataOffset, dataOffset + compressedSize);
        let data;
        if (compression === 0) {
          if (compressedData.length > ZIP_MAX_OUTPUT_BYTES) {
            offset = dataOffset + compressedSize;
            continue;
          }
          data = compressedData;
        } else if (compression === 8) {
          try {
            data = zlib.inflateRawSync(compressedData, {
              maxOutputLength: ZIP_MAX_OUTPUT_BYTES,
            });
          } catch {
            offset = dataOffset + compressedSize;
            continue;
          }
        } else {
          offset = dataOffset + compressedSize;
          continue;
        }
        return { data: data.toString("utf8"), name: fileName };
      }
      offset = dataOffset + compressedSize;
    } else {
      offset++;
    }
  }
  return null;
}

async function searchSubtitles({
  tmdbId,
  mediaType,
  season,
  episode,
  languages,
  subdlApiKey,
  wyzieApiKey,
}) {
  const results = [];

  // 1. Search Wyzie
  try {
    const params = new URLSearchParams({
      id: String(tmdbId),
      format: "srt",
    });
    if (languages) params.set("language", languages);
    if (mediaType === "tv" && season != null) params.set("season", String(season));
    if (mediaType === "tv" && episode != null) params.set("episode", String(episode));
    if (wyzieApiKey) params.set("key", wyzieApiKey);

    const baseUrl = wyzieApiKey ? "https://sub.wyzie.io/search" : "https://subs.wyzie.ru/search";
    const res = await fetchWithTimeout(`${baseUrl}?${params}`, {}, 10000);
    if (res.ok) {
      const data = await res.json();
      const list = Array.isArray(data) ? data : [];
      list.forEach((r, i) => {
        if (!r.url) return;
        const fullUrl = r.url.startsWith("http")
          ? r.url
          : `https://subs.wyzie.ru${r.url.startsWith("/") ? "" : "/"}${r.url}`;
        const name = r.display_name || r.name || r.release_name || `Subtitle ${i + 1}`;
        results.push({
          file_id: `wyzie_${i}_${encodeURIComponent(fullUrl)}`,
          direct_url: fullUrl,
          file_name: name,
          language: (r.language || "").toLowerCase(),
          release: name,
          uploader: "Wyzie",
          download_count: 0,
          hearing_impaired: !!r.isHearingImpaired,
          ai_translated: !!r.isAiTranslated,
        });
      });
    }
  } catch {}

  // 2. Search SubDL if API key is provided
  if (subdlApiKey) {
    try {
      const params = new URLSearchParams({
        api_key: subdlApiKey,
        tmdb_id: String(tmdbId),
        type: mediaType === "tv" ? "tv" : "movie",
        subs_per_page: "30",
      });
      if (mediaType === "tv" && season != null) params.set("season_number", String(season));
      if (mediaType === "tv" && episode != null) params.set("episode_number", String(episode));
      if (languages) params.set("languages", languages.split("-")[0].toUpperCase());

      const res = await fetchWithTimeout(`https://api.subdl.com/api/v1/subtitles?${params}`, {}, 10000);
      if (res.ok) {
        const data = await res.json();
        (data.subtitles || []).forEach((s) => {
          const downloadUrl = `https://dl.subdl.com${s.url}`;
          results.push({
            file_id: `subdl_${s.sd_id}_${encodeURIComponent(downloadUrl)}`,
            direct_url: downloadUrl,
            file_name: s.name || s.release_name || "Subtitle",
            language: (s.lang || "").toLowerCase(),
            release: s.release_name || s.name || "",
            uploader: s.author || "SubDL",
            download_count: s.downloads || 0,
            hearing_impaired: !!s.hi,
            ai_translated: false,
          });
        });
      }
    } catch {}
  }

  return { ok: true, results };
}

async function downloadSubtitle({ url }) {
  if (!url) return { ok: false, error: "No URL provided" };
  try {
    const res = await fetchWithTimeout(url, { headers: { "User-Agent": "Streambert" } }, 15000);
    if (!res.ok) return { ok: false, error: `Failed to fetch: HTTP ${res.status}` };

    const arrayBuf = await res.arrayBuffer();
    const buf = Buffer.from(arrayBuf);

    // If ZIP file, extract first subtitle
    if (buf.length > 4 && buf[0] === 0x50 && buf[1] === 0x4b) {
      const extracted = extractFirstSubtitleFromZip(buf);
      if (extracted) {
        return { ok: true, content: extracted.data, fileName: extracted.name };
      }
      return { ok: false, error: "Could not find subtitle file inside ZIP" };
    }

    // Direct text / vtt / srt
    return { ok: true, content: buf.toString("utf8"), fileName: "subtitles.srt" };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

module.exports = {
  searchSubtitles,
  downloadSubtitle,
};
