const fetch = require('node-fetch');
const { askGPT } = require('../services/gptService');

/**
 * 모바일 친화적인 메시지 분할 함수
 * @param {string} text - 분할할 텍스트
 * @param {number} maxLength - 최대 길이
 * @returns {Array<string>} 분할된 메시지 배열
 */
function splitMessageForMobile(text, maxLength = 1800) {
    if (text.length <= maxLength) return [text];
    
    const chunks = [];
    let currentChunk = '';
    const lines = text.split('\n');
    
    for (const line of lines) {
        const testChunk = currentChunk + (currentChunk ? '\n' : '') + line;
        
        if (testChunk.length <= maxLength) {
            currentChunk = testChunk;
        } else {
            if (currentChunk) {
                chunks.push(currentChunk);
                currentChunk = line;
            } else {
                chunks.push(line.substring(0, maxLength));
                currentChunk = line.substring(maxLength);
            }
        }
    }
    
    if (currentChunk) {
        chunks.push(currentChunk);
    }
    
    return chunks;
}

/**
 * 파일 내용을 다운로드하고 텍스트로 변환합니다.
 * @param {string} url - 파일 URL
 * @param {string} contentType - 파일 타입
 * @returns {string|null} 파일 내용 또는 null
 */
async function downloadFileContent(url, contentType) {
    try {
        const response = await fetch(url);
        if (!response.ok) return null;
        
        if (contentType.includes('text/') || contentType.includes('application/json')) {
            return await response.text();
        }
        
        // 다른 파일 타입은 현재 지원하지 않음
        return null;
    } catch (error) {
        console.error(`[GENERAL DEBUG] ❌ 파일 다운로드 오류:`, error);
        return null;
    }
}

/**
 * 일반 질문을 처리합니다.
 * @param {string} userInput - 사용자 입력
 * @param {Array} attachments - 첨부파일 배열
 * @param {string} userId - 사용자 ID
 * @returns {Object} 처리 결과
 */
async function handleGeneralRequest(message, actualContent = null) {
    const { client, author, content } = message;
    const userId = author.id;
    const userInput = actualContent || content;
    
    console.log(`[GENERAL] 일반 질문 처리: "${userInput}"`);

    try {
        const userMemory = client.memory.getUserMemory(userId);
        const recentConversations = client.memory.getRecentConversations(userId);

        const formattedConversations = Array.from(recentConversations.values())
            .map(conv => `User: ${conv.user}\nBot: ${conv.bot}`)
            .join('\n\n');

        const lastDocument = userMemory.lastDocument;
        const documentContext = lastDocument 
            ? `The user has recently read a document titled "${lastDocument.title}".`
            : "There is no document context.";

        const systemPrompt = `You are a helpful and friendly conversational AI assistant named 'Elanvital Agent'.
- Your primary language is Korean.
- Be concise and clear in your answers.
- If you are unsure about something, it's better to say you don't know than to guess.

[Current Conversation Context]
- Document Context: ${documentContext}
- Recent Chat History (up to 5 turns):
${formattedConversations}
`;

        const botResponse = await askGPT('GENERAL_CHAT', systemPrompt, userInput);

        return botResponse;

    } catch (error) {
        console.error('[GENERAL] ❌ 일반 질문 처리 오류:', error);
        return '죄송합니다, 질문을 처리하는 중에 오류가 발생했습니다.';
    }
}

module.exports = { handleGeneralRequest };
