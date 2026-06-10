const puppeteer = require('puppeteer');
const { launchBrowser, initPage, waitForReady, waitForSocketReady } = require('./dist/controllers/browser');
const { createConfig } = require('./dist/config');

async function findModules() {
  const config = createConfig({ session: 'find-modules', headless: true });
  const browser = await launchBrowser(config);
  const page = await initPage(browser, config);
  await waitForReady(page, 30000);
  await waitForSocketReady(page, 15000);

  // Search for media/send related modules
  const results = await page.evaluate(() => {
    const W = window;
    const found = {};
    
    // Try different media module names
    const mediaNames = [
      'WAWebSendMediaChatAction', 'WAWebMediaSendAction', 'WAWebSendMediaAction',
      'WAWebSendMedia', 'WAWebMediaChatAction', 'WAWebMediaUpload',
      'WAWebSendPhotoAction', 'WAWebSendDocumentAction', 'WAWebSendVideoAction'
    ];
    
    for (const name of mediaNames) {
      try {
        const mod = W.require(name);
        if (mod) found[name] = Object.keys(mod).slice(0, 10);
      } catch {}
    }
    
    // Try forward module names
    const forwardNames = [
      'WAWebChatForwardMessage', 'WAWebForwardMessage', 'WAWebForwardMsg',
      'WAWebForwardMessageAction', 'WAWebMsgForward', 'WAWebForwardMsgAction'
    ];
    
    for (const name of forwardNames) {
      try {
        const mod = W.require(name);
        if (mod) found[name] = Object.keys(mod).slice(0, 10);
      } catch {}
    }
    
    // Also search in WAWebSendMsgChatAction for media functions
    try {
      const sendMsgAction = W.require('WAWebSendMsgChatAction');
      if (sendMsgAction) {
        found['WAWebSendMsgChatAction'] = Object.keys(sendMsgAction);
      }
    } catch {}
    
    // Search all modules for "send" or "media" or "forward"
    try {
      const allModules = [];
      // Try to enumerate module IDs
      if (typeof W.webpackChunkwhatsapp_web_client !== 'undefined') {
        found.hasWebpack = true;
      }
    } catch {}
    
    return found;
  });
  
  console.log('Found modules:', JSON.stringify(results, null, 2));
  await browser.close();
  process.exit(0);
}

setTimeout(() => { console.error('Timeout'); process.exit(1); }, 60000);
findModules();
