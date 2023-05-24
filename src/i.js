// noinspection JSUnresolvedVariable

const {Bot: MiraiBot, Message: mrMessage} = require('mirai-js');
const secret = require('../config/secret');
// const userConf = require('../config/userconf');
const {qqLogger, tgLogger, defLogger} = require('./logger')('startup');

const {tgbot} = require('./tgbot-pre');
tgbot.on('polling_error', async (e) => {
    tgLogger.warn("Polling - " + e.message.replace("Error: ", ""));
});
tgbot.on('webhook_error', async (e) => {
    tgLogger.warn("Webhook - " + e.message.replace("Error: ", ""));
});
const qqBot = new MiraiBot();

async function sendTestMessage() {
    await qqBot.sendMessage({
        friend: secret.test.targetQNumber, message: new mrMessage().addText('114514')
    });
}

let msgMappings = [];

function addToMsgMappings(tgMsgId, talker, qqMsg) {
    msgMappings.push([tgMsgId, talker, qqMsg]);
    defLogger.trace(`Added temporary mapping from TG msg #${tgMsgId} to QQ ${talker.nickname}`);
}

async function onTGMsg(tgMsg) {
    try {
        if (tgMsg.reply_to_message) {
            for (const mapPair of msgMappings) {
                if (mapPair[0] === tgMsg.reply_to_message.message_id) {
                    await qqBot.sendMessage({
                        // 好友 qq 号
                        friend: mapPair[1].id, // Message 实例，表示一条消息
                        message: new mrMessage().addText(tgMsg.text)
                    });
                    await tgbot.sendChatAction(secret.test.targetTGID, "choose_sticker").catch((e) => {
                        tgLogger.error(e.toString());
                    });
                    defLogger.debug(`Handled a message send-back to ${mapPair[2]}.`);
                    return;
                }
            }
            defLogger.debug(`Unable to send-back due to no match in msgMappings.`);
        } else {
            await tgbot.sendMessage(tgMsg.chat.id, 'Nothing to do upon your message, ' + tgMsg.chat.id);
        }
    } catch (e) {
        tgLogger.warn(`Uncaught Error while handling TG message: ${e.message}`);
    }
}

async function main() {
    await qqBot.open(secret.miraiCredential);
    // await sendTestMessage();
    qqBot.on('FriendMessage', async data => {
        const tgMsg = await tgbot.sendMessage(secret.test.targetTGID, `Got QQ message from:<code>${JSON.stringify(data.sender, null, 2)}</code> Message Chain is: <code>${JSON.stringify(data.messageChain, null, 2)}</code>`, {
            parse_mode: "HTML"
        });
        addToMsgMappings(tgMsg, data.sender, data.messageChain);
        // await qqBot.sendMessage({
        //     friend: data.sender.id,
        //     message: new mrMessage().addText('Echo !'),
        // });
    });
}

tgbot.on('message', onTGMsg);
main().then(r => defLogger.info(`Bootstrap completed. (${r})`));