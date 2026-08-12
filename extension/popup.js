const DEFAULT_APP_URL = "http://localhost:4173";

async function configuredUrl() {
  const values = await chrome.storage.local.get({ appUrl: DEFAULT_APP_URL });
  try {
    const url = new URL(values.appUrl);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('unsupported protocol');
    return url.href;
  } catch {
    return DEFAULT_APP_URL;
  }
}

async function renderDestination() {
  const url = new URL(await configuredUrl());
  document.querySelector("#destination").textContent = url.hostname === "localhost" || url.hostname === "127.0.0.1"
    ? "Local editor"
    : url.hostname;
}

document.querySelector("#open-editor").addEventListener("click", async () => {
  await chrome.tabs.create({ url: await configuredUrl() });
  window.close();
});

document.querySelector("#open-options").addEventListener("click", () => chrome.runtime.openOptionsPage());
void renderDestination();
