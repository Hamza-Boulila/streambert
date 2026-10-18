# Streambert (Web & Docker Edition)

[![GitHub](https://img.shields.io/badge/GitHub-Hamza--Boulila%2Fstreambert-181717?style=for-the-badge&logo=github)](https://github.com/Hamza-Boulila/streambert)
[![Docker](https://img.shields.io/badge/Docker-Ready-2496ED?style=for-the-badge&logo=docker&logoColor=white)](https://github.com/Hamza-Boulila/streambert)
[![License: GPL-3.0](https://img.shields.io/badge/License-GPL--3.0-blue.svg?style=for-the-badge)](LICENSE)
[![Node.js Version](https://img.shields.io/badge/Node.js-22%2B-339933?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org/)

A modern, self-hosted web application and Docker container to stream any Movie, TV Series, or Anime in the world with zero ads and zero tracking.

> **Fork Information:** This repository is an open-source, web-native fork of [truelockmc/streambert](https://github.com/truelockmc/streambert). Streambert was originally designed as an Electron desktop application; this fork converts it into a browser-native web app that can be self-hosted on any server, homelab, VPS, or cloud platform via Docker, Docker Compose, Dokploy, Coolify, or Portainer.

![Logo](public/logo.svg)

---

## ✨ Features

- 🎦 **Universal Streaming:** Stream Movies, TV Shows, and Anime directly in any modern browser on desktop, tablet, or mobile.
- 🐳 **Self-Host Anywhere:** One-command deployment with Docker, Docker Compose, Dokploy, Coolify, or Portainer.
- 🛡️ **Zero Ads & Trackers:** Clean, built-in protection against popup ads, redirects, and third-party trackers.
- 🍿 **Rich TMDB Metadata:** Fast search, detailed overviews, cast information, trailer modal previews, and ratings sourced from TMDB.
- 🌸 **Anime Support:** Automatically detects anime and routes metadata from [AniList](https://anilist.co/) with streams sourced from AllManga.
- 📃 **Subtitles:** Multi-language subtitle integration with Wyzie and SubDL search.
- 📚 **Personal Library:** Save titles to your watchlist, track your watched history, and browse custom categories.
- 🎨 **Modern Responsive UI:** Dark-mode glassmorphic aesthetic, trending carousel, responsive layout, and customizable themes.

---

## 🐳 Quick Start with Docker

### 1. Using Docker Compose (Recommended)

1. **Clone the repository:**
   ```bash
   git clone https://github.com/Hamza-Boulila/streambert.git
   cd streambert
   ```

2. **Configure your TMDB API Key:**
   Copy `.env.example` to `.env` (or `.env.local`):
   ```bash
   cp .env.example .env
   ```
   Open `.env` and add your [free TMDB Read Access Token](https://www.themoviedb.org/settings/api):
   ```ini
   TMDB_API_KEY=your_tmdb_read_access_token_here
   PORT=3000
   ```
   *(Note: Setting `TMDB_API_KEY` in `.env` is optional. If left blank, you will simply be prompted to enter it once in the web UI on first launch).*

3. **Start the container:**
   ```bash
   docker compose up -d
   ```

4. **Open Streambert:**
   Navigate to **[http://localhost:3000](http://localhost:3000)** in your browser.

---

### 2. Run with Docker CLI

```bash
docker build -t streambert-web .
docker run -d \
  --name streambert \
  -p 3000:3000 \
  -e PORT=3000 \
  -e TMDB_API_KEY="your_tmdb_read_access_token_here" \
  -v streambert_downloads:/app/downloads \
  --restart unless-stopped \
  streambert-web
```

---

## 🚀 Self-Hosting on PaaS Platforms (Dokploy, Coolify, Portainer)

Streambert is designed to deploy seamlessly from Git across popular self-hosting dashboards:

### Dokploy / Coolify
1. In your dashboard, create a new **Application**.
2. Select **Source:** `Git Repository`.
3. Enter repository URL: `https://github.com/Hamza-Boulila/streambert.git` (branch: `main`).
4. Set **Build Type:** `Dockerfile` (or `Docker Compose`).
5. Set **Port:** `3000`.
6. Add Environment Variables:
   - `TMDB_API_KEY`: *(Your TMDB API Read Access Token)*
7. Click **Deploy**. The platform will automatically build the multi-stage image and expose the web app.

### Portainer Stacks
1. Open Portainer > **Stacks** > **Add stack**.
2. Choose **Repository** and provide `https://github.com/Hamza-Boulila/streambert.git`.
3. Set Compose path to `docker-compose.yml`.
4. Add environment variables if desired and click **Deploy the stack**.

---

## 💻 Running Locally without Docker

If you want to run or develop Streambert directly on your machine with Node.js:

### Prerequisites
- [Node.js](https://nodejs.org/) (>= 20.0.0)
- npm (>= 10.0.0)

### Steps
1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Configure environment:**
   Create a `.env` or `.env.local` file:
   ```ini
   PORT=3000
   TMDB_API_KEY=your_tmdb_token_here
   ```

3. **Build the web frontend:**
   ```bash
   npm run build
   ```

4. **Start the production server:**
   ```bash
   npm start
   ```
   The application is live at **http://localhost:3000**.

5. **Local Development (Vite Dev Server with HMR):**
   ```bash
   npm run dev
   ```

---

## ⚙️ Environment Variables

| Variable | Required | Default | Description |
| :--- | :---: | :---: | :--- |
| `PORT` | Optional | `3000` | Port for the web server to listen on. |
| `TMDB_API_KEY` | Optional | *None* | TMDB v4 Read Access Token (JWT) or v3 API Key. If unset, can be configured in the UI. |
| `NODE_ENV` | Optional | `production` | Node environment (`production` or `development`). |

---

## 🛠️ How Streambert Web Works

This web fork replaces the Electron desktop layer with web-standard browser APIs and a Node.js backend:

- **Browser WebAdapter (`src/utils/webAdapter.js`):** Emulates Electron IPC APIs via browser-native mechanisms (`localStorage`, Web Notification API, HTML5 Fullscreen API, and window messaging).
- **Iframe Video Embeds:** Replaced Electron `<webview>` elements with responsive HTML5 `<iframe>` embeds configured with standard media permissions (`accelerometer`, `autoplay`, `encrypted-media`, `fullscreen`).
- **Express Backend Server (`server.js`):** High-efficiency static file server with Single-Page Application (SPA) routing, environment variable configuration endpoint (`/api/config`), and container health monitoring (`/api/health`).
- **AllManga Anime Proxy (`src/server/allmangaService.js`):** Server-side GraphQL resolver for AllManga anime streams with HTTP 206 Partial Content range support.
- **Subtitle Extraction (`src/server/subtitlesService.js`):** SubDL and Wyzie API search integration and server-side subtitle archive handling.
- **Minimal Docker Footprint:** Multi-stage build based on lightweight `node:22-alpine` running as non-root user `node`.

---

## 🔑 Getting a Free TMDB API Key

Streambert uses The Movie Database (TMDB) for posters, descriptions, ratings, and search:
1. Create a free account at [themoviedb.org](https://www.themoviedb.org/signup).
2. Go to **Settings > API** ([themoviedb.org/settings/api](https://www.themoviedb.org/settings/api)).
3. Generate an API Key (choose "Developer").
4. Copy the **API Read Access Token (v4 auth)** and paste it into `.env` (or directly into Streambert when prompted).

---

## 📁 Project Structure

```
streambert/
├── Dockerfile                  # Multi-stage production container definition
├── docker-compose.yml          # Container configuration with healthchecks
├── server.js                   # Express backend server (SPA & streaming APIs)
├── package.json                # Dependencies and scripts
├── .env.example                # Configuration template
├── public/                     # Static icons, logos, and fonts
└── src/
    ├── main.jsx                # Application root entry point
    ├── App.jsx                 # Core routing, state management, and shell
    ├── components/             # Reusable UI components (Sidebar, Search, etc.)
    ├── pages/                  # Views (HomePage, MoviePage, TVPage, Settings)
    ├── server/                 # Backend proxy services (AllManga, Subtitles)
    └── utils/                  # WebAdapter, TMDB API, storage, appearance
```

---

## ⚖️ Legal & Privacy Disclaimer

**Streambert is for educational and personal use only.**
- Streambert does not host, store, or distribute any media files or video streams.
- All metadata is provided by TMDB and AniList.
- All video streams are aggregated from third-party publicly accessible services.
- Users are solely responsible for ensuring compliance with applicable copyright and local regulations in their jurisdiction.
- Streambert collects zero personal data, contains zero telemetry, and is completely ad-free.

---

## 📄 License

This project is licensed under the **GNU General Public License v3.0 (GPL-3.0)**. See the [LICENSE](LICENSE) file for details.
