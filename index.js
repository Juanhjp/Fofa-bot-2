
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion
} = require("@whiskeysockets/baileys");

const pino = require("pino");
const qrcode = require("qrcode-terminal");
const fs = require("fs");
const path = require("path");
const config = require("./config");

const AUTH_DIR = path.join(__dirname, "..", "auth_info");
const STATE_FILE = path.join(__dirname, "..", "bot-state.json");

let autoReply = config.autoReplyDefault;

try {
  if (fs.existsSync(STATE_FILE)) {
    const saved = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
    if (typeof saved.autoReply === "boolean") {
      autoReply = saved.autoReply;
    }
  }
} catch (error) {
  console.error("Erro ao ler estado:", error.message);
}

function saveState() {
  fs.writeFileSync(
    STATE_FILE,
    JSON.stringify({ autoReply }, null, 2)
  );
}

function isAdmin(senderJid) {
  if (!config.adminNumber) return false;

  const senderNumber = (senderJid || "")
    .split("@")[0]
    .split(":")[0]
    .replace(/\D/g, "");

  return senderNumber === config.adminNumber;
}

function getText(message) {
  const m = message.message || {};

  return (
    m.conversation ||
    m.extendedTextMessage?.text ||
    m.imageMessage?.caption ||
    m.videoMessage?.caption ||
    m.documentMessage?.caption ||
    ""
  ).trim();
}

async function startBot() {
  const { state, saveCreds } =
    await useMultiFileAuthState(AUTH_DIR);

  let version;

  try {
    ({ version } = await fetchLatestBaileysVersion());
  } catch {
    version = undefined;
  }

  const sock = makeWASocket({
    version,
    auth: state,
    logger: pino({ level: "silent" }),
    printQRInTerminal: false,
    browser: [config.botName, "Chrome", "1.0.0"],
    markOnlineOnConnect: false
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", ({
    connection,
    lastDisconnect,
    qr
  }) => {
    if (qr) {
      console.log("Escaneie o QR Code abaixo:");
      qrcode.generate(qr, { small: true });
    }

    if (connection === "open") {
      console.log(config.botName + " conectado!");
    }

    if (connection === "close") {
      const status =
        lastDisconnect?.error?.output?.statusCode;

      const reconnect =
        status !== DisconnectReason.loggedOut;

      if (reconnect) {
        console.log("Reconectando...");
        setTimeout(startBot, 3000);
      } else {
        console.log("Sessão encerrada. Será necessário conectar novamente.");
      }
    }
  });

  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify") return;

    for (const msg of messages) {
      if (!msg.message || msg.key.fromMe) continue;

      const jid = msg.key.remoteJid;

      if (
        !jid ||
        jid === "status@broadcast" ||
        jid.endsWith("@g.us")
      ) continue;

      const text = getText(msg);
      const admin = isAdmin(jid);

      if (admin && text.toLowerCase() === "!auto on") {
        autoReply = true;
        saveState();

        await sock.sendMessage(jid, {
          text: "Respostas automáticas ativadas!"
        });

        continue;
      }

      if (admin && text.toLowerCase() === "!auto off") {
        autoReply = false;
        saveState();

        await sock.sendMessage(jid, {
          text: "Respostas automáticas desativadas!"
        });

        continue;
      }

      if (text.startsWith("!video ")) {
        await sock.sendMessage(jid, {
          text: "Comando de vídeo recebido. A integração de download será configurada na próxima etapa. Baixe somente conteúdos autorizados."
        });

        continue;
      }

      if (text.startsWith("!musica ")) {
        await sock.sendMessage(jid, {
          text: "Comando de música recebido. A integração de áudio será configurada na próxima etapa. Use somente conteúdos autorizados."
        });

        continue;
      }

      if (autoReply && !admin && text) {
        await sock.sendMessage(jid, {
          text: `Olá! Eu sou o ${config.botName}. Recebi sua mensagem!`
        });
      }
    }
  });
}

if (!config.adminNumber) {
  console.warn(
    "Configure ADMIN_NUMBER antes de usar os comandos administrativos."
  );
}

startBot().catch(error => {
  console.error("Erro ao iniciar:", error);
  process.exit(1);
});
