/**
 * Venom v6 - Live Test: Scan QR and test real messaging
 */
const { create } = require('./dist');

async function liveTest() {
  console.log('=== VENOM v6 - LIVE TEST ===');
  console.log('Escaneie o QR code com seu WhatsApp!\n');

  const client = await create({
    session: 'live-test',
    headless: true,
    logQR: true,
    browser: 'edge', // 'chromium' (default) | 'chrome' | 'edge' | 'firefox'
    catchQR: (qr, ascii, attempt) => {
      console.log(`\n--- QR Code (tentativa ${attempt}) ---`);
      console.log(ascii);
      console.log('Escaneie com WhatsApp > Aparelhos conectados > Conectar aparelho\n');
    },
    statusFind: (status) => {
      console.log(`Status: ${status}`);
    }
  });

  console.log('\n✅ Conectado! Aguardando chats carregarem...\n');

  // Wait for chats to be loaded (max 30s)
  let chats = [];
  for (let i = 0; i < 30; i++) {
    chats = await client.getAllChats();
    if (chats && chats.length > 0) break;
    await new Promise((r) => setTimeout(r, 1000));
  }

  // Get host info
  const host = await client.getHostDevice();
  console.log('Telefone conectado:', host?.wid?.user || host?.me?.user || host?.me?._serialized || 'N/A');
  console.log('Nome:', host?.pushname || host?.me?.pushname || 'N/A');

  console.log(`Chats encontrados: ${chats?.length || 0}`);

  // Get contacts
  let contacts = [];
  try {
    contacts = await client.getAllContacts();
    console.log(`Contatos encontrados: ${contacts?.length || 0}`);
  } catch (e) {
    console.log(`Contatos: erro - ${e.message}`);
  }

  // List first 5 chats
  if (chats && chats.length > 0) {
    console.log('\n--- Últimos 5 chats ---');
    const lastChats = chats.slice(0, 5);
    for (const chat of lastChats) {
      const name = chat.name || chat.contact?.name || chat.id?.user || 'Sem nome';
      const unread = chat.unreadCount || 0;
      console.log(`  ${name} (${chat.id?._serialized || chat.id}) - ${unread} não lidas`);
    }
  }

  // WA Version
  const version = await client.getWAVersion();
  console.log(`\nWhatsApp Web versão: ${version}`);

  // Listen for messages
  console.log('\n--- Aguardando mensagens (Ctrl+C para sair) ---\n');
  
  client.onMessage((msg) => {
    console.log(`\n📨 Nova mensagem de: ${msg.from}`);
    console.log(`   Tipo: ${msg.type}`);
    console.log(`   Texto: ${msg.body || '(mídia)'}`);
  });

  client.onAck((msg, ack) => {
    const ackNames = { 0: 'PENDING', 1: 'SENT', 2: 'RECEIVED', 3: 'READ', 4: 'PLAYED' };
    console.log(`✅ Ack: ${ackNames[ack] || ack} - ${msg.id?._serialized}`);
  });

  // Keep alive
  process.on('SIGINT', async () => {
    console.log('\n\nFechando...');
    await client.close();
    process.exit(0);
  });

  console.log('Pronto! Envie mensagens pro número conectado pra testar.');
}

setTimeout(() => { console.log('Timeout'); process.exit(1); }, 300000); // 5 min
liveTest().catch(e => { console.error('Error:', e.message); process.exit(1); });
