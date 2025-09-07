/**
 * 채팅 메모리 관리 시스템
 * - 이미지 메모리: 업로드된 이미지 기억 및 재사용
 * - 대화 메모리: 이전 대화 내용과 컨텍스트 유지
 * - 세션 관리: 사용자별 메모리 세션 관리
 * - 대화 압축: 오래된 대화들을 요약하여 메모리 효율성 증대
 */


const userMemories = new Map();

/**
 * 사용자 메모리 객체를 가져오거나 생성합니다.
 * @param {string} userId - Discord 사용자 ID
 * @returns {Object} 사용자 메모리 객체
 */
function getUserMemory(userId) {
    if (!userMemories.has(userId)) {
        console.log(`[MEMORY DEBUG] 🆕 새로운 메모리 생성 for user: ${userId}`);
        userMemories.set(userId, {
            conversations: [],
            lastDocuments: [],
            recentDocuments: [],
            lastImageUrl: null,
            lastImageMimeType: null,
            lastTopic: 'GENERAL',
            sessionType: 'TEXT',
            compressedHistory: null
        });
    } else {
        // console.log(`[MEMORY DEBUG] 🔍 기존 메모리 접근 for user: ${userId}`);
    }
    return userMemories.get(userId);
}

/**
 * 문서를 메모리에 저장합니다.
 * @param {string} userId - 사용자 ID
 * @param {Array<object>|object} documents - 저장할 문서 객체 또는 객체 배열
 */
async function saveDocumentsToMemory(userId, documents) {
    const docsToSave = Array.isArray(documents) ? documents : [documents];

    if (docsToSave.length === 0 || !docsToSave[0]) {
        console.log(`[MEMORY] ❌ 저장할 문서 없음: ${userId}`);
        return;
    }

    const memory = getUserMemory(userId);

    memory.lastDocuments = docsToSave.map(doc => ({
        title: doc.title,
        content: doc.content,
        source: doc.source || '파일',
        url: doc.url,
        timestamp: new Date().toISOString()
    }));

    memory.recentDocuments.unshift(...memory.lastDocuments);
    if (memory.recentDocuments.length > 10) {
        memory.recentDocuments.length = 10;
    }

    memory.lastTopic = 'DOCUMENT';
    memory.sessionType = 'DOCUMENT';

    console.log(`[MEMORY] ✅ ${docsToSave.length}개 문서 컨텍스트 저장 완료: ${userId}`);
    console.log(`[MEMORY] 📌 저장된 문서 제목: ${docsToSave.map(d => d.title).join(', ')}`);
}

/**
 * 현재 컨텍스트(마지막 주제, 세션 타입 등)를 가져옵니다.
 * @param {string} userId - 사용자 ID
 * @returns {object} 현재 컨텍스트 객체
 */
function getCurrentContext(userId) {
    const memory = getUserMemory(userId);
    return {
        lastImageUrl: memory.lastImageUrl,
        lastImageMimeType: memory.lastImageMimeType,
        lastTopic: memory.lastTopic,
        sessionType: memory.sessionType,
        lastDocuments: memory.lastDocuments || [],
        compressedHistory: memory.compressedHistory,
        recentDocuments: memory.recentDocuments || []
    };
}

/**
 * 최근 대화 기록을 가져옵니다.
 * @param {string} userId - Discord 사용자 ID
 * @param {number} count - 가져올 대화 수
 * @returns {Array<Object>} 최근 대화 배열
 */
function getRecentConversations(userId, count = 5) {
    const memory = getUserMemory(userId);
    const conversations = memory.conversations.slice(0, count);
    console.log(`[MEMORY DEBUG] 📚 대화 기록 조회: ${conversations.length}개 요청, ${conversations.length}개 반환 for user: ${userId}`);
    return conversations;
}

/**
 * 대화 내용을 메모리에 저장합니다.
 * @param {string} userId - Discord 사용자 ID
 * @param {string} userMessage - 사용자 메시지
 * @param {string} botResponse - 봇 응답
 * @param {string} category - 대화 카테고리
 */
function saveConversation(userId, userMessage, botResponse, category) {
    const memory = getUserMemory(userId);
    const conversation = {
        userMessage,
        botResponse,
        category,
        timestamp: new Date().toISOString()
    };
    memory.conversations.unshift(conversation); // 새 대화를 배열 맨 앞에 추가
    if (memory.conversations.length > 10) { // 최대 10개 대화만 유지
        memory.conversations.pop();
    }
    
    // 마지막 주제와 세션 타입 업데이트
    memory.lastTopic = category;
    if (category === 'IMAGE' || category === 'DOCUMENT') {
        memory.sessionType = category;
    } else {
        memory.sessionType = 'TEXT';
    }

    console.log(`[MEMORY] 💬 대화 저장됨: ${userId} - ${category} (컨텍스트 업데이트)`);
    console.log(`[MEMORY DEBUG] 💾 저장 후 대화 수: ${memory.conversations.length}개 for user: ${userId}`);
    console.log(`[MEMORY DEBUG] 맵 전체 상태:`, [...userMemories.keys()]);
}

/**
 * 이미지 컨텍스트를 메모리에 저장합니다.
 * @param {string} userId - 사용자 ID
 * @param {string} url - 이미지 URL
 * @param {string} mimeType - 이미지 MIME 타입
 */
function saveImageContext(userId, url, mimeType) {
    const memory = getUserMemory(userId);
    memory.lastImageUrl = url;
    memory.lastImageMimeType = mimeType;
    memory.lastTopic = 'IMAGE';
    memory.sessionType = 'IMAGE';
    console.log(`[MEMORY] 🖼️ 이미지 컨텍스트 저장: ${userId}`);
}

/**
 * 디버그 로깅을 위해 문서 내용을 포맷팅합니다.
 * @param {string} content - 원본 문서 내용
 * @returns {string} 포맷팅된 내용 (첫 10줄 + 총 라인 수)
 */
function formatContentForLogging(content) {
    if (!content) {
        return '내용 없음';
    }
    const lines = content.split('\n');
    const totalLines = lines.length;

    if (totalLines <= 10) {
        return content;
    }

    const partialContent = lines.slice(0, 10).join('\n');
    return `${partialContent}\n... (총 ${totalLines}줄)`;
}

module.exports = {
    getUserMemory,
    saveDocumentsToMemory,
    getCurrentContext,
    getRecentConversations,
    saveConversation,
    saveImageContext,
    formatContentForLogging // export 추가
};
