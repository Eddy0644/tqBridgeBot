//#noinspection JSUnresolvedVariable
const dayjs = require('dayjs');
const {Bot: MiraiBot, Message: mrMessage} = require('mirai-js');
const secret = require('../config/secret');
// const userConf = require('../config/userconf');
const {qqLogger, tgLogger, defLogger} = require('./logger')('startup');

const {tgbot, tgBotDo} = require('./tgbot-pre');
const {STypes, Config} = require('./common');
tgbot.on('polling_error', async (e) => {
    tgLogger.warn("Polling - " + e.message.replace("Error: ", ""));
});
tgbot.on('webhook_error', async (e) => {
    tgLogger.warn("Webhook - " + e.message.replace("Error: ", ""));
});
const qqBot = new MiraiBot();
let state = {
    last: {},
    lastExplicitTalker: null,
    lockTarget: 0,
    prePerson: {
        tgMsg: null,
        name: "",
    },
    // store TG messages which need to be revoked after a period of time
    poolToDelete: [],
};
state.poolToDelete.add = function (tgMsg, delay) {
    if (tgMsg !== null) {
        tgLogger.debug(`Added message #${tgMsg.message_id} to poolToDelete with timer (${delay})sec.`);
        state.poolToDelete.push({tgMsg: tgMsg, toDelTs: (dayjs().unix()) + delay});
    } else {
        tgLogger.debug(`Attempting to add message to poolToDelete with timer (${delay})sec, but got null Object.`);
    }
};

async function sendTestMessage() {
    await qqBot.sendMessage({
        friend: secret.test.targetQNumber, message: new mrMessage().addText('114514')
    });
}

let msgMappings = [];

function addToMsgMappings(tgMsgId, talker, qqMsg) {
    msgMappings.push([tgMsgId, talker, qqMsg]);
    if (state.lockTarget === 0) state.last = {
        s: STypes.Chat,
        target: talker,
        qqMsg,
        tgMsgId
    };
    defLogger.debug(`Added temporary mapping from TG msg #${tgMsgId} to QQ '${talker.nickname}'.`);

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
        } else if (tgMsg.text === "/lock") {
            state.lockTarget = state.lockTarget ? 0 : 1;
            const tgMsg = await tgBotDo.sendMessage(`Already set lock state to ${state.lockTarget}.`, true);
            state.poolToDelete.add(tgMsg, 6);
        } else {
            if (Object.keys(state.last).length === 0) {
                await tgbot.sendMessage(tgMsg.chat.id, 'Nothing to do upon your message, ' + tgMsg.chat.id);
                await tgbot.setMyCommands(Config.TGBotCommands);
            } else if (state.last.s === STypes.Chat) {
                // forward to last talker
                await qqBot.sendMessage({
                    friend: state.last.target.id,
                    message: new mrMessage().addText(tgMsg.text)
                });
                await tgbot.sendChatAction(secret.test.targetTGID, "choose_sticker").catch((e) => {
                    tgLogger.error(e.toString());
                });
                defLogger.debug(`Handled a message send-back to speculative talker:(${state.last.name}).`);
            }
        }
    } catch (e) {
        tgLogger.warn(`Uncaught Error while handling TG message: ${e.message}`);
    }
}

async function main() {
    await qqBot.open(secret.miraiCredential);
    // await sendTestMessage();
    qqBot.on('FriendMessage', async data => {
        const tgMsg = await tgBotDo.sendMessage(`Got QQ message from:<code>${JSON.stringify(data.sender, null, 2)}</code> Message Chain is: <code>${JSON.stringify(data.messageChain, null, 2)}</code>`, false, "HTML");
        addToMsgMappings(tgMsg.message_id, data.sender, data.messageChain);
        // await qqBot.sendMessage({
        //     friend: data.sender.id,
        //     message: new mrMessage().addText('Echo !'),
        // });
    });
}

tgbot.on('message', onTGMsg);
main().then(r => defLogger.info(`Bootstrap completed. (${r})`));