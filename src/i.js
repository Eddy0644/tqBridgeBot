const {Bot, Message} = require('mirai-js');
const secret = require('../config/secret');
const userConf = require('../config/userconf');

const {tgbot} = require('./tgbot-pre');
const qqBot = new Bot();
const {qqLogger, tgLogger, defLogger} = require('./logger')('startup');

async function sendTestMessage() {
    await qqBot.sendMessage({
        friend: secret.test.targetQNumber,
        message: new Message().addText('114514')
    });
}

async function main() {
    await qqBot.open(secret.miraiCredential);
    await sendTestMessage();
    qqBot.on('FriendMessage', async data => {
        await tgbot.sendMessage(secret.test.targetTGID, `Got QQ message from:<code>${JSON.stringify(data.sender, null, 2)}</code> Message Chain is: <code>${JSON.stringify(data.messageChain, null, 2)}</code>`, {
            parse_mode: "HTML"
        });
        // await qqBot.sendMessage({
        //     friend: data.sender.id,
        //     message: new Message().addText('Echo !'),
        // });
    });
}

main().then(r => console.log(r));