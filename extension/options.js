const DEFAULT_APP_URL = "http://localhost:4173";
const form = document.querySelector("#settings-form");
const input = document.querySelector("#app-url");
const status = document.querySelector("#save-status");

chrome.storage.local.get({ appUrl: DEFAULT_APP_URL }).then(({ appUrl }) => { input.value = appUrl; });

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const url = new URL(input.value);
  if (!['http:', 'https:'].includes(url.protocol)) {
    input.setCustomValidity("Use an HTTP or HTTPS URL.");
    input.reportValidity();
    return;
  }
  input.setCustomValidity("");
  await chrome.storage.local.set({ appUrl: url.href });
  status.textContent = "Saved";
  window.setTimeout(() => { status.textContent = ""; }, 2500);
});
