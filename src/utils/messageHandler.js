const { classifyUserInput } = require('../classifier');
const { handleHelpRequest } = require('../commands/help');
const { handleImageRequest } = require('../utils/imageHandler');
const { handleDriveSearchRequest } = require('../utils/driveHandler');
const { handleScheduleRequest } = require('../utils/scheduleHandler');
const { handleTaskRequest } = require('../utils/taskHandler');
const { handleMemoryRequest } = require('../commands/memory');
const { handleGeneralRequest } = require('../utils/generalHandler');
const { transcribeAudio } = require('../utils/voiceHandler');

async function handleMessageCreate(message, client) {
    if (message.author.bot) return;
    
    let actualContent = message.content;
    let botResponse = null;

    if (message.attachments.size > 0) {
        const attachment = message.attachments.first();
        if (attachment.contentType.startsWith('audio/')) {
            try {
                actualContent = await transcribeAudio(attachment.url);
                await message.reply(`> 🔊 **음성 메시지:** "${actualContent}"`);
            } catch (error) {
                await message.reply('음성 메시지를 텍스트로 변환하는 데 실패했습니다.');
                return;
            }
        }
    }

    try {
        const classification = await classifyUserInput(message, client);
        console.log('[CLASSIFY] ✅ 분류 결과:', classification);

        let botResponseContent = null;

        switch (classification.category) {
            case 'HELP':
                botResponseContent = await handleHelpRequest();
                break;
            case 'DRIVE':
                await handleDriveSearchRequest(message, classification, client.driveSearchSessions);
                break;
            case 'SCHEDULE':
                await handleScheduleRequest(message, classification);
                break;
            case 'TASK':
                await handleTaskRequest(message, classification, client.taskSessions);
                break;
            case 'MEMORY':
                botResponseContent = await handleMemoryRequest(message);
                break;
            case 'IMAGE':
                await handleImageRequest(message);
                break;
            case 'GENERAL':
            default:
                botResponseContent = await handleGeneralRequest(message);
                break;
        }

        if (botResponseContent) {
            botResponse = await message.reply(botResponseContent);
        }

        // 대화 저장
        if (botResponse && botResponse.content) {
            client.memory.saveConversation(message.author.id, actualContent, botResponse.content);
        }

    } catch (error) {
        console.error('메시지 처리 중 오류 발생:', error);
        await message.reply('죄송합니다, 메시지를 처리하는 중에 오류가 발생했습니다.');
    }
}

module.exports = {
    handleMessageCreate,
};
