const OpenAI = require('openai');
const fetch = require('node-fetch');

// OpenAI 클라이언트 초기화
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

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
async function processGeneralQuestion(userInput, attachments = [], userId) {
    console.log(`[GENERAL DEBUG] 🤖 일반 질문 처리 시작`);
    console.log(`[GENERAL DEBUG] 👤 사용자 ID: ${userId}`);
    console.log(`[GENERAL DEBUG] 💬 질문: "${userInput}"`);
    console.log(`[GENERAL DEBUG] 📎 첨부파일 수: ${attachments.length}`);
    
    try {
        // 텍스트 파일 필터링
        const textFiles = attachments.filter(att => 
            att.contentType && (
                att.contentType.includes('text/') ||
                att.contentType.includes('application/json') ||
                att.contentType.includes('application/javascript') ||
                att.contentType.includes('application/xml')
            )
        );
        
        // 시스템 프롬프트 구성
        let systemPrompt = `당신은 도움이 되고 친근한 한국어 AI 어시스턴트입니다.
사용자의 질문에 정확하고 유용한 답변을 제공해주세요.

답변 가이드라인:
- 한국어로 자연스럽게 답변해주세요
- 정확하고 도움이 되는 정보를 제공해주세요
- 필요시 예시나 단계별 설명을 포함해주세요
- 모르는 내용은 솔직하게 모른다고 말해주세요
- 답변은 간결하고 명확하게 작성해주세요
- 코드나 기술적 내용은 마크다운 형식으로 작성해주세요`;

        // 사용자 메시지 구성
        let userMessage = userInput;
        
        // 텍스트 파일이 있는 경우 내용 추가
        if (textFiles.length > 0) {
            userMessage += '\n\n첨부된 파일들:\n';
            
            for (const file of textFiles) {
                console.log(`[GENERAL DEBUG] 📄 파일 처리 중: ${file.name}`);
                
                const fileContent = await downloadFileContent(file.url, file.contentType);
                if (fileContent) {
                    // 파일 내용이 너무 긴 경우 제한
                    const maxFileLength = 3000;
                    const truncatedContent = fileContent.length > maxFileLength 
                        ? fileContent.substring(0, maxFileLength) + '\n... (파일이 잘렸습니다)'
                        : fileContent;
                    
                    userMessage += `\n**${file.name}** (${file.contentType}):\n\`\`\`\n${truncatedContent}\n\`\`\`\n`;
                } else {
                    userMessage += `\n**${file.name}** (${file.contentType}): 파일을 읽을 수 없습니다.\n`;
                }
            }
            
            userMessage += '\n위 파일 내용을 참고하여 답변해주세요.';
        }
        
        console.log(`[GENERAL DEBUG] 🤖 OpenAI GPT-4o-mini API 호출 중...`);
        
        // OpenAI API 호출
        const response = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                {
                    role: "system",
                    content: systemPrompt
                },
                {
                    role: "user", 
                    content: userMessage
                }
            ],
            temperature: 0.7,
            max_tokens: 2000,
            top_p: 1,
            frequency_penalty: 0,
            presence_penalty: 0
        });
        
        const aiResponse = response.choices[0].message.content;
        
        console.log(`[GENERAL DEBUG] 📝 응답 길이: ${aiResponse.length}자`);
        console.log(`[GENERAL DEBUG] 📄 응답 미리보기: ${aiResponse.substring(0, 100)}...`);
        
        // 모바일 친화적으로 메시지 분할
        const messageChunks = splitMessageForMobile(aiResponse, 1800);
        
        console.log(`[GENERAL DEBUG] 📤 ${messageChunks.length}개 메시지로 분할`);
        console.log(`[GENERAL DEBUG] ✅ 일반 질문 처리 완료`);
        
        return {
            success: true,
            messageChunks: messageChunks,
            originalResponse: aiResponse
        };
        
    } catch (error) {
        console.error(`[GENERAL DEBUG] ❌ 일반 질문 처리 오류:`, error);
        
        let errorMessage = '죄송합니다. 답변을 생성하는 동안 오류가 발생했습니다.';
        
        if (error.code === 'insufficient_quota') {
            errorMessage = 'OpenAI API 할당량이 부족합니다. 관리자에게 문의해주세요.';
        } else if (error.code === 'invalid_api_key') {
            errorMessage = 'OpenAI API 키가 유효하지 않습니다. 관리자에게 문의해주세요.';
        } else if (error.message && error.message.includes('rate limit')) {
            errorMessage = 'API 요청 한도를 초과했습니다. 잠시 후 다시 시도해주세요.';
        }
        
        return {
            success: false,
            error: error.message,
            messageChunks: [errorMessage]
        };
    }
}

module.exports = {
    processGeneralQuestion,
    splitMessageForMobile
};
