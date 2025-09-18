document.addEventListener("DOMContentLoaded", () => {
    const container = document.getElementById("channel-scroll-container");
    const overlay = document.getElementById("video-overlay");
    const overlayVideo = document.getElementById("video-player");
    const closeBtn = document.getElementById("close-video");
    const miniPlayer = document.getElementById("mini-player");
    const expandBtn = document.getElementById("expand-button");
    const currentTime = document.getElementById("current-time");
    const previewThumbnail = document.getElementById("preview-thumbnail");
    const comingUpText = document.getElementById("coming-up-text");

    // Atualiza hora
    setInterval(() => {
        const now = new Date();
        currentTime.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) +
                                  " " + now.toLocaleDateString();
    }, 1000);

    // Busca canais da API
    fetch("/api/channels")
        .then(res => res.json())
        .then(channels => {
            channels.forEach(ch => {
                const div = document.createElement("div");
                div.classList.add("channel-item");
                div.innerHTML = `<img src="${ch.logo}" alt="${ch.name}"><span>${ch.name}</span>`;
                div.onclick = () => playChannel(ch);
                container.appendChild(div);
            });
        });

    // Função para tocar canal (mini-player + overlay)
    function playChannel(channel) {
        const hlsUrl = `/live/${channel.id}.m3u8`;

        // Atualiza miniatura e nome do canal
        previewThumbnail.src = channel.logo;
        comingUpText.textContent = channel.name;

        // --- Mini-player ---
        if (Hls.isSupported()) {
            const hlsMini = new Hls();
            hlsMini.loadSource(hlsUrl);
            hlsMini.attachMedia(miniPlayer);
            hlsMini.on(Hls.Events.MANIFEST_PARSED, () => miniPlayer.play());
        } else if (miniPlayer.canPlayType("application/vnd.apple.mpegurl")) {
            miniPlayer.src = hlsUrl;
            miniPlayer.addEventListener("loadedmetadata", () => miniPlayer.play());
        }

        // Exibe mini-player
        document.getElementById("play-overlay").style.display = "flex";

        // --- Overlay Fullscreen opcional ---
        overlayVideo.src = hlsUrl;
        overlayVideo.pause(); // inicia apenas quando abrir overlay
    }

    // Botão expandir mini-player para fullscreen
    expandBtn.onclick = () => {
        if (miniPlayer.requestFullscreen) {
            miniPlayer.requestFullscreen();
        } else if (miniPlayer.webkitRequestFullscreen) {
            miniPlayer.webkitRequestFullscreen();
        } else if (miniPlayer.msRequestFullscreen) {
            miniPlayer.msRequestFullscreen();
        }
    };

    // Fechar overlay fullscreen
    closeBtn.onclick = () => {
        overlay.classList.add("hidden");
        overlayVideo.pause();
        overlayVideo.src = "";
    };
});
