// noinspection JSUnreachableSwitchBranches

const dayjs = require("dayjs");
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

module.exports = (incomingEnv) => {
    env = incomingEnv;
    return {handleForwardMessage};
};