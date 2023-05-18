const {Bot, Message} = require('mirai-js');
const qqBot = new Bot();
const secret = require('../config/secret');
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
        await qqBot.sendMessage({
            friend: data.sender.id,
            message: new Message().addText('Echo !'),
        });
    });
}

main().then(r => console.log(r));