const OpenAI = require('openai');
require('dotenv').config();

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

// 사용자 세션 저장소 (실제 프로덕션에서는 데이터베이스 사용)
const userSessions = new Map();

/**
 * 사용자 세션 정보를 저장합니다.
 * @param {string} userId - Discord 사용자 ID
 * @param {Object} sessionData - 세션 데이터
 */
function saveUserSession(userId, sessionData) {
    userSessions.set(userId, {
        ...userSessions.get(userId),
        ...sessionData,
        timestamp: new Date().toISOString()
    });
}

/**
 * 사용자 세션 정보를 가져옵니다.
 * @param {string} userId - Discord 사용자 ID
 * @returns {Object|null} 세션 데이터
 */
function getUserSession(userId) {
    return userSessions.get(userId) || null;
}

/**
 * 사용자 입력을 3가지 카테고리로 분류합니다.
 * @param {string} content - 사용자 입력 텍스트
 * @param {Array} attachments - 첨부파일 배열
 * @param {string} userId - Discord 사용자 ID
 * @returns {Object} 분류 결과
 */
async function classifyUserInput(content, attachments = [], userId) {
    // 사용자 세션 정보 저장
    const sessionData = {
        firstPrompt: content,
        attachments: attachments.map(att => ({
            name: att.name,
            contentType: att.contentType,
            size: att.size,
            url: att.url
        })),
        userId: userId
    };
    
    // 최초 사용자 행위 기억
    if (!getUserSession(userId)) {
        saveUserSession(userId, { ...sessionData, isFirstInteraction: true });
    } else {
        saveUserSession(userId, sessionData);
    }

    const now = new Date();
    const prompt = `
현재 시간: ${now.toISOString()}
현재 한국 시간: ${now.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}
현재 요일: ${now.toLocaleDateString('ko-KR', { weekday: 'long', timeZone: 'Asia/Seoul' })}
현재 날짜: ${now.toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' })}
현재 월: ${now.getMonth() + 1}월
현재 년도: ${now.getFullYear()}년

다음 사용자 입력을 분석하여 정확히 3가지 카테고리 중 하나로 분류해주세요:

1. SCHEDULE - 스케줄 관리 기능
   - 일정 추가, 조회, 삭제 관련
   - 시간, 날짜 관련 표현 포함
   - 예: "내일 9시에 만남", "오늘 일정 알려줘", "이번주 스케줄"
   
   스케줄 타입별 처리:
   - query (조회): "오늘/내일/이번주/다음주 일정 알려줘" → period 추출
   - add (추가): "내일 6시에 영준이와 저녁식사" → 전체 텍스트 보존 (LLM이 시간과 내용을 모두 파싱)
   - delete (삭제): "오늘 회의 취소해줘" → 삭제 대상 추출
   
   중요: 일정 추가시 시간 정보와 내용을 분리하지 말고 원본 텍스트를 그대로 전달하여 
   Gemini가 정확한 날짜 계산과 시간 파싱을 수행하도록 합니다.

2. IMAGE - 이미지 생성 기능  
   - 이미지 생성, 수정 요청
   - "그려줘", "만들어줘", "이미지", "그림", "create", "generate" 등 포함
   - 예: "고양이 그림 그려줘", "create a picture", "이미지 만들어줘"

3. GENERAL - 일반 프롬프트 (기본 카테고리)
   - 위 두 카테고리에 해당하지 않는 모든 것
   - 일반적인 질문, 대화, 정보 요청, 설명 요청 등
   - 텍스트, 문서 파일 첨부 포함
   - 예: "안녕하세요", "날씨가 어때?", "프로그래밍 질문", "설명해줘", "도움말"
   - 확실하지 않은 경우 GENERAL로 분류하세요

사용자 입력:
텍스트: "${content}"
첨부파일: ${attachments.length > 0 ? attachments.map(att => `${att.name} (${att.contentType})`).join(', ') : '없음'}

응답은 반드시 다음 JSON 형식으로만 답변해주세요:

SCHEDULE 카테고리인 경우:
{
  "category": "SCHEDULE",
  "confidence": 0.95,
  "reason": "분류 이유 설명",
  "scheduleType": "query|add|delete",
  "extractedInfo": {
    "period": "오늘|내일|어제|이번주|다음주|지난주|이번달|다음달|지난달",
    "content": "일정 추가시에는 시간과 내용을 모두 포함한 전체 텍스트, 조회시에는 빈 문자열"
  }
}

중요: 일정 추가(add)의 경우 시간 정보와 내용을 분리하지 말고 원본 텍스트 전체를 보존하세요.

다른 카테고리인 경우:
{
  "category": "IMAGE|GENERAL",
  "confidence": 0.95,
  "reason": "분류 이유 설명"
}
`;

    try {
        const response = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                {
                    role: "system",
                    content: "당신은 사용자 입력을 3가지 카테고리로 분류하는 전문가입니다. 반드시 JSON 형식으로만 답변하세요."
                },
                {
                    role: "user",
                    content: prompt
                }
            ],
            temperature: 0.1,
            max_tokens: 200
        });
        
        const responseText = response.choices[0].message.content;
        
        // JSON 파싱
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            const classification = JSON.parse(jsonMatch[0]);
            
            // 이미지 첨부파일이 있는 경우 IMAGE 카테고리로 강제 분류
            if (attachments.some(att => att.contentType && att.contentType.startsWith('image/'))) {
                classification.category = 'IMAGE';
                classification.reason = '이미지 첨부파일이 포함되어 IMAGE 카테고리로 분류됨';
            }
            
            return {
                ...classification,
                sessionData: getUserSession(userId)
            };
        }
        
        // JSON 파싱 실패 시 기본값
        return {
            category: 'GENERAL',
            confidence: 0.5,
            reason: '분류 실패로 기본 카테고리 적용',
            sessionData: getUserSession(userId)
        };
        
    } catch (error) {
        console.error('Classification error:', error);
        return {
            category: 'GENERAL',
            confidence: 0.0,
            reason: '오류로 인한 기본 카테고리 적용',
            error: error.message,
            sessionData: getUserSession(userId)
        };
    }
}


module.exports = {
    classifyUserInput,
    saveUserSession,
    getUserSession
};
