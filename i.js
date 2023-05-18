const {Bot, Message} = require('mirai-js');
const bot = new Bot();

async function main() {
    await bot.open(require('config/secret').botCredential);
    await bot.sendMessage({
        // 好友 qq 号
        friend: require('config/secret').testTargetNumber,
        // Message 实例，表示一条消息
        message: new Message().addText('hello world!')
    });
}

main();