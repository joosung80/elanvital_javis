const { google } = require('googleapis');
const { authorize } = require('../google-auth');
const { getDocumentInfo, searchDocuments } = require('../config/documents');

/**
 * Google Docs 문서를 읽어옵니다.
 * @param {string} documentId - Google Docs 문서 ID
 * @returns {Promise<Object>} 문서 내용과 메타데이터
 */
async function readGoogleDoc(documentId) {
    try {
        const auth = await authorize();
        const docs = google.docs({ version: 'v1', auth });
        
        console.log(`[DOCS] 📄 문서 읽기 시작: ${documentId}`);
        
        const response = await docs.documents.get({
            documentId: documentId,
        });
        
        const document = response.data;
        const content = extractTextFromDocument(document);
        
        console.log(`[DOCS] ✅ 문서 읽기 완료: ${document.title}`);
        
        return {
            id: document.documentId,
            title: document.title,
            content: content,
            createdTime: document.createdTime,
            modifiedTime: document.modifiedTime,
            wordCount: content.split(/\s+/).length,
            characterCount: content.length
        };
        
    } catch (error) {
        console.error(`[DOCS] ❌ 문서 읽기 실패:`, error);
        
        if (error.code === 404) {
            throw new Error('문서를 찾을 수 없습니다. 문서 ID를 확인해주세요.');
        } else if (error.code === 403) {
            throw new Error('문서에 접근할 권한이 없습니다. 문서 공유 설정을 확인해주세요.');
        } else {
            throw new Error(`문서 읽기 중 오류가 발생했습니다: ${error.message}`);
        }
    }
}

/**
 * Google Docs 문서에서 텍스트를 추출합니다.
 * @param {Object} document - Google Docs 문서 객체
 * @returns {string} 추출된 텍스트
 */
function extractTextFromDocument(document) {
    let text = '';
    
    if (document.body && document.body.content) {
        for (const element of document.body.content) {
            if (element.paragraph) {
                for (const paragraphElement of element.paragraph.elements || []) {
                    if (paragraphElement.textRun) {
                        text += paragraphElement.textRun.content;
                    }
                }
            } else if (element.table) {
                // 테이블 내용도 추출
                for (const row of element.table.tableRows || []) {
                    for (const cell of row.tableCells || []) {
                        for (const cellElement of cell.content || []) {
                            if (cellElement.paragraph) {
                                for (const paragraphElement of cellElement.paragraph.elements || []) {
                                    if (paragraphElement.textRun) {
                                        text += paragraphElement.textRun.content;
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    
    return text.trim();
}

/**
 * 별칭으로 문서를 읽어옵니다.
 * @param {string} alias - 문서 별칭
 * @returns {Promise<Object>} 문서 내용과 메타데이터
 */
async function readDocumentByAlias(alias) {
    const docInfo = getDocumentInfo(alias);
    
    if (!docInfo) {
        throw new Error(`'${alias}' 별칭에 해당하는 문서를 찾을 수 없습니다.`);
    }
    
    console.log(`[DOCS] 🔍 별칭 '${alias}'로 문서 읽기: ${docInfo.name}`);
    
    const document = await readGoogleDoc(docInfo.id);
    
    return {
        ...document,
        alias: alias,
        aliasName: docInfo.name,
        description: docInfo.description
    };
}

/**
 * 검색어로 문서를 찾고 읽어옵니다.
 * @param {string} searchTerm - 검색어
 * @returns {Promise<Array>} 매칭되는 문서들의 정보
 */
async function searchAndReadDocuments(searchTerm) {
    const matchedDocs = searchDocuments(searchTerm);
    
    if (matchedDocs.length === 0) {
        throw new Error(`'${searchTerm}'와 관련된 문서를 찾을 수 없습니다.`);
    }
    
    console.log(`[DOCS] 🔍 검색어 '${searchTerm}'로 ${matchedDocs.length}개 문서 발견`);
    
    // 첫 번째 매칭 문서만 읽어오기 (성능상 이유)
    const firstMatch = matchedDocs[0];
    const document = await readDocumentByAlias(firstMatch.alias);
    
    return {
        document,
        totalMatches: matchedDocs.length,
        allMatches: matchedDocs
    };
}

/**
 * 문서 내용을 요약합니다.
 * @param {string} content - 문서 내용
 * @param {number} maxLength - 최대 요약 길이
 * @returns {string} 요약된 내용
 */
function summarizeContent(content, maxLength = 500) {
    if (content.length <= maxLength) {
        return content;
    }
    
    // 문장 단위로 자르기
    const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 0);
    let summary = '';
    
    for (const sentence of sentences) {
        if ((summary + sentence).length > maxLength) {
            break;
        }
        summary += sentence.trim() + '. ';
    }
    
    return summary.trim() + (summary.length < content.length ? '...' : '');
}

/**
 * 문서에서 키워드를 검색하고 위아래 2줄과 함께 반환합니다.
 * @param {string} content - 문서 내용
 * @param {string} keyword - 검색할 키워드
 * @param {number} contextLines - 위아래로 포함할 줄 수 (기본값: 2)
 * @returns {Array} 매칭된 결과들
 */
function searchKeywordInContent(content, keyword, contextLines = 2) {
    if (!content || !keyword) {
        return [];
    }
    
    const lines = content.split('\n');
    const results = [];
    const searchKeyword = keyword.toLowerCase().trim();
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        
        // Case insensitive 검색
        if (line.toLowerCase().includes(searchKeyword)) {
            // 위아래 contextLines 만큼의 줄을 포함
            const startIndex = Math.max(0, i - contextLines);
            const endIndex = Math.min(lines.length - 1, i + contextLines);
            
            const contextLines_array = [];
            for (let j = startIndex; j <= endIndex; j++) {
                contextLines_array.push({
                    lineNumber: j + 1,
                    content: lines[j],
                    isMatch: j === i
                });
            }
            
            results.push({
                matchLineNumber: i + 1,
                matchContent: line,
                context: contextLines_array,
                startLine: startIndex + 1,
                endLine: endIndex + 1
            });
        }
    }
    
    return results;
}

/**
 * 별칭으로 문서를 읽고 키워드를 검색합니다.
 * @param {string} alias - 문서 별칭
 * @param {string} keyword - 검색할 키워드
 * @returns {Promise<Object>} 검색 결과
 */
async function searchKeywordInDocument(alias, keyword) {
    try {
        console.log(`[DOCS SEARCH] 🔍 문서 '${alias}'에서 키워드 '${keyword}' 검색 시작`);
        
        // 문서 읽기
        const document = await readDocumentByAlias(alias);
        
        // 키워드 검색
        const searchResults = searchKeywordInContent(document.content, keyword);
        
        console.log(`[DOCS SEARCH] ✅ 검색 완료: ${searchResults.length}개 결과 발견`);
        
        return {
            document: {
                title: document.title,
                alias: document.alias,
                aliasName: document.aliasName
            },
            keyword: keyword,
            totalMatches: searchResults.length,
            results: searchResults
        };
        
    } catch (error) {
        console.error(`[DOCS SEARCH] ❌ 검색 실패:`, error);
        throw error;
    }
}

module.exports = {
    readGoogleDoc,
    readDocumentByAlias,
    searchAndReadDocuments,
    extractTextFromDocument,
    summarizeContent,
    searchKeywordInContent,
    searchKeywordInDocument
};
