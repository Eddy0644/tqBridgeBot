const secret = require('../config/secret');
const {tgLogger} = require('./logger')();
// const userConf = require('../config/userconf');
const TelegramBot = require("node-telegram-bot-api");
const {httpsCurl} = require('./common');
const fs = require("fs");
const https = require("https");
const agentEr = require("https-proxy-agent");
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
// Updated here to avoid mass amount of polling error occupying logfile.
let errorStat = 0;
tgbot.on('polling_error', async (e) => {
    const msg = "Polling - " + e.message.replace("Error: ", ""), msg2 = `[${new Date().toLocaleTimeString()}|Error]\t`;
    if (errorStat === 0) {
        errorStat = 1;
        setTimeout(async () => {
            if (errorStat === 2) {
                // still have errors after the timer been set up triggered by first error
                await httpsCurl(secret.notification.baseUrl + secret.notification.prompt_network_problematic);
                tgLogger.warn(`Frequent network issue detected! Please check network!\n${msg}`);
            } else {
                // no other error during this period, discarding notify initiation
                errorStat = 0;
                tgLogger.warn(`There may be a temporary network issue but now disappeared. If possible, please check your network config.`);

            }
        }, 10000);
        console.warn(msg2 + msg);
    } else if (errorStat === 1) {
        errorStat = 2;
        console.warn(msg2 + msg);
    } else {
        console.warn(msg2 + msg);
    }
});
tgbot.on('webhook_error', async (e) => {
    tgLogger.warn("Webhook - " + e.message.replace("Error: ", ""));
});
const tgBotDo = {
    // P.S. receiver is a Object with groupId and threadId; chat_id is not tight to threads.
    sendMessage: async (receiver = null, msg, isSilent = false, parseMode = null, form = {}) => {
        await delay(100);
        // if (secret.target.tgDefThreadID) form.message_thread_id = secret.target.tgDefThreadID;
        // noinspection JSUnresolvedVariable
        if (receiver && receiver.tgThreadId) form.message_thread_id = receiver.tgThreadId;
        if (isSilent) form.disable_notification = true;
        if (parseMode) form.parse_mode = parseMode;
        return tgbot.sendMessage(receiver ? receiver.tgGroupId : secret.class.fallback.tgGroupId, msg, form).catch((e) => tgLogger.warn(e.toString()));
    },
    sendChatAction: async (action, receiver = null) => {
        await delay(100);
        const form = {};
        if (receiver && receiver.tgThreadId) form.message_thread_id = receiver.tgThreadId;
        return await tgbot.sendChatAction(receiver ? receiver.tgGroupId : secret.class.fallback.tgGroupId, action, form).catch((e) => {
            tgLogger.warn(e.toString());
        });
    },
    revokeMessage: async (msgId, chat_id) => {
        await delay(100);
        return await tgbot.deleteMessage(chat_id, msgId).catch((e) => {
            tgLogger.warn(e.toString());
        });
    },
    sendPhoto: async (receiver = null, caption, path, isSilent = false, hasSpoiler = false) => {
        await delay(100);
        let form = {
            caption: caption,
            has_spoiler: hasSpoiler,
            width: 100,
            height: 100,
            parse_mode: "HTML",
        };
        // if (secret.target.tgDefThreadID) form.message_thread_id = secret.target.tgDefThreadID;
        // noinspection JSUnresolvedVariable
        if (receiver && receiver.tgThreadId) form.message_thread_id = receiver.tgThreadId;
        if (isSilent) form.disable_notification = true;
        return await tgbot.sendPhoto(receiver ? receiver.tgGroupId : secret.class.fallback.tgGroupId, path, form, {contentType: 'image/gif'}).catch((e) => tgLogger.warn(e.toString()));
    },
    sendAnimation: async (caption, path, isSilent = false, hasSpoiler = false) => {
        await delay(100);
        let form = {
            caption: caption,
            has_spoiler: hasSpoiler,
            width: 100,
            height: 100,
            parse_mode: "HTML",
        };
        if (secret.target.sticker_topic_ID) form.message_thread_id = secret.target.sticker_topic_ID;
        else if (secret.target.tgDefThreadID) form.message_thread_id = secret.target.tgDefThreadID;
        if (isSilent) form.disable_notification = true;
        return await tgbot.sendAnimation(secret.target.tgID, path, form, {contentType: 'image/gif'}).catch((e) => tgLogger.warn(e.toString()));
    },
    sendMediaGroup:/* Not used */ async (caption, arr, isSilent = false, hasSpoiler = false) => {
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


    downFromCloud: async function (fileCloudPath, pathName) {
        return new Promise((resolve, reject) => {
            const file = fs.createWriteStream(pathName);
            const agent = new agentEr.HttpsProxyAgent(require("../proxy"));
            https.get(`https://api.telegram.org/file/bot${secret.tgCredential.token}/${fileCloudPath}`, {agent: agent}, (response) => {
                response.pipe(file);
                file.on('finish', () => {
                    file.close();
                    resolve("SUCCESS");
                });
            }).on('error', (error) => {
                fs.unlink(pathName, () => reject(error));
            });
        });

    }
}
module.exports = {
    tgbot,
    tgBotDo,
}