const secret = require('../config/secret');
const userConf = require('../config/userconf');
const TelegramBot = require("node-telegram-bot-api");
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const {tgLogger} = require('./logger')();
const isPolling = (!(process.argv.length >= 3 && process.argv[2] === "hook"));
let tgbot;
// if (isPolling) {
tgbot = new TelegramBot(secret.tgCredential.token,
    {polling: {interval: userConf.polling_interval}, request: {proxy: require("../proxy")},});
// tgbot.deleteWebHook();
// } else {
//     tgbot = new TelegramBot(secret.botToken, {
//         webHook: {
//             port: 8443,
//             max_connections: 3,
//             healthEndpoint: "/health",
//             key: "config/srv.pem",
//             cert: "config/cli.pem",
//         },
//         request: {proxy: require("../config/proxy")}
//     });
//     tgbot.setWebHook(`${secret.webHookUrlPrefix}${process.argv[3]}/bot${secret.botToken}`, {
//         drop_pending_updates: true
//         /* Please, remove this line after the bot have ability to control messages between instances!!! */
//     });
//     tgbot.openWebHook();
// }

module.exports = {
    tgbot: tgbot
}