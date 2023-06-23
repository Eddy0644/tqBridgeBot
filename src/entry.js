//#noinspection JSUnresolvedVariable
// noinspection JSUnreachableSwitchBranches

const dayjs = require('dayjs');
const {Bot: MiraiBot, Message: mrMessage, Middleware} = require('mirai-js');
const secret = require('../config/secret');
// const userConf = require('../config/userconf');
const {qqLogger, tgLogger, defLogger} = require('./logger')('startup');
const {tgbot, tgBotDo} = require('./tgbot-pre');
const {STypes, Config, coProcessor} = require('./common');

const qqBot = new MiraiBot();
const state = {
    last: {},
    // lastExplicitTalker: null,
    lockTarget: 0,
    prePerson: {
        tgMsg: null,
        pers_id: 0,
        firstWord: ""
    },
    preGroup: {
        tgMsg: null,
        pers_id: 0,
        firstWord: ""
    },
    // store TG messages which need to be revoked after a period of time
    poolToDelete: [],
    autoRespond: [],
    myStat: "normal"
};

// Loading instance modules...
const env = {
    state, tgBotDo, tgLogger, defLogger, qqLogger, secret, qqBot
};
const mod = {
    autoRespond: require('./autoResponder')(env),
    upyunMiddleware: require('./upyunMiddleware')(env),
    qqProcessor: require('./qqProcessor')(env),
    tgProcessor: require('./tgProcessor')(env),
}

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
    // Drop pending updates
    if (process.uptime() < 5) return;
    // Only process messages sent from authorized user
    if (!secret.target.tgAllowList.includes(tgMsg.from.id)) {
        tgLogger.trace(`Got TG message (#${tgMsg.message_id}) from unauthorized user (${tgMsg.from.id}), Ignoring.`);
        return;
    }
    // Iterate through secret.class to find matches
    tgMsg.matched = null;
    // s=0 -> default, s=1 -> C2C
    with (secret.class) {
        for (const pair of C2C) {
            //TODO add thread_id verification
            if (tgMsg.chat.id === pair.tgGroupId) {
                tgMsg.matched = {s: 1, q: pair.qTarget};
                tgLogger.trace(`Message from C2C group: ${pair.tgGroupId}, setting message default target to QQ(${pair.qTarget})`);
                break;
            }
        }
        if (!tgMsg.matched) {
            tgMsg.matched = {s: 0};
        }
    }

    if (tgMsg.photo) return await deliverTGMediaToQQ(tgMsg, tgMsg.photo, "photo");
    if (tgMsg.sticker) return await deliverTGMediaToQQ(tgMsg, tgMsg.sticker.thumbnail, "photo");
    // if (tgMsg.sticker) {
    //     tgMsg.mediaType = "sticker";
    //     tgMsg.text = tgMsg.caption ? tgMsg.caption : "";
    // }
    try {

        // if (tgMsg.chat.type === "supergroup" ? (secret.target.tgAllowThreadID.includes(tgMsg.message_thread_id)) : true) {
        // } else {
        //     tgLogger.trace(`Got TG message (#${tgMsg.message_id}) from supergroup but thread_id (${tgMsg.message_thread_id}) not match, Ignoring.`);
        //     return;
        // }

        // Safety rewrite tgMsg.text
        if (!tgMsg.text) {
            tgLogger.warn(`A TG message with empty content has passed through text Processor! Check the log for detail.`);
            tgLogger.trace(`The detail of tgMsg which caused error: `, JSON.stringify(tgMsg));
        }

        // if (tgMsg.reply_to_message && !secret.target.tgThreadInreplyExcludes.includes(tgMsg.reply_to_message.message_id)) {
        if (tgMsg.matched.s === 0 && tgMsg.reply_to_message) {
            // Only tgMsg from default channel and have reply would go downwards
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
            return;
        }

        // First match simple commands
        switch (tgMsg.text) {
            case "/clear": {
                if (tgMsg.matched.s === 1) {
                    return await mod.tgProcessor.replyWithTips("globalCmdToC2C", tgMsg.chat.id, 6);
                }
                tgLogger.trace(`Invoking softReboot by user operation...`);
                await softReboot("User triggered.");
                return;
            }
            case "/lock": {
                if (tgMsg.matched.s === 1) {
                    return await mod.tgProcessor.replyWithTips("globalCmdToC2C", tgMsg.chat.id, 6);
                }
                state.lockTarget = state.lockTarget ? 0 : 1;
                return await mod.tgProcessor.replyWithTips("lockStateChange", tgMsg.chat.id, 6, state.lockTarget);
            }
            // case "": {
            //
            //     break;
            // }
        }
        if (tgMsg.text.startsWith("/mystat")) {
            return await mod.autoRespond.changeMyStat(tgMsg.text.replace("/mystat", ""));

        }
        if (tgMsg.text.startsWith("F$") || tgMsg.text.startsWith("/f")) {
            // Want to find somebody, and have inline parameters
            let isGroup = (tgMsg.text.startsWith("/fg"));
            // only /fg____ is allowed to retrieve groups
            const findToken = tgMsg.text.replace("F$", "").replace("/fg", "").replace("/f", "");
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
                const tgMsg = await tgBotDo.sendMessage(null, content, true, "MarkdownV2");
                addToMsgMappings(tgMsg.message_id, res, null, isGroup);
                // state.poolToDelete.add(tgMsg, 6);
            } else qqLogger.debug(`Find [${findToken}] in QQ failed.`);
            return;
        }

        // Last process block

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
                    // TODO force override of message content but need a fix
                    tgMsg.text = tgMsg.text.replace(match[0], "");
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
    await mod.tgProcessor.replyWithTips("softReboot", secret.class.fallback.tgGroupId, userDo ? 6 : 25, reason);
}

async function onQQMsg(qdata) {
    //preposition filter about QID
    for (const one of secret.test.excludeQN) {
        if (qdata.sender.id === one) {
            qqLogger.debug(`Ignored a message from ${one}. See log for detail.`);
            return;
        }
    }
    try {
        let content = "", isGroup = false, deliverTemplate;
        let name, nominalID;
        if (!qdata.sender.group) {
            deliverTemplate = `📨[<b>${qdata.sender.remark}</b>] `;
            name = qdata.sender.remark;
            nominalID = qdata.sender.id;
        } else {
            isGroup = true;
            deliverTemplate = `📬[<b>${qdata.sender.memberName}</b> @ ${qdata.sender.group.name}] `;
            name = qdata.sender.memberName;
            nominalID = qdata.sender.group.id;
        }
        let imagePool = [], shouldSpoiler = false;
        for (const msg of qdata.messageChain) switch (msg.type) {
            case "Source":
                continue;
            case "Plain":
                content += msg.text + ` `;
                break;
            case "Image": {
                //TODO: sendMediaGroup with URLs is unimplemented now, using this method temporary
                if (imagePool.length === 0) {
                    if (msg.isEmoji) shouldSpoiler = true;
                    content += `[${msg.isEmoji ? "CuEmo" : "Image"}] `;
                    imagePool.push(msg.url);
                } else {
                    content += mod.qqProcessor.prodImageLink(msg.url, msg.isEmoji);
                    // content += `[<a href="${msg.url}">${msg.isEmoji ? "CuEmo" : "Image"}</a>] `;
                }
            }
                break;
            case "Face":
                content += `[${msg.faceId}/${msg.name}]`;
                break;
            case "MarketFace":
                content += `(${msg.id}/${msg.name})`;
                break;
            case "App":
                const appParsed = mod.qqProcessor.parseApp(msg);
                qqLogger.trace(`Parsed App Message: ${appParsed}`);
                content += appParsed;
                break;
            case "Poke":
                content += `[Poked you with title {${msg.name}]\n`;
                break;
            case "Forward":
            case "ForwardMessage":
                if (msg.display) {
                    content += `[${msg.display.title},${msg.display.summary}]\n`;
                    for (const previewElement of msg.display.preview) {
                        content += `--> ${previewElement}\n`;
                    }
                } else {
                    // Get summary from ForwardMessage Failed
                    // content += `[Forwarded Messages]\n`;
                    content += mod.qqProcessor.handleForwardMessage(msg.nodeList, 1);
                }
                break;

            default:
                qqLogger.debug(`Unparsed MessageType: (${msg.type}). Ignored.`);
        }

        qqLogger.trace(`Got QQ message from: ${JSON.stringify(qdata.sender, null, 2)} Message Chain is: ${JSON.stringify(qdata.messageChain, null, 2)}`);
        let tgMsg, rand0 = Math.random().toString().substring(4, 7);
        qdata.processed = content;
        if (mod.autoRespond.needAutoRespond(nominalID)) {
            await mod.autoRespond.doAutoRespond(nominalID, qdata, isGroup);
        }

        // Start deliver process, start fetching from config
        qdata.receiver = null;
        with (secret.class) {
            for (const pair of C2C) {
                if (pair.qTarget[0] === nominalID && pair.qTarget[1] === isGroup) {
                    // Matched pair
                    qdata.receiver = pair;
                    break;
                }
            }
            if (!qdata.receiver) {
                qdata.receiver = fallback;
            }
        }

        if (imagePool.length === 1) {
            if (shouldSpoiler) {
                tgMsg = await tgBotDo.sendAnimation(deliverTemplate + `[${rand0}]`, imagePool[0], true, true);
                tgLogger.trace(`The only CuEmo delivered, preparing to re-deliver content to main thread.`);
                content = mod.qqProcessor.prodImageLink(imagePool.pop(), true);
                // then the imagePool become zero and continue to deliver as Text.
            } else {
                tgMsg = await tgBotDo.sendPhoto(qdata.receiver, deliverTemplate + content, imagePool[0], false, false);
            }
        }
        if (imagePool.length === 0) {
            // These merge codes need to be improved!!!!!!!
            try {
                if (!isGroup) {
                    if (coProcessor.isPreStateValid(state.prePerson, qdata.sender.id)) {
                        const result = await mod.tgProcessor.mergeToPrev_tgMsg(qdata, false, content, name);
                        if (result === true) return;
                    } else qdata.prePersonNeedUpdate = true;
                } else {
                    if (coProcessor.isPreStateValid(state.preGroup, qdata.sender.group.id)) {
                        const result = await mod.tgProcessor.mergeToPrev_tgMsg(qdata, true, content, name);
                        if (result === true) return;
                    } else qdata.preGroupNeedUpdate = true;
                }
            } catch (e) {
                qqLogger.info(`Error occurred while merging a msg into older TG msg. Falling back to normal way.\n\t${e.toString()}\n\t${JSON.stringify(state[isGroup ? "preGroup" : "prePerson"])}`);
                msgMergeFailCount--;
                if (msgMergeFailCount < 0) await softReboot("merging message failure reaches threshold.");
            }

            tgMsg = await tgBotDo.sendMessage(qdata.receiver, deliverTemplate + content, false, "HTML");

            if (!isGroup && qdata.prePersonNeedUpdate) {
                state.prePerson.pers_id = qdata.sender.id;
                state.prePerson.tgMsg = tgMsg;
                state.prePerson.firstWord = `[${dayjs().format("H:mm:ss")}] ${content}`;
            }
            if (isGroup && qdata.preGroupNeedUpdate) {
                state.preGroup.pers_id = qdata.sender.group.id;
                state.preGroup.tgMsg = tgMsg;
                state.preGroup.firstWord = `[${qdata.sender.memberName}] ${content}`;
            }
        }
        // else tgMsg = await tgBotDo.sendMediaGroup(content, imagePool, false, false);
        addToMsgMappings(tgMsg.message_id, qdata.sender, qdata.messageChain, isGroup);
    } catch (e) {
        qqLogger.warn(`Error occurred while handling QQ message:\n\t${e}`);
    }
}

async function deliverTGMediaToQQ(tgMsg, tg_media, media_type) {
    //TODO fix me to send media directly to C2C
    if (state.last.s !== STypes.Chat) {
        await tgBotDo.sendMessage(null, "🛠 Sorry, but media sending without last chatter is not implemented.", true);
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
    await tgBotDo.downFromCloud(fileCloudPath, local_path);
    if (tgMsg.sticker) {
        tgLogger.trace(`Invoking TG sticker pre-process...`);
        local_path = await mod.upyunMiddleware.webpToJpg(local_path, rand1);
    }
    // const {imageId, url, path}
    const {url} = await qqBot.uploadImage({filename: local_path});
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
        // Capture messages sent by myself to myself
        if (data.subject.id === secret.miraiCredential.qq) {
            data.sender = data.subject;
            await onQQMsg(data);
        }
    });
    qqBot.on('GroupSyncMessage', async data => {
        // Capture messages sent by myself to test group
        if (data.subject.id === secret.target.testGroupQID) {
            data.sender = {
                id: secret.miraiCredential.qq,
                // Name of bot itself when delivering message by itself to test group
                memberName: "SelfEcho",
                group: data.subject
            };
            await onQQMsg(data);
        }
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