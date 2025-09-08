const { Events } = require('discord.js');
const { handleMessageCreate } = require('../utils/messageHandler'); // messageHandler를 utils에서 가져옵니다.

module.exports = {
    name: Events.MessageCreate,
    async execute(message, client) {
        await handleMessageCreate(message, client);
    },
};
