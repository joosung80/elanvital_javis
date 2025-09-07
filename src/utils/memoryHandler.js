/**
 * 채팅 메모리 관리 시스템
 * - 이미지 메모리: 업로드된 이미지 기억 및 재사용
 * - 대화 메모리: 이전 대화 내용과 컨텍스트 유지
 * - 세션 관리: 사용자별 메모리 세션 관리
 * - 대화 압축: 오래된 대화들을 요약하여 메모리 효율성 증대
 */

const OpenAI = require('openai');

// 사용자별 메모리 저장소
const userMemories = new Map();

// 메모리 만료 시간 (24시간)
const MEMORY_EXPIRY_TIME = 24 * 60 * 60 * 1000;

// 대화 압축 설정
const MAX_CONVERSATIONS = 5; // 최대 보관할 대화 수
const COMPRESSION_THRESHOLD = 8; // 이 수를 초과하면 압축 실행

// OpenAI 클라이언트 초기화 (API 키가 있는 경우에만)
let openai = null;
if (process.env.OPENAI_API_KEY) {
  openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });
  console.log('[MEMORY] ✅ OpenAI 클라이언트 초기화 완료');
} else {
  console.log('[MEMORY] ⚠️ OpenAI API 키 없음 - 압축 기능 비활성화');
}

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
 *   documents: [{
 *     filename: string,
 *     content: string,
 *     summary: string,
 *     wordCount: number,
 *     extractedAt: Date,
 *     type: string
 *   }],
 *   conversations: [{
 *     timestamp: Date,
 *     userMessage: string,
 *     botResponse: string,
 *     category: string,
 *     context: object
 *   }],
 *   compressedContext: {
 *     summary: string,
 *     keyTopics: string[],
 *     lastCompression: Date,
 *     originalConversationCount: number
 *   },
 *   currentContext: {
 *     lastImageUrl: string,
 *     lastImageMimeType: string,
 *     lastTopic: string,
 *     sessionType: string,
 *     lastDocuments: array
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
            documents: [],
            conversations: [],
            compressedContext: {
                summary: null,
                keyTopics: [],
                lastCompression: null,
                originalConversationCount: 0
            },
            currentContext: {
                lastImageUrl: null,
                lastImageMimeType: null,
                lastTopic: null,
                sessionType: null,
                lastDocuments: []
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
 * 문서를 메모리에 저장
 * @param {string} userId - 사용자 ID
 * @param {Array} documentContexts - 문서 컨텍스트 배열
 */
function saveDocumentsToMemory(userId, documentContexts) {
    const memory = getUserMemory(userId);
    
    const successfulDocs = documentContexts.filter(doc => doc.type === 'document');
    
    if (successfulDocs.length === 0) {
        console.log(`[MEMORY] ❌ 저장할 문서 없음: ${userId}`);
        return;
    }
    
    // 새 문서들을 메모리에 추가
    successfulDocs.forEach(doc => {
        const documentData = {
            filename: doc.filename,
            content: doc.content,
            summary: doc.summary,
            wordCount: doc.wordCount,
            paragraphCount: doc.paragraphCount,
            lineCount: doc.lineCount,
            extractedAt: doc.extractedAt,
            type: doc.type
        };
        
        memory.documents.unshift(documentData); // 최신 문서를 앞에 추가
    });
    
    // 최대 10개 문서만 유지
    if (memory.documents.length > 10) {
        memory.documents = memory.documents.slice(0, 10);
    }
    
    // 현재 컨텍스트 업데이트
    memory.currentContext.lastDocuments = successfulDocs.map(doc => ({
        filename: doc.filename,
        summary: doc.summary,
        wordCount: doc.wordCount
    }));
    
    console.log(`[MEMORY] 📄 문서 저장됨: ${userId} - ${successfulDocs.length}개`);
    console.log(`[MEMORY] 📊 총 저장된 문서 수: ${memory.documents.length}`);
}

/**
 * 최근 문서 내용 가져오기
 * @param {string} userId - 사용자 ID
 * @param {number} limit - 가져올 문서 수 (기본값: 3)
 * @returns {Array} 최근 문서 배열
 */
function getRecentDocuments(userId, limit = 3) {
    const memory = getUserMemory(userId);
    const recent = memory.documents.slice(0, limit);
    
    console.log(`[MEMORY] 📄 최근 문서 ${recent.length}개 반환: ${userId}`);
    return recent;
}

/**
 * 문서 검색
 * @param {string} userId - 사용자 ID
 * @param {string} query - 검색 쿼리
 * @returns {Array} 검색 결과
 */
function searchDocuments(userId, query) {
    const memory = getUserMemory(userId);
    
    if (!query || query.trim().length === 0) {
        return memory.documents.slice(0, 5); // 쿼리 없으면 최근 5개 반환
    }
    
    const queryLower = query.toLowerCase();
    const results = memory.documents.filter(doc => 
        doc.filename.toLowerCase().includes(queryLower) ||
        doc.summary.toLowerCase().includes(queryLower) ||
        doc.content.toLowerCase().includes(queryLower)
    );
    
    console.log(`[MEMORY] 🔍 문서 검색 결과: ${results.length}개 (쿼리: "${query}")`);
    return results;
}

/**
 * 오래된 대화들을 압축하여 요약
 * @param {Array} conversations - 압축할 대화 배열
 * @returns {Object} 압축된 컨텍스트
 */
async function compressConversations(conversations) {
    console.log(`[MEMORY COMPRESS] 🗜️ 대화 압축 시작: ${conversations.length}개 대화`);
    
    // OpenAI 클라이언트가 없으면 기본 요약 생성
    if (!openai) {
        console.log(`[MEMORY COMPRESS] ⚠️ OpenAI 클라이언트 없음 - 기본 요약 생성`);
        const categories = [...new Set(conversations.map(c => c.category))];
        const recentTopics = conversations.slice(-3).map(c => c.userMessage.substring(0, 50)).join(', ');
        
        return {
            summary: `${conversations.length}개 대화 (${categories.join(', ')}) - 최근 주제: ${recentTopics}`,
            keyTopics: categories,
            userPreferences: '',
            importantContext: 'OpenAI API 키 없음으로 기본 요약 생성',
            lastCompression: new Date(),
            originalConversationCount: conversations.length
        };
    }
    
    try {
        // 대화 내용을 텍스트로 변환
        const conversationText = conversations.map((conv, index) => {
            const timeStr = conv.timestamp.toLocaleString('ko-KR');
            return `[${index + 1}] ${timeStr} (${conv.category})\n사용자: ${conv.userMessage}\n봇: ${conv.botResponse}\n`;
        }).join('\n');
        
        const systemPrompt = `당신은 대화 내용을 효율적으로 압축하고 요약하는 전문가입니다. 
주어진 대화 기록을 분석하여 다음과 같은 형태로 압축해주세요:

1. 핵심 주제들과 관심사 파악
2. 중요한 정보와 컨텍스트 보존
3. 사용자의 선호도나 패턴 식별
4. 간결하면서도 의미있는 요약 생성

응답 형식:
{
  "summary": "전체 대화의 핵심 요약 (200자 이내)",
  "keyTopics": ["주제1", "주제2", "주제3"],
  "userPreferences": "사용자 선호도나 패턴",
  "importantContext": "향후 대화에 도움이 될 중요한 컨텍스트"
}

JSON 형식으로만 응답해주세요.`;

        const response = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: `다음 대화들을 압축해주세요:\n\n${conversationText}` }
            ],
            temperature: 0.3,
            max_tokens: 800
        });
        
        const compressedData = JSON.parse(response.choices[0].message.content);
        
        console.log(`[MEMORY COMPRESS] ✅ 압축 완료`);
        console.log(`[MEMORY COMPRESS] 📝 요약: ${compressedData.summary}`);
        console.log(`[MEMORY COMPRESS] 🏷️ 주요 주제: ${compressedData.keyTopics.join(', ')}`);
        
        return {
            summary: compressedData.summary,
            keyTopics: compressedData.keyTopics || [],
            userPreferences: compressedData.userPreferences || '',
            importantContext: compressedData.importantContext || '',
            lastCompression: new Date(),
            originalConversationCount: conversations.length
        };
        
    } catch (error) {
        console.error(`[MEMORY COMPRESS] ❌ 압축 실패:`, error);
        
        // 압축 실패시 기본 요약 생성
        const categories = [...new Set(conversations.map(c => c.category))];
        const recentTopics = conversations.slice(-3).map(c => c.userMessage.substring(0, 50)).join(', ');
        
        return {
            summary: `${conversations.length}개 대화 (${categories.join(', ')}) - 최근 주제: ${recentTopics}`,
            keyTopics: categories,
            userPreferences: '',
            importantContext: '압축 중 오류 발생으로 기본 요약 생성',
            lastCompression: new Date(),
            originalConversationCount: conversations.length
        };
    }
}

/**
 * 대화 내용을 메모리에 저장 (압축 기능 포함)
 * @param {string} userId - 사용자 ID
 * @param {string} userMessage - 사용자 메시지
 * @param {string} botResponse - 봇 응답
 * @param {string} category - 카테고리 (IMAGE, SCHEDULE, GENERAL)
 * @param {Object} context - 추가 컨텍스트 정보
 */
async function saveConversationToMemory(userId, userMessage, botResponse, category, context = {}) {
    const memory = getUserMemory(userId);
    
    const conversationData = {
        timestamp: new Date(),
        userMessage: userMessage.substring(0, 500), // 메시지 길이 제한
        botResponse: botResponse.substring(0, 500),
        category: category,
        context: context
    };
    
    // 새 대화를 맨 앞에 추가 (최신순)
    memory.conversations.unshift(conversationData);
    
    console.log(`[MEMORY] 💬 대화 저장됨: ${userId} - ${category}`);
    console.log(`[MEMORY] 📊 총 저장된 대화 수: ${memory.conversations.length}`);
    
    // 압축 임계값 초과시 자동 압축 실행
    if (memory.conversations.length > COMPRESSION_THRESHOLD) {
        console.log(`[MEMORY] 🗜️ 압축 임계값 초과 (${memory.conversations.length}/${COMPRESSION_THRESHOLD}), 자동 압축 시작`);
        
        // 오래된 대화들을 압축 (최신 MAX_CONVERSATIONS개 제외)
        const conversationsToCompress = memory.conversations.slice(MAX_CONVERSATIONS);
        const recentConversations = memory.conversations.slice(0, MAX_CONVERSATIONS);
        
        if (conversationsToCompress.length > 0) {
            try {
                const compressed = await compressConversations(conversationsToCompress);
                
                // 기존 압축 컨텍스트와 병합
                if (memory.compressedContext.summary) {
                    // 이전 압축 내용과 새 압축 내용을 결합
                    const combinedSummary = `${memory.compressedContext.summary} | ${compressed.summary}`;
                    const combinedTopics = [...new Set([...memory.compressedContext.keyTopics, ...compressed.keyTopics])];
                    
                    memory.compressedContext = {
                        summary: combinedSummary.substring(0, 400), // 길이 제한
                        keyTopics: combinedTopics.slice(0, 10), // 최대 10개 주제
                        userPreferences: compressed.userPreferences,
                        importantContext: compressed.importantContext,
                        lastCompression: compressed.lastCompression,
                        originalConversationCount: memory.compressedContext.originalConversationCount + compressed.originalConversationCount
                    };
                } else {
                    memory.compressedContext = compressed;
                }
                
                // 최신 대화만 유지
                memory.conversations = recentConversations;
                
                console.log(`[MEMORY] ✅ 압축 완료: ${conversationsToCompress.length}개 대화 → 압축된 컨텍스트`);
                console.log(`[MEMORY] 📊 남은 대화 수: ${memory.conversations.length}`);
                
            } catch (error) {
                console.error(`[MEMORY] ❌ 자동 압축 실패:`, error);
                // 압축 실패시 단순히 오래된 대화 삭제
                memory.conversations = recentConversations;
            }
        }
    }
    
    // 현재 컨텍스트 업데이트
    memory.currentContext.lastTopic = category;
    memory.currentContext.sessionType = category;
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
 * 현재 컨텍스트 가져오기 (압축된 컨텍스트 포함)
 * @param {string} userId - 사용자 ID
 * @returns {Object} 현재 컨텍스트
 */
function getCurrentContext(userId) {
    const memory = getUserMemory(userId);
    
    const context = {
        ...memory.currentContext,
        compressedHistory: memory.compressedContext.summary ? {
            summary: memory.compressedContext.summary,
            keyTopics: memory.compressedContext.keyTopics,
            userPreferences: memory.compressedContext.userPreferences,
            importantContext: memory.compressedContext.importantContext,
            totalCompressedConversations: memory.compressedContext.originalConversationCount
        } : null,
        recentDocuments: memory.documents.slice(0, 3).map(doc => ({
            filename: doc.filename,
            summary: doc.summary,
            wordCount: doc.wordCount,
            extractedAt: doc.extractedAt
        }))
    };
    
    console.log(`[MEMORY] 🎯 현재 컨텍스트 반환: ${userId}`, context);
    return context;
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
 * 특정 사용자의 메모리를 완전히 정리
 * @param {string} userId - 사용자 ID
 * @returns {Object} 정리 결과
 */
function clearUserMemory(userId) {
    const memory = userMemories.get(userId);
    
    if (!memory) {
        console.log(`[MEMORY] ❌ 정리할 메모리 없음: ${userId}`);
        return {
            success: false,
            message: '정리할 메모리가 없습니다.',
            clearedData: {
                images: 0,
                conversations: 0
            }
        };
    }
    
    const clearedData = {
        images: memory.images.length,
        conversations: memory.conversations.length
    };
    
    // 메모리 완전 삭제
    userMemories.delete(userId);
    
    console.log(`[MEMORY] 🗑️ 사용자 메모리 완전 정리: ${userId}`);
    console.log(`[MEMORY] 📊 정리된 데이터: 이미지 ${clearedData.images}개, 대화 ${clearedData.conversations}개`);
    
    return {
        success: true,
        message: `메모리가 성공적으로 정리되었습니다. (이미지 ${clearedData.images}개, 대화 ${clearedData.conversations}개 삭제)`,
        clearedData
    };
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
    saveDocumentsToMemory,
    getRecentDocuments,
    searchDocuments,
    saveConversationToMemory,
    getRecentConversations,
    getCurrentContext,
    updateContext,
    checkForImageMemory,
    cleanupExpiredMemories,
    getMemoryStats,
    clearUserMemory
};
