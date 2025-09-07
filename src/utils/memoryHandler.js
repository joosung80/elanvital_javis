/**
 * 채팅 메모리 관리 시스템
 * - 이미지 메모리: 업로드된 이미지 기억 및 재사용
 * - 대화 메모리: 이전 대화 내용과 컨텍스트 유지
 * - 세션 관리: 사용자별 메모리 세션 관리
 */

// 사용자별 메모리 저장소
const userMemories = new Map();

// 메모리 만료 시간 (24시간)
const MEMORY_EXPIRY_TIME = 24 * 60 * 60 * 1000;

/**
 * 사용자 메모리 구조
 * {
 *   userId: string,
 *   lastActivity: Date,
 *   images: [{
 *     url: string,
 *     mimeType: string,
 *     uploadTime: Date,
 *     description: string
 *   }],
 *   conversations: [{
 *     timestamp: Date,
 *     userMessage: string,
 *     botResponse: string,
 *     category: string,
 *     context: object
 *   }],
 *   currentContext: {
 *     lastImageUrl: string,
 *     lastImageMimeType: string,
 *     lastTopic: string,
 *     sessionType: string
 *   }
 * }
 */

/**
 * 사용자 메모리 초기화 또는 가져오기
 * @param {string} userId - 사용자 ID
 * @returns {Object} 사용자 메모리 객체
 */
function getUserMemory(userId) {
    if (!userMemories.has(userId)) {
        userMemories.set(userId, {
            userId,
            lastActivity: new Date(),
            images: [],
            conversations: [],
            currentContext: {
                lastImageUrl: null,
                lastImageMimeType: null,
                lastTopic: null,
                sessionType: null
            }
        });
        console.log(`[MEMORY] 🆕 새로운 사용자 메모리 생성: ${userId}`);
    }
    
    const memory = userMemories.get(userId);
    memory.lastActivity = new Date();
    return memory;
}

/**
 * 이미지를 메모리에 저장
 * @param {string} userId - 사용자 ID
 * @param {string} imageUrl - 이미지 URL
 * @param {string} mimeType - 이미지 MIME 타입
 * @param {string} description - 이미지 설명 (선택사항)
 */
function saveImageToMemory(userId, imageUrl, mimeType, description = '') {
    const memory = getUserMemory(userId);
    
    const imageData = {
        url: imageUrl,
        mimeType: mimeType,
        uploadTime: new Date(),
        description: description
    };
    
    // 새 이미지를 맨 앞에 추가 (최신순)
    memory.images.unshift(imageData);
    
    // 최대 10개의 이미지만 보관
    if (memory.images.length > 10) {
        memory.images = memory.images.slice(0, 10);
    }
    
    // 현재 컨텍스트 업데이트
    memory.currentContext.lastImageUrl = imageUrl;
    memory.currentContext.lastImageMimeType = mimeType;
    
    console.log(`[MEMORY] 📸 이미지 저장됨: ${userId} - ${imageUrl.substring(0, 50)}...`);
    console.log(`[MEMORY] 📊 총 저장된 이미지 수: ${memory.images.length}`);
}

/**
 * 가장 최근 이미지 가져오기
 * @param {string} userId - 사용자 ID
 * @returns {Object|null} 이미지 데이터 또는 null
 */
function getLastImage(userId) {
    const memory = getUserMemory(userId);
    
    if (memory.images.length > 0) {
        const lastImage = memory.images[0];
        console.log(`[MEMORY] 🔍 최근 이미지 반환: ${lastImage.url.substring(0, 50)}...`);
        return lastImage;
    }
    
    console.log(`[MEMORY] ❌ 저장된 이미지 없음: ${userId}`);
    return null;
}

/**
 * 대화 내용을 메모리에 저장
 * @param {string} userId - 사용자 ID
 * @param {string} userMessage - 사용자 메시지
 * @param {string} botResponse - 봇 응답
 * @param {string} category - 카테고리 (IMAGE, SCHEDULE, GENERAL)
 * @param {Object} context - 추가 컨텍스트 정보
 */
function saveConversationToMemory(userId, userMessage, botResponse, category, context = {}) {
    const memory = getUserMemory(userId);
    
    const conversationData = {
        timestamp: new Date(),
        userMessage: userMessage,
        botResponse: botResponse,
        category: category,
        context: context
    };
    
    // 새 대화를 맨 앞에 추가 (최신순)
    memory.conversations.unshift(conversationData);
    
    // 최대 50개의 대화만 보관
    if (memory.conversations.length > 50) {
        memory.conversations = memory.conversations.slice(0, 50);
    }
    
    // 현재 컨텍스트 업데이트
    memory.currentContext.lastTopic = category;
    memory.currentContext.sessionType = category;
    
    console.log(`[MEMORY] 💬 대화 저장됨: ${userId} - ${category}`);
    console.log(`[MEMORY] 📊 총 저장된 대화 수: ${memory.conversations.length}`);
}

/**
 * 최근 대화 내용 가져오기
 * @param {string} userId - 사용자 ID
 * @param {number} limit - 가져올 대화 수 (기본값: 5)
 * @returns {Array} 최근 대화 배열
 */
function getRecentConversations(userId, limit = 5) {
    const memory = getUserMemory(userId);
    const recent = memory.conversations.slice(0, limit);
    
    console.log(`[MEMORY] 📜 최근 대화 ${recent.length}개 반환: ${userId}`);
    return recent;
}

/**
 * 현재 컨텍스트 가져오기
 * @param {string} userId - 사용자 ID
 * @returns {Object} 현재 컨텍스트
 */
function getCurrentContext(userId) {
    const memory = getUserMemory(userId);
    console.log(`[MEMORY] 🎯 현재 컨텍스트 반환: ${userId}`, memory.currentContext);
    return memory.currentContext;
}

/**
 * 컨텍스트 업데이트
 * @param {string} userId - 사용자 ID
 * @param {Object} contextUpdate - 업데이트할 컨텍스트 정보
 */
function updateContext(userId, contextUpdate) {
    const memory = getUserMemory(userId);
    Object.assign(memory.currentContext, contextUpdate);
    
    console.log(`[MEMORY] 🔄 컨텍스트 업데이트: ${userId}`, contextUpdate);
}

/**
 * 메모리에서 이미지와 텍스트 프롬프트 조합 확인
 * @param {string} userId - 사용자 ID
 * @param {string} textPrompt - 텍스트 프롬프트
 * @returns {Object|null} 이미지 정보 또는 null
 */
function checkForImageMemory(userId, textPrompt) {
    const memory = getUserMemory(userId);
    
    // 최근 이미지가 있는지 확인
    if (memory.currentContext.lastImageUrl) {
        console.log(`[MEMORY] 🔗 이미지 메모리 활용: 텍스트 "${textPrompt}"와 저장된 이미지 조합`);
        return {
            url: memory.currentContext.lastImageUrl,
            mimeType: memory.currentContext.lastImageMimeType,
            isFromMemory: true
        };
    }
    
    return null;
}

/**
 * 만료된 메모리 정리
 */
function cleanupExpiredMemories() {
    const now = new Date();
    let cleanedCount = 0;
    
    for (const [userId, memory] of userMemories.entries()) {
        const timeDiff = now - memory.lastActivity;
        
        if (timeDiff > MEMORY_EXPIRY_TIME) {
            userMemories.delete(userId);
            cleanedCount++;
            console.log(`[MEMORY] 🗑️ 만료된 메모리 삭제: ${userId}`);
        }
    }
    
    if (cleanedCount > 0) {
        console.log(`[MEMORY] 🧹 메모리 정리 완료: ${cleanedCount}개 사용자 메모리 삭제`);
    }
}

/**
 * 메모리 통계 정보
 * @returns {Object} 메모리 통계
 */
function getMemoryStats() {
    const stats = {
        totalUsers: userMemories.size,
        totalImages: 0,
        totalConversations: 0
    };
    
    for (const memory of userMemories.values()) {
        stats.totalImages += memory.images.length;
        stats.totalConversations += memory.conversations.length;
    }
    
    return stats;
}

// 주기적으로 만료된 메모리 정리 (1시간마다)
setInterval(cleanupExpiredMemories, 60 * 60 * 1000);

module.exports = {
    getUserMemory,
    saveImageToMemory,
    getLastImage,
    saveConversationToMemory,
    getRecentConversations,
    getCurrentContext,
    updateContext,
    checkForImageMemory,
    cleanupExpiredMemories,
    getMemoryStats
};
