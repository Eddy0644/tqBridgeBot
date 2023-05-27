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
        friend: secret.target.QNumber, message: new mrMessage().addText('114514')
    });
}

let msgMappings = [];

function addToMsgMappings(tgMsgId, talker, qqMsg, isGroup = false) {
    msgMappings.push([tgMsgId, talker, qqMsg, isGroup ? "group" : ""]);
    if (state.lockTarget === 0) state.last = {
        s: STypes.Chat,
        target: talker,
        qqMsg,
        tgMsgId,
        isGroup
    };
    defLogger.debug(`Added temporary mapping from TG msg #${tgMsgId} to QQ '${isGroup ? talker.group.name : talker.nickname}'.`);

}

async function onTGMsg(tgMsg) {
    //Drop pending updates
    if (process.uptime() < 5) return;
    try {
        if (!secret.target.tgAllowList.includes(tgMsg.from.id)) {
            tgLogger.trace(`Got TG message (#${tgMsg.message_id}) from unauthorized user (${tgMsg.from.id}), Ignoring.`);
            return;
        }
        if (tgMsg.chat.type === "supergroup" ? (secret.target.tgAllowThreadID.includes(tgMsg.message_thread_id)) : true) {
        } else {
            tgLogger.trace(`Got TG message (#${tgMsg.message_id}) from supergroup but thread_id (${tgMsg.message_thread_id}) not match, Ignoring.`);
            return;
        }

        if (tgMsg.reply_to_message && !secret.target.tgThreadInreplyExcludes.includes(tgMsg.reply_to_message.message_id)) {
            for (const mapPair of msgMappings) {
                if (mapPair[0] === tgMsg.reply_to_message.message_id) {
                    const sendData = {
                        message: new mrMessage().addText(tgMsg.text)
                    };
                    if (mapPair[3] === "group") sendData.group = mapPair[1].group.id;
                    else sendData.friend = mapPair[1].id;
                    await qqBot.sendMessage(sendData);
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
                    is_persistent: true,
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
            let isGroup = false;
            let targetQQ = null;
            for (const pair of secret.tgConf.nameAliases) {
                if (findToken === pair[0]) {
                    targetQQ = pair[1];
                    if (pair[2] === "group") isGroup = true;
                    break;
                }
            }
            if (targetQQ === null && !Number.isNaN(parseInt(findToken))) targetQQ = parseInt(findToken);
            if (targetQQ > 10000) {
                let content, res;
                if (!isGroup) {
                    res = await qqBot.getUserProfile({qq: targetQQ});
                    res.id = targetQQ;
                    content = `🔍Found:  \`${JSON.stringify(res)}\`;`;
                } else {
                    content = `🔍Set Message target to Group ${targetQQ};`;
                    res = {group: {id: targetQQ}};
                }
                qqLogger.debug(content);
                const tgMsg = await tgBotDo.sendMessage(content, true, "MarkdownV2");
                addToMsgMappings(tgMsg.message_id, res, null, isGroup);
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
                await tgbot.sendChatAction(secret.target.tgID, "choose_sticker").catch((e) => {
                    tgLogger.warn(e.toString());
                });
                defLogger.debug(`Handled a message send-back to speculative talker:(${state.last.isGroup ? state.last.group.name : state.last.nickname}).`);
            }
        }
    } catch (e) {
        tgLogger.warn(`Uncaught Error while handling TG message: ${e.message}.`);
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
    try {
        let content, isGroup = false;
        if (!data.sender.group) {
            content = `📨[<b>${data.sender.remark}</b>] `;
        } else {
            isGroup = true;
            content = `📬[<b>${data.sender.memberName}</b> @ ${data.sender.group.name}] `;
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
    } catch (e) {
        qqLogger.warn(`Error occurred while handling QQ message:\n\t${e.toString()}`);
    }
}

async function main() {
    await qqBot.open(secret.miraiCredential);
    // await sendTestMessage();
    qqBot.on('FriendMessage', onQQMsg);
    qqBot.on('GroupMessage', new Middleware()
        .groupFilter(secret.qqGroupFilter)
        .done(async data => {
            await onQQMsg(data);
        }));
}

tgbot.on('message', onTGMsg);
main().then(r => defLogger.info(`Bootstrap completed. (${r})`));

const timerData = setInterval(async () => {
    try {
        for (const itemId in state.poolToDelete) {
            if (Number.isNaN(parseInt(itemId))) continue;
            const item = state.poolToDelete[parseInt(itemId)];
            if (dayjs().unix() > item.toDelTs) {
                // delete the element first to avoid the same ITEM triggers function again if interrupted by errors.
                state.poolToDelete.splice(parseInt(itemId), 1);
                tgLogger.debug(`Attempting to remove expired messages driven by its timer.`);
                await tgBotDo.revokeMessage(item.tgMsg.message_id);
            }
        }
    } catch (e) {
        defLogger.info(`An exception happened within timer function with x${timerDataCount} reset cycles left:\n\t${e.toString()}`);
        timerDataCount--;
        if (timerDataCount < 0) clearInterval(timerData);
    }
}, 5000);
let timerDataCount = 6;
// let msgMergeFailCount = 6;