/**
 * Venom v6 - Comprehensive Test Suite (No Auth Required)
 * Tests: QR generation, WAPI injection, module availability
 */
const puppeteer = require('puppeteer');
const { launchBrowser, initPage, waitForReady, waitForSocketReady, needsAuth, getQRCode, injectWAPI } = require('./dist/controllers/browser');
const { createConfig } = require('./dist/config');

let testResults = { passed: 0, failed: 0, tests: [] };

function test(name, result, details = '') {
  if (result) {
    testResults.passed++;
    testResults.tests.push({ name, status: 'PASS', details });
    console.log(`✅ ${name}`);
  } else {
    testResults.failed++;
    testResults.tests.push({ name, status: 'FAIL', details });
    console.log(`❌ ${name} - ${details}`);
  }
}

async function runTests() {
  console.log('=== VENOM v6 COMPREHENSIVE TEST ===\n');
  
  let browser;
  const config = createConfig({ session: 'test-comprehensive', headless: true });
  
  try {
    // === BROWSER & PAGE TESTS ===
    console.log('--- BROWSER & PAGE TESTS ---');
    
    browser = await launchBrowser(config);
    test('Browser launched', !!browser);
    
    const page = await initPage(browser, config);
    test('Page initialized', !!page);
    
    const ready = await waitForReady(page, 30000);
    test('WhatsApp Web ready', ready);
    
    // === SOCKET STATE TESTS ===
    console.log('\n--- SOCKET STATE TESTS ---');
    
    const socketState = await waitForSocketReady(page, 30000);
    test('Socket state detected', !!socketState, `State: ${socketState}`);
    
    const needsAuthResult = await needsAuth(page);
    test('needsAuth detection works', typeof needsAuthResult === 'boolean', `Needs auth: ${needsAuthResult}`);
    
    // === QR CODE TESTS ===
    console.log('\n--- QR CODE TESTS ---');
    
    if (needsAuthResult) {
      const qrData = await getQRCode(page);
      test('QR code generated', !!qrData, `Length: ${qrData?.length || 0}`);
      test('QR has correct format (5 parts)', qrData && qrData.split(',').length === 5, `Parts: ${qrData?.split(',').length}`);
      
      if (qrData) {
        const parts = qrData.split(',');
        test('QR part 1 (ref) exists', parts[0]?.length > 0);
        test('QR part 2 (staticKey) exists', parts[1]?.length > 0);
        test('QR part 3 (identityKey) exists', parts[2]?.length > 0);
        test('QR part 4 (advSecret) exists', parts[3]?.length > 0);
        test('QR part 5 (platform) exists', parts[4]?.length > 0);
      }
    } else {
      test('QR code skipped (already logged in)', true);
    }
    
    // === WAPI INJECTION TESTS ===
    console.log('\n--- WAPI INJECTION TESTS ---');
    
    await injectWAPI(page);
    
    const wapiCheck = await page.evaluate(() => {
      const W = window;
      if (!W.WWebJS) return { exists: false };
      
      return {
        exists: true,
        functions: Object.keys(W.WWebJS).filter(k => typeof W.WWebJS[k] === 'function'),
        helpers: Object.keys(W.WWebJS).filter(k => k.startsWith('_'))
      };
    });
    
    test('WWebJS injected', wapiCheck.exists);
    test('WWebJS has functions', wapiCheck.functions?.length > 0, `Count: ${wapiCheck.functions?.length || 0}`);
    
    // Check critical functions
    const criticalFunctions = [
      'sendTextMessage', 'sendMediaMessage', 'getAllChats', 'getAllContacts',
      'getMessagesInChat', 'sendSeen', 'deleteMessage', 'blockContact',
      'createGroup', 'logout', 'getConnectionState', 'getHostDevice', 'getWAVersion'
    ];
    
    for (const fn of criticalFunctions) {
      const exists = wapiCheck.functions?.includes(fn);
      test(`Function: ${fn}`, exists);
    }
    
    // === MODULE AVAILABILITY TESTS ===
    console.log('\n--- MODULE TESTS ---');
    
    const modules = await page.evaluate(() => {
      const W = window;
      const results = {};
      
      const moduleNames = [
        'WAWebSocketModel', 'WAWebConnModel', 'WAWebCollections',
        'WAWebSendMsgChatAction', 'WAWebSendMediaChatAction', 'WAWebCmd',
        'WAWebWidFactory', 'WAWebChatForwardMessage', 'WAWebStreamModel'
      ];
      
      for (const name of moduleNames) {
        try {
          const mod = W.require(name);
          results[name] = mod ? 'EXISTS' : 'NULL';
        } catch {
          results[name] = 'NULL';
        }
      }
      
      // Check WAWebCollections structure
      try {
        const collections = W.require('WAWebCollections');
        if (collections) {
          results['Collections.Msg'] = collections.Msg ? 'EXISTS' : 'NULL';
          results['Collections.Chat'] = collections.Chat ? 'EXISTS' : 'NULL';
          results['Collections.Contact'] = collections.Contact ? 'EXISTS' : 'NULL';
        }
      } catch {}
      
      return results;
    });
    
    for (const [module, status] of Object.entries(modules)) {
      test(`Module: ${module}`, status === 'EXISTS', status);
    }
    
    // === WAPI FUNCTION EXECUTION TESTS ===
    console.log('\n--- WAPI EXECUTION TESTS ---');
    
    // Test functions that can run without authentication
    const execTests = await page.evaluate(async () => {
      const W = window;
      const results = {};
      
      try {
        results.getConnectionState = W.WWebJS.getConnectionState();
      } catch (e) {
        results.getConnectionState = 'ERROR: ' + e.message;
      }
      
      try {
        results.getHostDevice = W.WWebJS.getHostDevice();
      } catch (e) {
        results.getHostDevice = 'ERROR: ' + e.message;
      }
      
      try {
        results.getWAVersion = W.WWebJS.getWAVersion();
      } catch (e) {
        results.getWAVersion = 'ERROR: ' + e.message;
      }
      
      try {
        results.getAllChats = W.WWebJS.getAllChats();
      } catch (e) {
        results.getAllChats = 'ERROR: ' + e.message;
      }
      
      try {
        results.getAllContacts = W.WWebJS.getAllContacts();
      } catch (e) {
        results.getAllContacts = 'ERROR: ' + e.message;
      }
      
      try {
        results.getBlockList = W.WWebJS.getBlockList();
      } catch (e) {
        results.getBlockList = 'ERROR: ' + e.message;
      }
      
      return results;
    });
    
    test('getConnectionState executes', typeof execTests.getConnectionState === 'string', execTests.getConnectionState);
    test('getHostDevice executes', execTests.getHostDevice !== undefined && !execTests.getHostDevice?.toString().startsWith('ERROR'), JSON.stringify(execTests.getHostDevice)?.slice(0, 50));
    test('getWAVersion executes', execTests.getWAVersion && !execTests.getWAVersion.toString().startsWith('ERROR'), execTests.getWAVersion);
    test('getAllChats returns array', Array.isArray(execTests.getAllChats), `Length: ${execTests.getAllChats?.length || 0}`);
    test('getAllContacts returns array', Array.isArray(execTests.getAllContacts), `Length: ${execTests.getAllContacts?.length || 0}`);
    test('getBlockList returns array', Array.isArray(execTests.getBlockList), `Length: ${execTests.getBlockList?.length || 0}`);
    
    // === ERROR HANDLING TESTS ===
    console.log('\n--- ERROR HANDLING TESTS ---');
    
    const errorTests = await page.evaluate(async () => {
      const W = window;
      const results = {};
      
      // Test sendTextMessage with invalid chat
      try {
        await W.WWebJS.sendTextMessage('invalid@test', 'test');
        results.sendTextInvalid = 'SHOULD_HAVE_THROWN';
      } catch (e) {
        results.sendTextInvalid = 'CAUGHT: ' + e.message.slice(0, 50);
      }
      
      // Test getChat with invalid ID
      try {
        const chat = W.WWebJS._getChat('nonexistent@g.us');
        results.getChatInvalid = chat === undefined ? 'OK' : 'UNEXPECTED';
      } catch (e) {
        results.getChatInvalid = 'ERROR: ' + e.message;
      }
      
      return results;
    });
    
    test('sendTextMessage handles invalid chat', errorTests.sendTextInvalid?.startsWith('CAUGHT'), errorTests.sendTextInvalid);
    test('_getChat handles invalid ID', errorTests.getChatInvalid === 'OK', errorTests.getChatInvalid);
    
  } catch (err) {
    test('No unexpected errors', false, err.message);
    console.error('Stack:', err.stack);
  } finally {
    if (browser) {
      try {
        await browser.close();
        test('Browser closed', true);
      } catch (e) {
        test('Browser closed', false, e.message);
      }
    }
  }
  
  // === SUMMARY ===
  console.log('\n=== TEST SUMMARY ===');
  console.log(`✅ Passed: ${testResults.passed}`);
  console.log(`❌ Failed: ${testResults.failed}`);
  console.log(`Total: ${testResults.passed + testResults.failed}`);
  
  if (testResults.failed > 0) {
    console.log('\nFailed tests:');
    testResults.tests.filter(t => t.status === 'FAIL').forEach(t => console.log(`  - ${t.name}: ${t.details}`));
    process.exit(1);
  } else {
    console.log('\n🎉 ALL TESTS PASSED!');
    process.exit(0);
  }
}

setTimeout(() => { console.error('\n⏰ Timeout'); process.exit(1); }, 90000);
runTests();
