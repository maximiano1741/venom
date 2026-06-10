/**
 * Postinstall script — downloads Chromium automatically
 * Puppeteer already bundles Chromium on `npm install`, this is a fallback/check
 */
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const CHROMIUM_DIR = path.join(__dirname, '..', '.chromium');

async function downloadChromium() {
  // If puppeteer already downloaded its browser, skip
  try {
    const puppeteer = require('puppeteer');
    const executablePath = puppeteer.executablePath();
    if (fs.existsSync(executablePath)) {
      console.log(`[venom] Chromium already available at: ${executablePath}`);
      return;
    }
  } catch (e) {
    // puppeteer not yet installed, continue
  }

  try {
    // Use @puppeteer/browsers (bundled with puppeteer) to download
    const { detectBrowserPlatform, resolveBuildId, install, Browser, getInstalledBrowsers } = require('@puppeteer/browsers');

    const platform = detectBrowserPlatform();
    const buildId = await resolveBuildId(Browser.CHROME, platform, 'stable');

    console.log(`[venom] Downloading Chromium (${platform}, build ${buildId})...`);

    const result = await install({
      browser: Browser.CHROME,
      buildId,
      cacheDir: CHROMIUM_DIR,
    });

    console.log(`[venom] Chromium downloaded to: ${result.executablePath}`);
  } catch (err) {
    console.warn(`[venom] Warning: Could not download Chromium: ${err.message}`);
    console.warn(`[venom] You may need to install Chrome/Chromium manually.`);
  }
}

downloadChromium();
