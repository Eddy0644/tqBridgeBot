// const {tgBotDo} = require("./tgbot-pre");
let env;

function test() {
    return env.a;
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
        test, changeMyStat
    };
};