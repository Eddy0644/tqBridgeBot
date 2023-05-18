const {Bot, Message} = require('mirai-js');
const qqBot = new Bot();
const secret = require('../config/secret');

async function sendTestMessage() {
    await qqBot.sendMessage({
        friend: secret.testTargetNumber,
        message: new Message().addText('hello world!')
    });
}

async function main() {
    await qqBot.open(secret.botCredential);
    await sendTestMessage();
    qqBot.on('FriendMessage', async data => {
        await qqBot.sendMessage({
            friend: data.sender.id,
            message: new Message().addText('Echo !'),
        });
    });
}

main().then(r => console.log(r));