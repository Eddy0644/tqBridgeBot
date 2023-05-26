//#noinspection JSUnresolvedVariable
const dayjs = require('dayjs');
const {Bot: MiraiBot, Message: mrMessage, Middleware} = require('mirai-js');
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

function addToMsgMappings(tgMsgId, talker, qqMsg, isGroup = false) {
    msgMappings.push([tgMsgId, talker, qqMsg]);
    if (state.lockTarget === 0) state.last = {
        s: STypes.Chat,
        target: talker,
        qqMsg,
        tgMsgId,
        isGroup
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
                    await tgBotDo.sendChatAction("choose_sticker");
                    defLogger.debug(`Handled a message send-back to '${mapPair[1].nickname}'.`);
                    return;
                }
            }
            defLogger.debug(`Unable to send-back due to no match in msgMappings.`);
        } else if (tgMsg.text === "/clear") {
            tgLogger.trace(`Invoking softReboot by user operation...`);
            await softReboot("User triggered.");
        } else if (tgMsg.text === "/keyboard") {
            let form = {
                reply_markup: JSON.stringify({
                    keyboard: secret.tgConf.quickKeyboard,
                    is_persistent: false,
                    resize_keyboard: true,
                    one_time_keyboard: false
                })
            };
            const tgMsg = await tgBotDo.sendMessage('Already set quickKeyboard! ', true, null, form);
            await tgbot.setMyCommands(Config.TGBotCommands);
            state.poolToDelete.add(tgMsg, 6);
        } else if (tgMsg.text.indexOf("F$") === 0) {
            // Want to find somebody, and have inline parameters
            const findToken = tgMsg.text.replace("F$", "");
            let targetQQ = null;
            for (const pair of secret.tgConf.nameAliases) {
                if (findToken === pair[0]) {
                    targetQQ = pair[1];
                    break;
                }
            }
            if (targetQQ === null && !Number.isNaN(parseInt(findToken))) targetQQ = parseInt(findToken);
            if (targetQQ > 10000) {
                const res = await qqBot.getUserProfile({qq: targetQQ});
                res.id = targetQQ;
                const content = `🔍Found:  \`${JSON.stringify(res)}\``;
                qqLogger.debug(content);
                const tgMsg = await tgBotDo.sendMessage(content, true, "MarkdownV2");
                addToMsgMappings(tgMsg.message_id, res, null);
                // state.poolToDelete.add(tgMsg, 6);
            } else qqLogger.debug(`Find [${findToken}] in QQ failed.`);

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
                const sendData = {
                    // friend: state.last.target.id,
                    message: new mrMessage().addText(tgMsg.text)
                };
                if (state.last.isGroup) sendData.group = state.last.target.group.id;
                else sendData.friend = state.last.target.id;
                await qqBot.sendMessage(sendData);
                await tgbot.sendChatAction(secret.test.targetTGID, "choose_sticker").catch((e) => {
                    tgLogger.error(e.toString());
                });
                defLogger.debug(`Handled a message send-back to speculative talker:(${state.last.target.nickname}).`);
            }
        }
    } catch (e) {
        tgLogger.warn(`Uncaught Error while handling TG message: ${e.message}`);
    }
}

async function softReboot(reason) {
    const userDo = (reason === "User triggered.") || (reason === "");
    // state.lastOpt = null;
    state.last = {};
    const tgMsg = await tgBotDo.sendMessage(`Soft Reboot Successful.\nReason: <code>${reason}</code>`, userDo, "HTML", {
        reply_markup: {}
    });
    state.poolToDelete.add(tgMsg, userDo ? 6 : 25);
}

async function onQQMsg(data) {
    let content, isGroup = false;
    if (!data.sender.group) {
        content = `📨[<b>${data.sender.nickname}</b>] `;
    } else {
        isGroup = true;
        content = `📬[<b>${data.sender.memberName}</b>@${data.sender.group.name}] `;
    }
    let imagePool = [];
    for (const msg of data.messageChain) {
        if (msg.type === "Source") continue;
        if (msg.type === "Plain") content += msg.text + ` `;
        if (msg.type === "Image") {
            //TODO: sendMediaGroup with URLs is unimplemented now, using this method temporary
            if (imagePool.length === 0) {
                content += `[${msg.isEmoji ? "CuEmo" : "Image"}] `;
                imagePool.push(msg.url);
            } else {
                content += `[<a href="${msg.url}">${msg.isEmoji ? "CuEmo" : "Image"}</a>] `;
            }
        }
        if (msg.type === "Face") content += `[${msg.faceId}/${msg.name}]`;
    }
    qqLogger.trace(`Got QQ message from: ${JSON.stringify(data.sender, null, 2)} Message Chain is: ${JSON.stringify(data.messageChain, null, 2)}`);
    let tgMsg;
    if (imagePool.length === 0) tgMsg = await tgBotDo.sendMessage(content, false, "HTML");
    else if (imagePool.length === 1) tgMsg = await tgBotDo.sendPhoto(content, imagePool[0], false, false);
    // else tgMsg = await tgBotDo.sendMediaGroup(content, imagePool, false, false);
    addToMsgMappings(tgMsg.message_id, data.sender, data.messageChain, isGroup);
}

async function main() {
    await qqBot.open(secret.miraiCredential);
    // await sendTestMessage();
    qqBot.on('FriendMessage', onQQMsg);
    qqBot.on('GroupMessage', new Middleware()
        .groupFilter([574252649])
        .done(async data => {
            // do sth.
        }));
}

tgbot.on('message', onTGMsg);
main().then(r => defLogger.info(`Bootstrap completed. (${r})`));