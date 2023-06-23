// noinspection JSUnreachableSwitchBranches

const dayjs = require("dayjs");
const {tgBotDo} = require("./tgbot-pre");
let env;

// async function a() {
//     const {} = env;
// }

async function mergeToPrev_tgMsg(qdata, isGroup, content, name = "") {
    const {state, defLogger, tgBotDo} = env;
    const word = isGroup ? "Group" : "Person";
    const newItemTitle = isGroup ? qdata.sender.memberName : dayjs().format("H:mm:ss");
    //TODO: add template string separately!!!
    const _ = isGroup ? state.preGroup : state.prePerson;
    qdata[`pre${word}NeedUpdate`] = false;
    // from same person, ready to merge
    // noinspection JSObjectNullOrUndefined
    if (_.firstWord === "") {
        // 已经合并过，标题已经更改，直接追加新内容
        const newString = `${_.tgMsg.text}\n[${newItemTitle}] ${content}`;
        _.tgMsg = await tgBotDo.editMessageText(newString, _.tgMsg);
        defLogger.debug(`Delivered new message "${content}" from ${word}: ${name} into 2nd message.`);
        return true;
    } else {
        // 准备修改先前的消息，去除头部
        const newString = `📨⛓️ [<b>${name}</b>] - - - -\n${_.firstWord}\n[${newItemTitle}] ${content}`;
        _.tgMsg = await tgBotDo.editMessageText(newString, _.tgMsg);
        _.firstWord = "";
        defLogger.debug(`Delivered new message "${content}" from ${word}: ${name} into first message.`);
        return true;
    }
}

async function replyWithTips(tipMode = "", target = null, timeout = 6, additional = null) {
    const {tgLogger, state} = env;
    let message = "", form = {};
    switch (tipMode) {
        case "globalCmdToC2C":
            message = `You sent a global command to a C2C chat. The operation has been blocked and please check.`;
            break;
        case "lockStateChange":
            message = `Already set lock state to ${additional}.`;
            break;
        case "softReboot":
            message = `Soft Reboot Successful.\nReason: <code>${additional}</code>`;
            form = {reply_markup: {}};
            break;
        case "nothingToDo":
            message = `Nothing to do upon your message, ${target}`;
            break;
        default:
            tgLogger.error(`Wrong call of tg replyWithTips() with invalid 'tipMode'. Please check arguments.\n${tipMode}\t${target}`);
            return;
    }
    if (target === null) {
        tgLogger.error(`Wrong call of tg replyWithTips() with null 'target'. Please check arguments.\n${tipMode}\t${target}`);
        return;
    }
    const tgMsg = await tgBotDo.sendMessage({tgGroupId: target}, message, true, "HTML", form);
    if (timeout !== 0) state.poolToDelete.add(tgMsg, timeout);
}

module.exports = (incomingEnv) => {
    env = incomingEnv;
    return {mergeToPrev_tgMsg, replyWithTips};
};