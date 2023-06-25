// noinspection JSUnreachableSwitchBranches

const dayjs = require("dayjs");
const {Message: mrMessage} = require("mirai-js");
const userConf = require("../config/userconf");
let env;

async function a() {
    const {} = env;
}

function handleForwardMessage(nodeList, indent = 1) {
    const {qqLogger} = env;
    let ans, contentAll = "", peopleList = [], firstTime = null, talkerStr = "";
    const prodInd = (ind) => {
        let content = "";
        for (let i = 0; i < ind; i++) content += "---";
        return content;
    };
    for (const node of nodeList) {
        if (!firstTime) firstTime = dayjs.unix(node.time).format("MMDD HH:mm:ss");
        let content = prodInd(indent);
        if (!peopleList.includes(node.senderId)) {
            peopleList.push(node.senderId);
            talkerStr += `/f${node.senderId} == ${node.senderName}\n`;
        }
        content += `[${node.senderName}]➡ `;
        for (const msg of node.messageChain) switch (msg.type) {
            case "Plain":
                content += msg.text + ` `;
                break;
            case "Image":
                content += `[<a href="${msg.url}">${msg.isEmoji ? "CuEmo" : "Image"}</a>] `;
                break;
            case "Face":
                content += `[${msg.faceId}/${msg.name}]`;
                break;
            case "Forward":
            case "ForwardMessage":
                content += handleForwardMessage(msg.nodeList, indent + 1);
                break;
            default:
                qqLogger.debug(`Unparsed MessageType: (${msg.type}) In a ForwardMessage. Ignored.`);
        }
        contentAll += content + "\n";
    }
    ans = `${prodInd(indent - 1)}[Forwarded]\nFirst Msg Time:${firstTime}\nTalkers:${talkerStr}${contentAll}`;
    qqLogger.trace(`Parsed ForwardMessage:\n${ans}`);
    return ans;
}

function prodImageLink(url, isEmoji) {
    return `[<a href="${url}">${isEmoji ? "CuEmo" : "Image"}</a>] `;
}

function parseApp(msg) {
    const {qqLogger} = env;
    try {
        const ctx = JSON.parse(msg.content);
        if (ctx.prompt) {
            const defPrompt = ctx.prompt;
            if (ctx.meta.detail_1.qqdocurl) {
                const {desc, preview, qqdocurl} = ctx.meta.detail_1;
                return `[<a href="${preview}">App</a>]<a href="${qqdocurl}">${desc}</a>`;
            } else return `[App, ${defPrompt}]`;
        } else return "[App, parsed nothing]";

    } catch (e) {
        qqLogger.warn(`[App] message not parsable!`);
        return "[App, parse failed]";
    }
}

function parseFaces(origText) {
    let msg = new mrMessage(), msgText = origText, emojiList = [], ci = -1, cn = 0;
    for (const facePair of userConf.emojiReplaceList) {
        while (msgText.indexOf(facePair[0]) !== -1) {
            msgText = msgText.replace(facePair[0], "|-|");
            emojiList.push(facePair[1]);
            cn++;
        }
    }
    for (const textItem of msgText.split("|-|")) {
        if (ci !== -1) {
            msg = msg.addFace(emojiList[ci]);
            ci++;
        } else ci = 0;
        msg = msg.addText(textItem);
    }

    return msg;
}

module.exports = (incomingEnv) => {
    env = incomingEnv;
    return {handleForwardMessage, prodImageLink, parseApp, parseFaces};
};