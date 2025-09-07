const OpenAI = require('openai');

let openaiClient = null;

/**
 * OpenAI 클라이언트 싱글톤 인스턴스를 반환합니다.
 * @returns {OpenAI} OpenAI 클라이언트 인스턴스
 */
function getOpenAIClient() {
    if (!openaiClient) {
        if (!process.env.OPENAI_API_KEY) {
            throw new Error('OpenAI API 키가 설정되지 않았습니다. .env 파일에 OPENAI_API_KEY를 설정해주세요.');
        }
        
        openaiClient = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY,
        });
        
        console.log('[OPENAI] ✅ OpenAI 클라이언트 초기화 완료 (싱글톤)');
    }
    
    return openaiClient;
}

module.exports = {
    getOpenAIClient
};
