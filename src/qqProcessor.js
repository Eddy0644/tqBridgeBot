const dayjs = require("dayjs");
let env;

async function a() {
    const {} = env;
}

function handleForwardMessage(nodeList, indent = 1) {
    const {qqLogger} = env;
    let ans, contentAll = "", peopleList = [], firstTime = null;
    const prodInd = (ind) => {
        let content = "";
        for (let i = 0; i < indent; i++) content += "--";
        return content;
    };
    for (const node of nodeList) {
        if (!firstTime) firstTime = dayjs.unix(node.time).format("MMDD HHmmss");
        let content = prodInd(indent);
        if (!peopleList.includes(node.senderId)) {
            peopleList.push([node.senderId, node.senderName]);
        }
        content += `[${node.senderName}]➡️`;
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
            default:
                qqLogger.debug(`Unparsed MessageType: (${msg.type}) In a ForwardMessage. Ignored.`);
        }
        contentAll += content;
    }
    let talkerStr = "";
    for (const oneTalker of peopleList) {
        talkerStr += `/f${oneTalker[0]} == ${oneTalker[1]}\n`;
    }
    ans = `${prodInd(indent - 1)}[Forwarded]\nFirst Msg Time:${firstTime}\nTalkers:[${talkerStr}${contentAll}`;
    qqLogger.trace(`Parsed ForwardMessage:\n${ans}`);
    return ans;
}

module.exports = (incomingEnv) => {
    env = incomingEnv;
    return {handleForwardMessage};
};