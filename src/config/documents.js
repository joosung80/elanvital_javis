/**
 * Google Docs 문서 ID 관리
 * 각 문서의 ID와 별칭을 정의합니다.
 */

const GOOGLE_DOCS = {
    // 예시 문서들 - 실제 문서 ID로 교체해주세요
    'password': {
        id: '1BignqLKJPWE-SHboreCyTq1SSdniN2RA9YNuGZpVJxw',
        name: '패스워드 문서',
        description: '각종 패스워드 및 계정 정보'
    },
    'manual': {
        id: '1234567890abcdefghijklmnopqrstuvwxyz', // 예시 ID
        name: '매뉴얼 문서',
        description: '사용법 및 가이드'
    },
    'template': {
        id: '0987654321zyxwvutsrqponmlkjihgfedcba', // 예시 ID
        name: '템플릿 문서',
        description: '문서 작성 템플릿'
    }
    // 필요에 따라 더 많은 문서 추가 가능
};

/**
 * 문서 별칭으로 문서 정보를 가져옵니다.
 * @param {string} alias - 문서 별칭
 * @returns {Object|null} 문서 정보 또는 null
 */
function getDocumentInfo(alias) {
    const normalizedAlias = alias.toLowerCase().trim();
    return GOOGLE_DOCS[normalizedAlias] || null;
}

/**
 * 등록된 모든 문서 목록을 가져옵니다.
 * @returns {Array} 문서 목록
 */
function getAllDocuments() {
    return Object.entries(GOOGLE_DOCS).map(([alias, info]) => ({
        alias,
        ...info
    }));
}

/**
 * 문서 별칭으로 검색합니다.
 * @param {string} searchTerm - 검색어
 * @returns {Array} 매칭되는 문서들
 */
function searchDocuments(searchTerm) {
    const term = searchTerm.toLowerCase().trim();
    return Object.entries(GOOGLE_DOCS)
        .filter(([alias, info]) => 
            alias.includes(term) || 
            info.name.toLowerCase().includes(term) ||
            info.description.toLowerCase().includes(term)
        )
        .map(([alias, info]) => ({
            alias,
            ...info
        }));
}

module.exports = {
    GOOGLE_DOCS,
    getDocumentInfo,
    getAllDocuments,
    searchDocuments
};
