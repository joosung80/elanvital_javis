/**
 * AI 모델 설정 파일
 * 모든 AI 모델 정보를 중앙에서 관리합니다.
 */

// OpenAI GPT 모델 설정
const GPT_MODELS = {
    // 빠르고 비용 효율적인 모델 (일반적인 작업용)
    FAST: 'gpt-4o-mini',
    
    // 고성능 모델 (복잡한 분석 및 추론용)
    ADVANCED: 'gpt-4.1',
    
    // 최신 모델 (향후 업그레이드용)
    LATEST: 'gpt-5-mini'
};

// Google Gemini 모델 설정
const GEMINI_MODELS = {
    // 이미지 생성 및 편집용
    IMAGE: 'gemini-2.5-flash-image-preview',
    
    // 텍스트 처리용 (향후 확장용)
    TEXT: 'gemini-2.5-flash',
    
    // 프로 버전 (고성능 작업용)
    PRO: 'gemini-2.5-pro'
};

// 기능별 모델 매핑
const FEATURE_MODELS = {
    // 메시지 분류 (정확성 중요)
    CLASSIFICATION: GPT_MODELS.FAST,
    
    // 일반 질문 답변 (속도와 비용 효율성)
    GENERAL_CHAT: GPT_MODELS.FAST,
    
    // 문서 요약 (빠른 처리)
    DOCUMENT_SUMMARY: GPT_MODELS.FAST,
    
    // 스마트 키워드 생성 (빠른 처리)
    KEYWORD_GENERATION: GPT_MODELS.FAST,
    
    // 스마트 키워드 확장 (정확성 중요)
    KEYWORD_EXPANSION: GPT_MODELS.FAST,
    
    // 일정 파싱 (빠른 처리)
    SCHEDULE_PARSING: GPT_MODELS.FAST,
    
    // 시간 범위 파싱 (빠른 처리)
    TIME_RANGE_PARSING: GPT_MODELS.FAST,
    
    // 이미지 프롬프트 개선 (빠른 처리)
    IMAGE_PROMPT_ENHANCEMENT: GPT_MODELS.FAST,
    
    // 이미지 생성/편집
    IMAGE_GENERATION: GEMINI_MODELS.IMAGE
};

// 모델 정보 조회 함수들
function getGPTModel(feature) {
    return FEATURE_MODELS[feature] || GPT_MODELS.FAST;
}

function getGeminiModel(feature) {
    if (feature === 'IMAGE_GENERATION') {
        return GEMINI_MODELS.IMAGE;
    }
    return GEMINI_MODELS.TEXT;
}

// 모델 설명 정보 (help 명령어용)
const MODEL_DESCRIPTIONS = {
    GPT_MAIN: 'GPT-4o-mini', // help 명령어에 표시될 주요 모델명
    GPT_ADVANCED: 'GPT-4-turbo', // 고급 기능용 모델명
    GEMINI_MAIN: 'Gemini AI' // help 명령어에 표시될 Gemini 모델명
};

module.exports = {
    GPT_MODELS,
    GEMINI_MODELS,
    FEATURE_MODELS,
    getGPTModel,
    getGeminiModel,
    MODEL_DESCRIPTIONS
};
