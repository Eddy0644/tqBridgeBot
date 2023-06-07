//#noinspection JSUnresolvedVariable
const dayjs = require('dayjs');
const {Bot: MiraiBot, Message: mrMessage, Middleware} = require('mirai-js');
const secret = require('../config/secret');
// const userConf = require('../config/userconf');
const {qqLogger, tgLogger, defLogger} = require('./logger')('startup');
const FileBox = require("file-box").FileBox;
const {tgbot, tgBotDo} = require('./tgbot-pre');
const {STypes, Config, coProcessor, uploadFileToUpyun} = require('./common');
const fs = require("fs");
const agentEr = require("https-proxy-agent");
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
        pers_id: 0,
        firstWord: ""
    },
    // store TG messages which need to be revoked after a period of time
    poolToDelete: [],
    autoRespond: [],
    myStat: "normal"
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

function addToMsgMappings(tgMsgId, talker, qqMsg, isGroup = false, override = false) {
    if (!tgMsgId) msgMappings.push([tgMsgId, talker, qqMsg, isGroup ? "group" : ""]);
    if (state.lockTarget === 0 || override) state.last = {
        s: STypes.Chat,
        target: talker,
        qqMsg,
        tgMsgId,
        isGroup
    };
    defLogger.debug(`Added temporary mapping from TG msg #${tgMsgId} to ${isGroup ? "QGroup" : "PersonQQ"} '${isGroup ? talker.group.name : talker.nickname}'.`);

}

async function onTGMsg(tgMsg) {
    //Drop pending updates
    if (process.uptime() < 5) return;
    if (tgMsg.photo) return await deliverTGMediaToQQ(tgMsg, tgMsg.photo, "photo");
    if (tgMsg.sticker) return await deliverTGMediaToQQ(tgMsg, tgMsg.sticker.thumbnail, "photo");
    // if (tgMsg.sticker) {
    //     tgMsg.mediaType = "sticker";
    //     tgMsg.text = tgMsg.caption ? tgMsg.caption : "";
    // }
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
                    // below: set last explicit talker as speculative (=/slet)
                    addToMsgMappings(tgMsg.message_id, mapPair[1], mapPair[2], mapPair[3]);
                    defLogger.debug(`Handled a message send-back to '${mapPair[1].nickname}'.`);
                    return;
                }
            }
            defLogger.debug(`Unable to send-back due to no match in msgMappings.`);
        } else if (tgMsg.text === "/clear") {
            tgLogger.trace(`Invoking softReboot by user operation...`);
            await softReboot("User triggered.");
        } else if (tgMsg.text.indexOf("/mystat") === 0) {
            const newStat = tgMsg.text.replace("/mystat", "");
            if (newStat.length < 2) {
                await tgBotDo.sendChatAction("record_voice");
                tgLogger.debug(`Received wrong /mystat command usage. Skipping...`);
                return;
            }
            state.myStat=newStat;
            const message=`Changed myStat into \`${newStat}\`!`;
            defLogger.debug(message);
            const tgMsg = await tgBotDo.sendMessage(message, true, "MarkdownV2");
            state.poolToDelete.add(tgMsg, 8);
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
        } else if (tgMsg.text.indexOf("F$") === 0 || tgMsg.text.indexOf("/f") === 0) {
            // Want to find somebody, and have inline parameters
            let isGroup = (tgMsg.text.indexOf("/fg") === 0);
            const findToken = tgMsg.text.replace("F$", "").replace("/f", "");
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
                    res = {group: {id: targetQQ, name: targetQQ}};
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
            //inline find someone: (priority higher than ops below)
            if (/(::|：：)\n/.test(tgMsg.text)) {
                const match = tgMsg.text.match(/^(.{2,10})(::|：：)\n/);
                if (match && match[1]) {
                    // Parse Success
                    const findToken = match[1];
                    let targetQQ = null, isGroup = false;
                    for (const pair of secret.tgConf.nameAliases) {
                        if (findToken === pair[0]) {
                            targetQQ = pair[1];
                            if (pair[2] === "group") isGroup = true;
                            break;
                        }
                    }
                    if (targetQQ) {
                        let content, res;
                        if (!isGroup) {
                            res = await qqBot.getUserProfile({qq: targetQQ});
                            res.id = targetQQ;
                            content = `[Inline]🔍Found: \`${JSON.stringify(res)}\`;`;
                        } else {
                            content = `[Inline]🔍Targeting Group ${targetQQ};`;
                            res = {group: {id: targetQQ, name: targetQQ}};
                        }
                        defLogger.debug(content);
                        addToMsgMappings(tgMsg.message_id, res, null, isGroup, true);
                        // left empty here, to continue forward message to talker and reuse the code
                    } else defLogger.trace(`Message have inline search, but no match in nameAliases pair.`);
                } else {
                    defLogger.debug(`Message have dual colon, but parse search token failed. Please Check.`);
                }
            }
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
                await tgBotDo.sendChatAction("choose_sticker");
                defLogger.debug(`Handled a message send-back to speculative talker:(${state.last.isGroup ? state.last.target.group.name : state.last.target.nickname}).`);
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
    state.prePerson = {
        tgMsg: null,
        pers_id: 0,
        firstWord: ""
    };
    msgMergeFailCount = 6;
    const tgMsg = await tgBotDo.sendMessage(`Soft Reboot Successful.\nReason: <code>${reason}</code>`, userDo, "HTML", {
        reply_markup: {}
    });
    state.poolToDelete.add(tgMsg, userDo ? 6 : 25);
}

async function onQQMsg(data) {
    try {
        let content = "", isGroup = false, deliverTemplate;
        let name;
        if (!data.sender.group) {
            deliverTemplate = `📨[<b>${data.sender.remark}</b>] `;
            name = data.sender.remark;
        } else {
            isGroup = true;
            deliverTemplate = `📬[<b>${data.sender.memberName}</b> @ ${data.sender.group.name}] `;
            name = data.sender.memberName;
        }
        let imagePool = [], shouldSpoiler = false;
        for (const msg of data.messageChain) {
            if (msg.type === "Source") continue;
            if (msg.type === "Plain") content += msg.text + ` `;
            if (msg.type === "Image") {
                //TODO: sendMediaGroup with URLs is unimplemented now, using this method temporary
                if (imagePool.length === 0) {
                    if (msg.isEmoji) shouldSpoiler = true;
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
        if (imagePool.length === 0) {
            try {
                if (!isGroup && coProcessor.isPreStateValid(state.prePerson, data.sender.id)) {
                    //TODO: add template string separately!!!
                    const _ = state.prePerson;
                    data.prePersonNeedUpdate = false;
                    // from same person, ready to merge
                    // noinspection JSObjectNullOrUndefined
                    if (_.firstWord === "") {
                        // 已经合并过，标题已经更改，直接追加新内容
                        const newString = `${_.tgMsg.text}\n[${dayjs().format("H:mm:ss")}] ${content}`;
                        _.tgMsg = await tgBotDo.editMessageText(newString, _.tgMsg);
                        defLogger.debug(`Delivered new message "${content}" from Person: ${name} into 2nd message.`);
                        return;
                    } else {
                        // 准备修改先前的消息，去除头部        \n📨📨
                        const newString = `📨⛓️ [<b>${name}</b>] - - - -\n${_.firstWord}\n[${dayjs().format("H:mm:ss")}] ${content}`;
                        _.tgMsg = await tgBotDo.editMessageText(newString, _.tgMsg);
                        _.firstWord = "";
                        defLogger.debug(`Delivered new message "${content}" from Person: ${name} into first message.`);
                        return;
                    }
                } else data.prePersonNeedUpdate = true;
            } catch (e) {
                qqLogger.info(`Error occurred while merging room msg into older TG msg. Falling back to normal way.\n\t${e.toString()}\n\t${JSON.stringify(state.preRoom)}`);
                msgMergeFailCount--;
                if (msgMergeFailCount < 0) await softReboot("merging message failure reaches threshold.");
            }


            tgMsg = await tgBotDo.sendMessage(deliverTemplate + content, false, "HTML");
            if (!isGroup && data.prePersonNeedUpdate) {
                state.prePerson.pers_id = data.sender.id;
                state.prePerson.tgMsg = tgMsg;
                state.prePerson.firstWord = `[${dayjs().format("H:mm:ss")}] ${content}`;
            }
        } else if (imagePool.length === 1) tgMsg = await tgBotDo.sendPhoto(deliverTemplate + content, imagePool[0], false, shouldSpoiler);
        // else tgMsg = await tgBotDo.sendMediaGroup(content, imagePool, false, false);
        addToMsgMappings(tgMsg.message_id, data.sender, data.messageChain, isGroup);
    } catch (e) {
        qqLogger.warn(`Error occurred while handling QQ message:\n\t${e}`);
    }
}

async function deliverTGMediaToQQ(tgMsg, tg_media, media_type) {
    if (state.last.s !== STypes.Chat) {
        await tgBotDo.sendMessage("🛠 Sorry, but media sending without last chatter is not implemented.", true);
        // TODO: to be implemented.
        return;
    }
    tgLogger.trace(`Received TG ${media_type} message, proceeding...`);
    const file_id = (tgMsg.photo) ? tgMsg.photo[tgMsg.photo.length - 1].file_id : tg_media.file_id;
    const fileCloudPath = (await tgbot.getFile(file_id)).file_path;
    const rand1 = Math.random();
    let local_path = './downloaded/' + (
        (tgMsg.photo) ? (`photoTG/${rand1}.png`) :
            (tgMsg.document ? (`fileTG/${tg_media.file_name}`) :
                (tgMsg.sticker ? (`stickerTG/${rand1}.webp`) :
                    (`videoTG/${rand1}.mp4`))));
    // (tgMsg.photo)?(``):(tgMsg.document?(``):(``))
    // const action = (tgMsg.photo) ? (`upload_photo`) : (tgMsg.document ? (`upload_document`) : (`upload_video`));
    const action = `upload_${media_type}`;
    await tgBotDo.sendChatAction(action);
    tgLogger.trace(`file_path is ${local_path}.`);
    await downloadHttpsWithProxy(`https://api.telegram.org/file/bot${secret.tgCredential.token}/${fileCloudPath}`, local_path);
    if (tgMsg.sticker) {
        tgLogger.trace(`Invoking TG sticker pre-process...`);
        const uploadResult = await uploadFileToUpyun(local_path.replace('./downloaded/stickerTG/', ''), secret.upyun);
        if (uploadResult.ok) {
            await FileBox.fromUrl(uploadResult.filePath + '!/format/jpg').toFile(`./downloaded/stickerTG/${rand1}.jpg`);
            local_path = local_path.replace('.webp', '.jpg');
        } else tgLogger.warn(`Error on sticker pre-process:\n\t${uploadResult.msg}`);
    }
    const {imageId, url, path} = await qqBot.uploadImage({filename: local_path});
    await tgBotDo.sendChatAction("record_video");
    const sendData = {
        message: new mrMessage().addText(tgMsg.caption ? tgMsg.caption : "")
            .addImageUrl(url)
    };
    if (state.last.isGroup) sendData.group = state.last.target.group.id;
    else sendData.friend = state.last.target.id;
    await qqBot.sendMessage(sendData);
    defLogger.debug(`Handled a (${action}) message send-back to speculative talker:${state.last.isGroup ? state.last.target.group.name : state.last.target.nickname}.`);
    await tgBotDo.sendChatAction("choose_sticker");
    return true;
}

async function downloadHttpsWithProxy(url, pathName) {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(pathName);
        const agent = new agentEr.HttpsProxyAgent(require("../proxy"));
        require('https').get(url, {agent: agent}, (response) => {
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

async function main() {
    await qqBot.open(secret.miraiCredential);
    // await sendTestMessage();
    qqBot.on('FriendMessage', onQQMsg);
    qqBot.on('GroupMessage', new Middleware()
        .groupFilter(secret.qqGroupFilter)
        .done(async data => {
            await onQQMsg(data);
        }));
    qqBot.on('FriendSyncMessage', async data => {
        if (data.subject.id === secret.miraiCredential.qq) await onQQMsg(data);
    });
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
let msgMergeFailCount = 6;