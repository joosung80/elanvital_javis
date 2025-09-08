const { Events } = require('discord.js');
const { handleMessageCreate } = require('./messageHandler'); // messageHandler는 구조가 다르므로 직접 가져옵니다.

module.exports = {
    name: Events.MessageCreate,
    async execute(message, client) {
        await handleMessageCreate(message, client);
    },
};
