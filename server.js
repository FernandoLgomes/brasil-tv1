const express = require("express");
const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");
const axios = require("axios");

const app = express();
const PORT = process.env.PORT || 3000;

// Pasta HLS
const hlsDir = path.join(__dirname, "hls");
if (!fs.existsSync(hlsDir)) fs.mkdirSync(hlsDir);

const activeFFMPEG = new Map();

// Caminho do FFmpeg
let ffmpegPath = path.join(__dirname, "ffmpeg");

// Middleware CORS
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Range");
  res.header("Access-Control-Expose-Headers", "Content-Length, Content-Range");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

// Servir frontend
app.use(express.static("public"));

// Endpoint canais
app.get("/api/channels", (req, res) => {
  const filePath = path.join(__dirname, "channels.txt");
  fs.readFile(filePath, "utf8", (err, data) => {
    if (err) return res.status(500).json({ error: "Erro ao ler arquivo de canais" });

    const lines = data.split(/\r?\n/);
    const channels = [];

    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startsWith("#EXTINF")) {
        const metaLine = lines[i];
        const urlLine = lines[i + 1];
        const nameMatch = metaLine.match(/tvg-name="([^"]+)"/);
        const logoMatch = metaLine.match(/tvg-logo="([^"]+)"/);
        const name = nameMatch ? nameMatch[1] : "Sem nome";
        const logo = logoMatch ? logoMatch[1] : "";
        const idMatch = urlLine.match(/\/(\d+)\.ts$/);
        const id = idMatch ? idMatch[1] : "";
        channels.push({ name, logo, id, url: urlLine });
        i++;
      }
    }
    res.json(channels);
  });
});

// Proxy HTTPS para streams HTTP
app.get("/proxy", async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).send("URL faltando");

  try {
    const response = await axios({
      url,
      method: "GET",
      responseType: "stream",
    });
    res.setHeader("Content-Type", response.headers["content-type"] || "application/octet-stream");
    response.data.pipe(res);
  } catch (err) {
    console.error("Erro no proxy:", err.message);
    res.status(500).send("Erro no proxy");
  }
});

// Proxy Live TS -> HLS
app.get("/live/:channelId.m3u8", (req, res) => {
  const channelId = req.params.channelId;
  const filePath = path.join(__dirname, "channels.txt");
  const data = fs.readFileSync(filePath, "utf8");
  const lines = data.split(/\r?\n/);
  let channelUrl = null;

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith("#EXTINF") && lines[i + 1].includes(`/${channelId}.ts`)) {
      channelUrl = lines[i + 1];
      break;
    }
  }

  if (!channelUrl) return res.status(404).send("Canal não encontrado");

  const proxiedUrl = `/proxy?url=${encodeURIComponent(channelUrl)}`;
  const channelDir = path.join(hlsDir, channelId);
  const playlist = path.join(channelDir, "index.m3u8");
  if (!fs.existsSync(channelDir)) fs.mkdirSync(channelDir, { recursive: true });

  if (!activeFFMPEG.has(channelId)) {
    const ffmpeg = spawn(ffmpegPath, [
      "-i", proxiedUrl,
      "-c", "copy",
      "-f", "hls",
      "-hls_time", "5",
      "-hls_list_size", "6",
      "-hls_flags", "delete_segments",
      "-hls_segment_filename", path.join(channelDir, "index%d.ts"),
      playlist
    ]);

    ffmpeg.stderr.on("data", data => console.log(`[FFmpeg ${channelId}] ${data.toString()}`));
    ffmpeg.on("close", code => {
      console.log(`[FFmpeg ${channelId}] finalizado com código ${code}`);
      activeFFMPEG.delete(channelId);
    });

    activeFFMPEG.set(channelId, ffmpeg);
  }

  const waitForPlaylist = setInterval(() => {
    if (fs.existsSync(playlist)) {
      clearInterval(waitForPlaylist);
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.sendFile(playlist);
    }
  }, 500);
});

// Servir segmentos
app.use("/hls", express.static(hlsDir));

// Limpeza periódica
setInterval(() => {
  const now = Date.now();
  if (!fs.existsSync(hlsDir)) return;
  fs.readdirSync(hlsDir).forEach(dir => {
    const channelPath = path.join(hlsDir, dir);
    fs.readdirSync(channelPath).forEach(file => {
      const filePath = path.join(channelPath, file);
      const stats = fs.statSync(filePath);
      if (now - stats.mtimeMs > 60 * 1000) fs.unlinkSync(filePath);
    });
  });
}, 30 * 1000);

app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});
