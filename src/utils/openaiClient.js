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
        
        console.log('🤖 OpenAI 클라이언트 준비 완료');
    }
    
    return openaiClient;
}

/**
 * 토큰 사용량을 k 단위로 포맷합니다.
 * @param {number} tokens - 토큰 수
 * @returns {string} 포맷된 토큰 수
 */
function formatTokens(tokens) {
    if (!tokens) return '0';
    if (tokens < 1000) return tokens.toString();
    return (tokens / 1000).toFixed(1) + 'k';
}

/**
 * OpenAI API 호출 로그를 출력합니다.
 * @param {string} model - 모델명
 * @param {Object} usage - 사용량 정보
 * @param {string} purpose - 호출 목적
 */
function logOpenAICall(model, usage, purpose) {
    const inputTokens = formatTokens(usage?.prompt_tokens);
    const outputTokens = formatTokens(usage?.completion_tokens);
    const totalTokens = formatTokens(usage?.total_tokens);
    
    console.log(`💰 ${model} 호출 (${purpose}) - 입력: ${inputTokens}, 출력: ${outputTokens}, 총: ${totalTokens} 토큰`);
}

/**
 * Gemini API 호출 로그를 출력합니다.
 * @param {string} model - 모델명
 * @param {number} duration - 호출 시간 (ms)
 * @param {string} purpose - 호출 목적
 * @param {Object} usage - 사용량 정보 (선택적)
 */
function logGeminiCall(model, duration, purpose, usage = null) {
    const durationStr = duration < 1000 ? `${duration}ms` : `${(duration / 1000).toFixed(1)}s`;
    
    // 빌링 상태 확인
    const billingStatus = getGeminiBillingStatus(model);
    const billingIcon = billingStatus === 'PAID' ? '💳' : '🆓';
    const billingText = billingStatus === 'PAID' ? '유료' : '무료';
    
    if (usage) {
        // 다양한 토큰 필드 확인
        const totalTokens = usage.totalTokenCount || usage.total_tokens || usage.totalTokens;
        const inputTokens = usage.promptTokenCount || usage.prompt_tokens || usage.inputTokens;
        const outputTokens = usage.candidatesTokenCount || usage.completion_tokens || usage.outputTokens;
        
        if (totalTokens) {
            const totalStr = formatTokens(totalTokens);
            const inputStr = inputTokens ? formatTokens(inputTokens) : '?';
            const outputStr = outputTokens ? formatTokens(outputTokens) : '?';
            console.log(`${billingIcon} ${model} 호출 (${purpose}) [${billingText}] - 시간: ${durationStr}, 입력: ${inputStr}, 출력: ${outputStr}, 총: ${totalStr} 토큰`);
        } else {
            console.log(`${billingIcon} ${model} 호출 (${purpose}) [${billingText}] - 시간: ${durationStr}`);
        }
    } else {
        console.log(`${billingIcon} ${model} 호출 (${purpose}) [${billingText}] - 시간: ${durationStr}`);
    }
}

/**
 * Gemini API의 빌링 상태를 확인합니다.
 * @param {string} model - 모델명
 * @returns {string} 'PAID' 또는 'FREE'
 */
function getGeminiBillingStatus(model) {
    // 환경 변수로 빌링 설정 확인
    const hasBilling = process.env.GEMINI_BILLING_ENABLED === 'true' || process.env.GOOGLE_CLOUD_BILLING_ENABLED === 'true';
    
    // 유료 전용 모델 확인
    const paidOnlyModels = [
        'gemini-2.5-pro',
        'gemini-2.5-flash',
        'gemini-2.5-flash-image-preview'
    ];
    
    const isPaidModel = paidOnlyModels.some(paidModel => model.includes(paidModel));
    
    // 빌링이 설정되어 있거나 유료 전용 모델을 사용하는 경우 유료로 판단
    if (hasBilling || isPaidModel) {
        return 'PAID';
    }
    
    return 'FREE';
}

module.exports = {
    getOpenAIClient,
    formatTokens,
    logOpenAICall,
    logGeminiCall,
    getGeminiBillingStatus
};
