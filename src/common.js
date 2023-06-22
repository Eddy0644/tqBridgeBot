const dayjs = require("dayjs");
const crypto = require("crypto");
const fs = require("fs");
const https = require("https");
const {defLogger} = require('./logger')();
module.exports = {
    STypes: {
        Chat: 1,
        FindMode: 2,
    },
    Config: {
        TGBotCommands: [
            {command: '/find', description: 'Find Person or Group Chat'},
            {command: '/clear', description: 'Clear Selection'},
            {command: '/info', description: 'Get current system variables'},
            {command: '/keyboard', description: 'Get a persistent versatile quick keyboard.'},
            {command: '/placeholder', description: 'Display a placeholder to hide former messages'},
            {command: '/slet', description: 'Set last explicit talker as last talker.'},
            // {command: '/log', description: 'Get a copy of program verbose log of 1000 chars by default.'},
            // {command: '/lock', description: 'Lock the target talker to avoid being interrupted.'},
            // {command: '/spoiler', description: 'Add spoiler to the replied message.'},
            // Add more commands as needed
        ],
        placeholder: `Start---\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\nStop----`,
    },
    coProcessor: {
        isPreStateValid: function (preState, targetQN) {
            try {
                const _ = preState;
                // noinspection JSUnresolvedVariable
                const lastDate = (_.tgMsg) ? (_.tgMsg.edit_date || _.tgMsg.date) : 0;
                const nowDate = dayjs().unix();
                return (_.pers_id === targetQN && nowDate - lastDate < 12);
            } catch (e) {
                defLogger.debug(`Error occurred while validating pre__State.\n\t${e.toString()}`);
                return false;
            }
        }
    },
    httpsCurl: async function (url) {
        return new Promise((resolve, reject) => {
            https.get(url, {}, (response) => {
                resolve("SUCCESS");
            }).on('error', (error) => {
                reject(error);
            });
        });
    }
}