const { classifyUserInput } = require('../classifier');
const { saveConversation } = require('../utils/memoryHandler');
const { transcribeAudio } = require('../utils/voiceHandler');
const { handleScheduleRequest } = require('../utils/scheduleHandler');
const { handleImageRequest } = require('../utils/imageHandler');
const { handleDocumentRequest, handleGoogleDocsKeywordSearchRequest, handleDocumentSummarizationRequest } = require('../utils/documentHandler');
const { handleTaskRequest } = require('../utils/taskHandler');
const { handleGeneralRequest } = require('../utils/generalHandler');
const { handleMemoryRequest } = require('../utils/memoryHandler');   // 이 부분은 saveConversation과 중복되므로 정리 필요

const docsSearchSessions = new Map();

async function handleMessageCreate(message) {
    if (message.author.bot) return;

    console.log(`[MESSAGE] 💬 수신 메시지: "${message.content}" (${message.author.username})`);
    
    let actualContent = message.content;
    
    // 음성 메시지 처리
    if (message.attachments.size > 0) {
        const attachment = message.attachments.first();
        if (attachment.contentType && attachment.contentType.startsWith('audio/')) {
            try {
                const thinkingMessage = await message.reply('🎤 음성 메시지를 텍스트로 변환 중입니다...');
                actualContent = await transcribeAudio(attachment.url, attachment.name);
                await thinkingMessage.edit(`> **${message.author.username}:** ${actualContent}`);
            } catch (error) {
                console.error('음성 변환 실패:', error);
                await message.reply('죄송합니다, 음성 메시지를 변환하는 데 실패했습니다.');
                return;
            }
        }
    }

    // 텍스트 내용이 없으면 더 이상 진행하지 않음
    if (!actualContent) {
        console.log('[MESSAGE] 내용이 없는 메시지이므로 처리를 중단합니다.');
        return;
    }

    try {
        const classification = await classifyUserInput(actualContent, [], message.author.id);
        console.log(`[CLASSIFY] User: ${message.author.tag}, Category: ${classification.category}`);

        let botResponse = '';
        switch (classification.category) {
            case 'DOCUMENT':
                if (classification.documentType === 'google_docs_keyword_search') {
                    await handleGoogleDocsKeywordSearchRequest(message, classification.extractedInfo.searchKeyword, docsSearchSessions);
                } else if (classification.documentType === 'summarize_document') {
                    await handleDocumentSummarizationRequest(message);
                } else {
                    await handleDocumentRequest(message, classification); // 일반 문서 요청
                }
                break;
            case 'IMAGE':
                botResponse = await handleImageRequest(message, actualContent);
                break;
            case 'TASK':
                botResponse = await handleTaskRequest(message, classification);
                break;
            case 'SCHEDULE':
                botResponse = await handleScheduleRequest(message, classification, actualContent);
                break;
            // ... 다른 case들 ...
            default:
                botResponse = await handleGeneralRequest(message, actualContent);
                break;
        }

        await saveConversation(message.author.id, actualContent, botResponse || '응답 완료', classification.category);

    } catch (error) {
        console.error('Error in message processing:', error);
        await message.reply('죄송합니다. 요청을 처리하는 동안 오류가 발생했습니다.');
    }
}

module.exports = { 
    handleMessageCreate,
    docsSearchSessions
};
