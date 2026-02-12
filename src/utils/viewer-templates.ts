function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
}

export function imageViewerHtml(params: { title: string; mediaUrl: string }): string {
  const title = escapeHtml(params.title)
  const mediaUrl = escapeHtml(params.mediaUrl)

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title}</title>
  <style>
    html, body {
      margin: 0;
      width: 100%;
      height: 100%;
      background: #0f1115;
    }
    body {
      display: grid;
      place-items: center;
      overflow: auto;
    }
    img {
      max-width: 100vw;
      max-height: 100vh;
      object-fit: contain;
      cursor: zoom-in;
      user-select: none;
    }
    img.zoomed {
      max-width: none;
      max-height: none;
      cursor: zoom-out;
    }
  </style>
</head>
<body>
  <img id="media" src="${mediaUrl}" alt="${title}">
  <script>
    const image = document.getElementById("media")
    image?.addEventListener("click", () => {
      image.classList.toggle("zoomed")
    })
  </script>
</body>
</html>`
}

export function videoViewerHtml(params: { title: string; mediaUrl: string; mimeType: string }): string {
  const title = escapeHtml(params.title)
  const mediaUrl = escapeHtml(params.mediaUrl)
  const mimeType = escapeHtml(params.mimeType)

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title}</title>
  <style>
    html, body {
      margin: 0;
      width: 100%;
      height: 100%;
      background: #0f1115;
      color: #e9edf5;
    }
    body {
      display: grid;
      place-items: center;
      padding: 1rem;
      box-sizing: border-box;
    }
    video {
      width: min(100%, 1200px);
      max-height: 100%;
      background: #000;
    }
  </style>
</head>
<body>
  <video controls preload="metadata">
    <source src="${mediaUrl}" type="${mimeType}">
    Your browser does not support the video tag.
  </video>
</body>
</html>`
}

export function plotlyViewerHtml(params: { title: string; mediaUrl: string }): string {
  const title = escapeHtml(params.title)
  const mediaUrl = escapeHtml(params.mediaUrl)

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title}</title>
  <style>
    html, body {
      margin: 0;
      width: 100%;
      height: 100%;
      background: #111318;
      color: #e9edf5;
      font-family: ui-sans-serif, system-ui, sans-serif;
    }
    #chart {
      width: 100vw;
      height: 100vh;
    }
    #error {
      display: none;
      padding: 1rem;
      color: #ff7f7f;
      white-space: pre-wrap;
    }
  </style>
  <script src="https://cdn.plot.ly/plotly-2.35.2.min.js"></script>
</head>
<body>
  <div id="chart"></div>
  <pre id="error"></pre>
  <script>
    const chart = document.getElementById("chart")
    const errorNode = document.getElementById("error")

    async function renderChart() {
      try {
        const response = await fetch("${mediaUrl}", { cache: "no-store" })
        if (!response.ok) {
          throw new Error("Failed to fetch chart spec: HTTP " + response.status)
        }
        const spec = await response.json()
        await Plotly.newPlot(
          "chart",
          spec.data,
          spec.layout,
          spec.config || { responsive: true },
        )
      } catch (error) {
        if (chart) {
          chart.style.display = "none"
        }
        if (errorNode) {
          errorNode.style.display = "block"
          errorNode.textContent = "Unable to render Plotly chart.\n" + (error instanceof Error ? error.message : String(error))
        }
      }
    }

    renderChart()
  </script>
</body>
</html>`
}
