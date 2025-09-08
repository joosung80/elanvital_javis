/**
 * GPT 서비스 - 모든 GPT 호출을 중앙에서 관리
 */

const { getOpenAIClient, logOpenAICall } = require('../utils/openaiClient');
const { getGPTModel } = require('../config/models');

/**
 * GPT API를 호출하는 공용 함수
 * @param {string} feature - 기능 이름 (FEATURE_MODELS의 키)
 * @param {Array} messages - 메시지 배열 [{role: 'system', content: '...'}, {role: 'user', content: '...'}]
 * @param {Object} options - 추가 옵션
 * @param {number} options.temperature - 온도 (기본값: 모델별 기본값 사용)
 * @param {number} options.max_tokens - 최대 토큰 (기본값: null)
 * @param {Object} options.response_format - 응답 형식 (기본값: null)
 * @param {string} options.purpose - 로그용 목적 설명 (기본값: feature)
 * @returns {Promise<Object>} GPT 응답 객체
 */
async function callGPT(feature, messages, options = {}) {
    const {
        temperature = null, // 기본값을 null로 설정하여 모델별 기본값 사용
        max_tokens = null,
        response_format = null,
        purpose = feature
    } = options;

    try {
        const openai = getOpenAIClient();
        const model = getGPTModel(feature);

        // API 호출 옵션 구성
        const apiOptions = {
            model: model,
            messages: messages
        };

        // 선택적 옵션 추가 (값이 있을 때만)
        if (temperature !== null) apiOptions.temperature = temperature;
        if (max_tokens) apiOptions.max_tokens = max_tokens;
        if (response_format) apiOptions.response_format = response_format;

        console.log(`🤖 GPT 호출: ${feature} (${model})`);
        
        const response = await openai.chat.completions.create(apiOptions);
        
        // 로그 출력
        logOpenAICall(model, response.usage, purpose);
        
        return response;

    } catch (error) {
        const model = getGPTModel(feature);
        console.error(`❌ GPT 호출 실패 (${feature}, ${model}):`, error.message);
        
        // 모델 관련 에러인 경우 추가 정보 제공
        if (error.message.includes('model') || error.message.includes('temperature') || error.message.includes('Unsupported')) {
            console.error(`🔧 모델 호환성 문제 가능성: ${model}`);
            console.error(`📋 사용된 옵션:`, apiOptions);
        }
        
        throw error;
    }
}

/**
 * GPT 응답에서 텍스트 내용만 추출하는 헬퍼 함수
 * @param {Object} response - GPT 응답 객체
 * @returns {string} 응답 텍스트
 */
function extractContent(response) {
    return response.choices[0].message.content;
}

/**
 * GPT 응답에서 JSON을 파싱하는 헬퍼 함수
 * @param {Object} response - GPT 응답 객체
 * @returns {Object} 파싱된 JSON 객체
 */
function extractJSON(response) {
    const content = extractContent(response);
    // ```json 태그 제거
    const cleanContent = content.replace(/```json/g, '').replace(/```/g, '').trim();
    return JSON.parse(cleanContent);
}

/**
 * 간단한 GPT 호출 (텍스트 응답)
 * @param {string} feature - 기능 이름
 * @param {string} systemPrompt - 시스템 프롬프트
 * @param {string} userPrompt - 사용자 프롬프트
 * @param {Object} options - 추가 옵션
 * @returns {Promise<string>} GPT 응답 텍스트
 */
async function askGPT(feature, systemPrompt, userPrompt, options = {}) {
    const messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
    ];
    
    const response = await callGPT(feature, messages, options);
    return extractContent(response);
}

/**
 * JSON 응답을 요청하는 GPT 호출
 * @param {string} feature - 기능 이름
 * @param {string} systemPrompt - 시스템 프롬프트
 * @param {string} userPrompt - 사용자 프롬프트
 * @param {Object} options - 추가 옵션
 * @returns {Promise<Object>} 파싱된 JSON 객체
 */
async function askGPTForJSON(feature, systemPrompt, userPrompt, options = {}) {
    const messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
    ];
    
    // JSON 응답 형식 강제
    const jsonOptions = {
        ...options,
        response_format: { type: "json_object" }
    };
    
    const response = await callGPT(feature, messages, jsonOptions);
    return extractJSON(response);
}

module.exports = {
    callGPT,
    extractContent,
    extractJSON,
    askGPT,
    askGPTForJSON
};
