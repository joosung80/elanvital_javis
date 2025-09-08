/**
 * 채팅 메모리 관리 시스템
 * - 이미지 메모리: 업로드된 이미지 기억 및 재사용
 * - 대화 메모리: 이전 대화 내용과 컨텍스트 유지
 * - 세션 관리: 사용자별 메모리 세션 관리
 * - 대화 압축: 오래된 대화들을 요약하여 메모리 효율성 증대
 */

const { Collection } = require('discord.js');

class MemoryHandler {
    constructor() {
        this.userMemories = new Map();
        console.log('[MEMORY_HANDLER] ✅ MemoryHandler initialized.');
    }

    getUserMemory(userId) {
        if (!this.userMemories.has(userId)) {
            console.log(`[MEMORY] 🧠 새 사용자 메모리 생성`);
            this.userMemories.set(userId, {
                conversations: new Collection(),
                lastDocuments: [],
                recentDocuments: [],
                lastDocument: null,
                lastImageUrl: null,
                lastImageMimeType: null,
            });
        }
        return this.userMemories.get(userId);
    }

    async saveDocumentsToMemory(userId, documents) {
        const memory = this.getUserMemory(userId);
        if (documents && documents.length > 0) {
            memory.lastDocuments = documents.slice(0, 5);
            memory.lastDocument = documents[0];

            if (!Array.isArray(memory.recentDocuments)) {
                memory.recentDocuments = [];
            }
            memory.recentDocuments.unshift(...memory.lastDocuments);
            if (memory.recentDocuments.length > 20) {
                memory.recentDocuments.length = 20;
            }

            console.log(`[MEMORY] 💾 문서 저장: ${documents[0].title}`);
        }
    }

    saveImageContext(userId, url, mimeType) {
        const memory = this.getUserMemory(userId);
        memory.lastImageUrl = url;
        memory.lastImageMimeType = mimeType;
        console.log(`[MEMORY] 🖼️ 이미지 컨텍스트 저장`);
    }

    getRecentConversations(userId, limit = 5) {
        const memory = this.getUserMemory(userId);
        // sort by timestamp descending to get the most recent ones
        const sortedConversations = memory.conversations.sorted((a, b) => b.timestamp - a.timestamp);
        return sortedConversations.first(limit);
    }

    saveConversation(userId, userContent, botResponse) {
        const memory = this.getUserMemory(userId);
        const timestamp = Date.now();
        const conversationId = `${userId}-${timestamp}`;

        memory.conversations.set(conversationId, {
            userMessage: userContent,
            botResponse: botResponse,
            timestamp: timestamp
        });

        // Keep the conversation history to a reasonable size
        if (memory.conversations.size > 20) {
            const oldestKey = memory.conversations.firstKey();
            memory.conversations.delete(oldestKey);
        }
        console.log(`[MEMORY] 💬 대화 저장`);
    }
}

module.exports = MemoryHandler;
