const secret = require('../config/secret');
const {tgLogger} = require('./logger')();
const userConf = require('../config/userconf');
const TelegramBot = require("node-telegram-bot-api");
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const isPolling = (!(process.argv.length >= 3 && process.argv[2] === "hook"));
process.env["NTBA_FIX_350"] = "1";
console.log(`Initiating TG pre-env...`);
let tgbot;
if (isPolling) {
    tgbot = new TelegramBot(secret.tgCredential.token,
        {polling: {interval: 2500}, request: {proxy: require("../proxy")},});
    tgbot.deleteWebHook();
} else {
    tgbot = new TelegramBot(secret.tgCredential.token, {
        webHook: {
            port: 8886,
            max_connections: 3,
            healthEndpoint: "/health",
            key: "config/srv.pem",
            cert: "config/cli.pem",
        },
        request: {proxy: require("../proxy")}
    });
    tgbot.setWebHook(`${secret.tgCredential.webHookPrefix}${process.argv[3]}/bot${secret.tgCredential.token}`, {
        drop_pending_updates: true
        /* Please, remove this line after the bot have ability to control messages between instances!!! */
    });
    tgbot.openWebHook();
}

module.exports = {
    tgbot: tgbot,
    tgBotDo: {
        sendMessage: async (msg, isSilent = false, parseMode = null, form = {}) => {
            await delay(100);
            if (secret.target.tgDefThreadID) form.message_thread_id = secret.target.tgDefThreadID;
            if (isSilent) form.disable_notification = true;
            if (parseMode) form.parse_mode = parseMode;
            return tgbot.sendMessage(secret.target.tgID, msg, form).catch((e) => tgLogger.warn(e.toString()));
        },
        sendChatAction: async (action) => {
            await delay(100);
            return await tgbot.sendChatAction(secret.target.tgID, action,
                secret.target.tgDefThreadID ? {message_thread_id: secret.target.tgDefThreadID} : {}
            ).catch((e) => {
                tgLogger.warn(e.toString());
            });
        },
        revokeMessage: async (msgId) => {
            await delay(100);
            return await tgbot.deleteMessage(secret.target.tgID, msgId).catch((e) => {
                tgLogger.warn(e.toString());
            });
        },
        sendPhoto: async (caption, path, isSilent = false, hasSpoiler = false) => {
            await delay(100);
            let form = {
                caption: caption,
                has_spoiler: hasSpoiler,
                width: 100,
                height: 100,
                parse_mode: "HTML",
            };
            if (secret.target.tgDefThreadID) form.message_thread_id = secret.target.tgDefThreadID;
            if (isSilent) form.disable_notification = true;
            return await tgbot.sendPhoto(secret.target.tgID, path, form, {contentType: 'image/jpeg'}).catch((e) => tgLogger.warn(e.toString()));
        },
        sendMediaGroup: async (caption, arr, isSilent = false, hasSpoiler = false) => {
            await delay(100);
            let form = {
                caption: caption,
                has_spoiler: hasSpoiler,
                width: 100,
                height: 100,
                parse_mode: "HTML",
            };
            if (secret.target.tgDefThreadID) form.message_thread_id = secret.target.tgDefThreadID;
            if (isSilent) form.disable_notification = true;
            return await tgbot.sendMediaGroup(secret.target.tgID, arr, form, {contentType: 'image/jpeg'}).catch((e) => tgLogger.warn(e.toString()));
        },
        editMessageText: async (text, formerMsg) => {
            // await delay(100);
            let form = {
                chat_id: secret.target.tgID,
                message_id: formerMsg.message_id,
                parse_mode: "HTML"
            };
            return await tgbot.editMessageText(text, form).catch((e) => tgLogger.warn(e.toString()));
        },
    }
}