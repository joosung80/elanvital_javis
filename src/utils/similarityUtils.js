/**
 * 문자열 유사도 계산 유틸리티
 */

/**
 * Levenshtein Distance를 이용한 문자열 유사도 계산
 * @param {string} str1 첫 번째 문자열
 * @param {string} str2 두 번째 문자열
 * @returns {number} 0~1 사이의 유사도 (1이 완전 일치)
 */
function calculateSimilarity(str1, str2) {
    if (!str1 || !str2) return 0;
    
    const s1 = str1.toLowerCase().trim();
    const s2 = str2.toLowerCase().trim();
    
    if (s1 === s2) return 1;
    
    const distance = levenshteinDistance(s1, s2);
    const maxLength = Math.max(s1.length, s2.length);
    
    return maxLength === 0 ? 1 : (maxLength - distance) / maxLength;
}

/**
 * Levenshtein Distance 계산
 * @param {string} str1 첫 번째 문자열
 * @param {string} str2 두 번째 문자열
 * @returns {number} 편집 거리
 */
function levenshteinDistance(str1, str2) {
    const matrix = [];
    
    for (let i = 0; i <= str2.length; i++) {
        matrix[i] = [i];
    }
    
    for (let j = 0; j <= str1.length; j++) {
        matrix[0][j] = j;
    }
    
    for (let i = 1; i <= str2.length; i++) {
        for (let j = 1; j <= str1.length; j++) {
            if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1, // substitution
                    matrix[i][j - 1] + 1,     // insertion
                    matrix[i - 1][j] + 1      // deletion
                );
            }
        }
    }
    
    return matrix[str2.length][str1.length];
}

/**
 * 키워드 포함 여부와 유사도를 종합적으로 계산
 * @param {string} keyword 검색 키워드
 * @param {string} text 대상 텍스트
 * @returns {number} 0~1 사이의 점수
 */
function calculateMatchScore(keyword, text) {
    if (!keyword || !text) return 0;
    
    const keywordLower = keyword.toLowerCase().trim();
    const textLower = text.toLowerCase().trim();
    
    // 완전 포함 시 높은 점수
    if (textLower.includes(keywordLower)) {
        return 0.9 + (keywordLower.length / textLower.length) * 0.1;
    }
    
    // 단어 단위로 분할하여 매칭 확인
    const keywordWords = keywordLower.split(/\s+/);
    const textWords = textLower.split(/\s+/);
    
    let matchedWords = 0;
    for (const keywordWord of keywordWords) {
        for (const textWord of textWords) {
            if (textWord.includes(keywordWord) || keywordWord.includes(textWord)) {
                matchedWords++;
                break;
            }
        }
    }
    
    const wordMatchRatio = matchedWords / keywordWords.length;
    
    // 단어 매칭과 전체 유사도를 조합
    const similarity = calculateSimilarity(keywordLower, textLower);
    
    return Math.max(wordMatchRatio * 0.7 + similarity * 0.3, similarity);
}

module.exports = {
    calculateSimilarity,
    calculateMatchScore,
    levenshteinDistance
};
