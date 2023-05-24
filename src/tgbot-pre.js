const secret = require('../config/secret');
const {tgLogger} = require('./logger');
const userConf = require('../config/userconf');
const TelegramBot = require("node-telegram-bot-api");
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const isPolling = (!(process.argv.length >= 3 && process.argv[2] === "hook"));
process.env["NTBA_FIX_350"] = "1";

let tgbot;
if (isPolling) {
    tgbot = new TelegramBot(secret.tgCredential.token,
        {polling: {interval: 4000}, request: {proxy: require("../proxy")},});
    tgbot.deleteWebHook();
} else {
    // tgbot = new TelegramBot(secretConfig.botToken, {
    //     webHook: {
    //         port: 8443,
    //         max_connections: 3,
    //         healthEndpoint: "/health",
    //         key: "config/srv.pem",
    //         cert: "config/cli.pem",
    //     },
    //     request: {proxy: require("../proxy")}
    // });
    // tgbot.setWebHook(`${secretConfig.webHookUrlPrefix}${process.argv[3]}/bot${secretConfig.botToken}`, {
    //     drop_pending_updates: true
    //     /* Please, remove this line after the bot have ability to control messages between instances!!! */
    // });
    // tgbot.openWebHook();
}

module.exports = {
    tgbot: tgbot,
    tgBotDo: {
        sendMessage: async (msg, isSilent = false, parseMode = null, form = {}) => {
            await delay(100);
            if (isSilent) form.disable_notification = true;
            if (parseMode) form.parse_mode = parseMode;
            return tgbot.sendMessage(secret.test.targetTGID, msg, form).catch((e) => tgLogger.error(e.toString()));
        },
        sendChatAction: async (action) => {
            await delay(100);
            return await tgbot.sendChatAction(secret.test.targetTGID, action).catch((e) => {
                tgLogger.error(e.toString());
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
            if (isSilent) form.disable_notification = true;
            return await tgbot.sendPhoto(secret.test.targetTGID, path, form, {contentType: 'image/jpeg'}).catch((e) => tgLogger.error(e.toString()));
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
            if (isSilent) form.disable_notification = true;
            return await tgbot.sendMediaGroup(secret.test.targetTGID, arr, form, {contentType: 'image/jpeg'}).catch((e) => tgLogger.error(e.toString()));
        },
    }
}