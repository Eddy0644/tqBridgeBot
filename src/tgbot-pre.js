const secret = require('../config/secret');
const userConf = require('../config/userconf');
const TelegramBot = require("node-telegram-bot-api");
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
    tgbot: tgbot
}