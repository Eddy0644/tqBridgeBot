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
    uploadFileToUpyun: async (filename, options) => {
        // version 20230606 from ctBridge
        return new Promise(async (resolve, reject) => {
            const {password, webFilePathPrefix, operatorName, urlPrefix, urlPathPrefix} = options;
            const generateAPIKey = (password) => crypto.createHash('md5').update(password).digest('hex');
            const generateSignature = (apiKey, signatureData) => {
                const hmac = crypto.createHmac('sha1', apiKey);
                hmac.update(signatureData);
                return hmac.digest('base64');
            };
            const getFileContentMD5 = async (filePath2) => {
                const fileContent = fs.readFileSync(filePath2);
                return crypto.createHash('md5').update(fileContent).digest('hex');
            };
            const apiKey = generateAPIKey(password);
            const method = 'PUT';
            const date = new Date().toUTCString(); // Generate UTC timestamp
            const filePathPrefix = `./downloaded/stickerTG/`;
            const filePath = `${webFilePathPrefix}/${filename}`;
            const fileStream = fs.createReadStream(`${filePathPrefix}${filename}`);
            const contentMD5 = await getFileContentMD5(`${filePathPrefix}${filename}`);
            const signatureData = `${method}&${filePath}&${date}&${contentMD5}`;
            const signature = generateSignature(apiKey, signatureData);
            const authHeader = `UPYUN ${operatorName}:${signature}`;
            const requestUrl = `https://v0.api.upyun.com${filePath}`;

            const requestOptions = {
                method,
                headers: {
                    'Authorization': authHeader,
                    'Content-Type': 'image/webp',
                    'Date': date,
                    'Content-MD5': contentMD5,
                }
            };
            const req = https.request(requestUrl, requestOptions, (res) => {
                let data = "";
                res.on('data', (chunk) => {
                    data = data + chunk.toString();
                });
                res.on('end', () => {
                    if (res.statusCode === 200) {
                        resolve({
                            ok: 1,
                            filePath: `${urlPrefix}${urlPathPrefix}/${filename}`,
                            msg: data
                        });
                    } else {
                        resolve({
                            ok: 0,
                            msg: `Upyun server returned non-200 response.\n${data}`
                        });
                    }
                });
            });
            req.on('error', (e) => {
                resolve({
                    ok: 0,
                    msg: `Error occurred during upload-to-Upyun request: ${e.toString()}`
                });
            });

            fileStream.pipe(req);
            fileStream.on('end', () => req.end());
        });
    }
}