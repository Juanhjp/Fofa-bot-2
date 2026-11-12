
require("dotenv").config();

module.exports = {
  botName: process.env.BOT_NAME || "FOFA BOATE 2",
  adminNumber: (process.env.ADMIN_NUMBER || "").replace(/\D/g, ""),
  autoReplyDefault: process.env.AUTO_REPLY_DEFAULT === "true"
};
