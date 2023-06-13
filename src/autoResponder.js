const secret = require("../config/secret");
const {Message: mrMessage} = require("mirai-js");
const fetch = require("node-fetch");
// const userConf = require("../config/userconf");
let env;

function needAutoRespond(nominalID) {
    // if (userConf.autoRespond.allow !== 1) return false;
    if (secret.qqAutoRespond.allow !== 1) return false;
    return env.secret.qqAutoRespond.allowList.includes(nominalID);
}

async function doAutoRespond(nominalID, qdata, isGroup) {
    const {state, defLogger, qqBot} = env;
    if (state.myStat !== "normal") {
        // ready to auto respond
        let asArr = null;
        for (const pair of state.autoRespond) {
            if (pair.id === nominalID) {
                asArr = pair;
            }
        }
        if (!asArr) {
            asArr = {
                id: nominalID,
                stat: "init"
            };
            state.autoRespond.push(asArr);
        }
        if (asArr.stat === "init") {
            // 'init' state
            const prompt = secret.qqAutoRespond.prompt_init(0);

            const sendData = {
                message: new mrMessage().addText(prompt)
            };
            if (isGroup) sendData.group = qdata.sender.group.id;
            else sendData.friend = qdata.sender.id;
            await qqBot.sendMessage(sendData);

            asArr.stat = "ai";
        } else if (asArr.stat === "ai") {
            defLogger.trace(`Corresponding asArr headed for 'ai', preparing for AI response...`);
            let prompt = secret.qqAutoRespond.prompt_ai(qdata.processed);
            try {
                const response = await fetch(secret.aiAssistance.url, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'text/plain'
                    },
                    body: prompt
                });
                const responseData = await response.text();
                defLogger.debug(`Sending back AI response: {${responseData}`);
                const sendData = {
                    message: new mrMessage().addText(responseData)
                };
                if (isGroup) sendData.group = qdata.sender.group.id;
                else sendData.friend = qdata.sender.id;
                await qqBot.sendMessage(sendData);

            } catch (error) {
                defLogger.warn('On AIAssistance:', error);
            }
        }
    }
}

async function changeMyStat(newStat = "normal") {
    const {tgBotDo, state, tgLogger, defLogger} = env;
    // const newStat = tgMsg.text.replace("/mystat", "");
    if (newStat.length < 2) {
        await tgBotDo.sendChatAction("record_voice");
        tgLogger.debug(`Received wrong /mystat command usage. Skipping...`);
        return;
    }
    state.myStat = newStat;
    const message = `Changed myStat into ${newStat}.`;
    defLogger.debug(message);

    if (newStat === "normal") state.autoRespond = [];

    const tgMsg2 = await tgBotDo.sendMessage(message, true, "HTML");
    state.poolToDelete.add(tgMsg2, 8);
    return tgMsg2;
}

module.exports = (incomingEnv) => {
    env = incomingEnv;
    return {
        changeMyStat, needAutoRespond, doAutoRespond
    };
};