const { google } = require('googleapis');
const { getAuthenticatedGoogleApis } = require('../google-auth');
const { getDocumentInfo, searchDocuments } = require('../config/documents');

/**
 * Google Docs 문서를 읽어옵니다.
 * @param {string} documentId - Google Docs 문서 ID
 * @returns {Promise<Object>} 문서 내용과 메타데이터
 */
async function readGoogleDoc(documentId) {
    try {
        const { docs } = await getAuthenticatedGoogleApis();
        
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

/**
 * Google Docs에서 키워드로 문서를 검색합니다.
 * @param {string} keyword - 검색할 키워드
 * @param {number} maxResults - 최대 결과 개수 (기본값: 5)
 * @returns {Promise<Array>} 검색된 문서 목록
 */
async function searchGoogleDocs(keyword, maxResults = 5) {
    try {
        console.log(`[DOCS SEARCH] 🔍 키워드 '${keyword}'로 Google Docs 검색 시작`);
        
        const { drive } = await getAuthenticatedGoogleApis();
        
        // Google Docs 파일만 검색 (제목에 키워드 포함, 휴지통 제외)
        const query = `name contains '${keyword}' and mimeType='application/vnd.google-apps.document' and trashed = false`;
        
        const response = await drive.files.list({
            q: query,
            pageSize: maxResults,
            fields: 'files(id, name, modifiedTime, webViewLink, owners)',
            orderBy: 'modifiedTime desc' // 최근 수정된 순으로 정렬
        });
        
        const files = response.data.files || [];
        console.log(`[DOCS SEARCH] ✅ 검색 완료: ${files.length}개 Google Docs 발견`);
        
        // 문서 정보 가공
        const processedDocs = files.map(file => ({
            id: file.id,
            title: file.name,
            modifiedTime: file.modifiedTime,
            webViewLink: file.webViewLink,
            owner: file.owners && file.owners[0] ? file.owners[0].displayName : '알 수 없음',
            modifiedTimeFormatted: formatDate(file.modifiedTime)
        }));
        
        return processedDocs;
        
    } catch (error) {
        console.error('[DOCS SEARCH] ❌ Google Docs 검색 실패:', error);
        throw error;
    }
}

/**
 * Google Docs 문서를 읽고 Markdown으로 변환합니다.
 * @param {string} documentId - 문서 ID
 * @returns {Promise<Object>} 문서 내용과 메타데이터
 */
async function readGoogleDocsAsMarkdown(documentId) {
    try {
        console.log(`[DOCS READ] 📖 Google Docs 읽기 시작: ${documentId}`);
        
        const { docs } = await getAuthenticatedGoogleApis();
        
        // 문서 내용 가져오기
        const response = await docs.documents.get({
            documentId: documentId
        });
        
        const document = response.data;
        const title = document.title;
        const content = document.body.content;
        
        // Markdown으로 변환
        const markdownContent = convertGoogleDocsToMarkdown(content);
        
        // 메타데이터 수집
        const wordCount = markdownContent.split(/\s+/).filter(word => word.length > 0).length;
        const charCount = markdownContent.length;
        
        console.log(`[DOCS READ] ✅ 문서 읽기 완료: ${title} (${wordCount}단어, ${charCount}자)`);
        
        return {
            id: documentId,
            title: title,
            content: markdownContent,
            wordCount: wordCount,
            charCount: charCount,
            webViewLink: `https://docs.google.com/document/d/${documentId}/edit`
        };
        
    } catch (error) {
        console.error(`[DOCS READ] ❌ 문서 읽기 실패: ${documentId}`, error);
        throw error;
    }
}

/**
 * Google Docs 내용을 Markdown으로 변환합니다.
 * @param {Array} content - Google Docs 내용 배열
 * @returns {string} Markdown 형식의 텍스트
 */
function convertGoogleDocsToMarkdown(content) {
    if (!content) return '';
    
    let markdown = '';
    
    for (const element of content) {
        if (element.paragraph) {
            const paragraphText = extractParagraphText(element.paragraph);
            if (paragraphText.trim()) {
                // 제목 스타일 확인
                const headingLevel = getHeadingLevel(element.paragraph);
                if (headingLevel > 0) {
                    markdown += '#'.repeat(headingLevel) + ' ' + paragraphText + '\n\n';
                } else {
                    markdown += paragraphText + '\n\n';
                }
            } else {
                markdown += '\n';
            }
        } else if (element.table) {
            markdown += convertTableToMarkdown(element.table) + '\n\n';
        } else if (element.tableOfContents) {
            markdown += '## 목차\n\n';
        }
    }
    
    return markdown.trim();
}

/**
 * 단락에서 텍스트를 추출합니다.
 * @param {Object} paragraph - Google Docs 단락 객체
 * @returns {string} 추출된 텍스트
 */
function extractParagraphText(paragraph) {
    if (!paragraph.elements) return '';
    
    let text = '';
    
    for (const element of paragraph.elements) {
        if (element.textRun) {
            const content = element.textRun.content;
            const textStyle = element.textRun.textStyle || {};
            
            let formattedText = content;
            
            // 볼드 처리
            if (textStyle.bold) {
                formattedText = `**${formattedText}**`;
            }
            
            // 이탤릭 처리
            if (textStyle.italic) {
                formattedText = `*${formattedText}*`;
            }
            
            // 링크 처리
            if (textStyle.link) {
                const url = textStyle.link.url;
                formattedText = `[${formattedText}](${url})`;
            }
            
            text += formattedText;
        }
    }
    
    return text;
}

/**
 * 단락의 제목 레벨을 확인합니다.
 * @param {Object} paragraph - Google Docs 단락 객체
 * @returns {number} 제목 레벨 (0: 일반 텍스트, 1-6: 제목)
 */
function getHeadingLevel(paragraph) {
    if (!paragraph.paragraphStyle || !paragraph.paragraphStyle.namedStyleType) {
        return 0;
    }
    
    const styleType = paragraph.paragraphStyle.namedStyleType;
    
    switch (styleType) {
        case 'HEADING_1': return 1;
        case 'HEADING_2': return 2;
        case 'HEADING_3': return 3;
        case 'HEADING_4': return 4;
        case 'HEADING_5': return 5;
        case 'HEADING_6': return 6;
        default: return 0;
    }
}

/**
 * 테이블을 Markdown으로 변환합니다.
 * @param {Object} table - Google Docs 테이블 객체
 * @returns {string} Markdown 형식의 테이블
 */
function convertTableToMarkdown(table) {
    if (!table.tableRows) return '';
    
    let markdown = '';
    const rows = table.tableRows;
    
    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        let rowText = '|';
        
        if (row.tableCells) {
            for (const cell of row.tableCells) {
                const cellText = extractTableCellText(cell);
                rowText += ` ${cellText} |`;
            }
        }
        
        markdown += rowText + '\n';
        
        // 첫 번째 행 후에 구분선 추가
        if (i === 0 && row.tableCells) {
            let separator = '|';
            for (let j = 0; j < row.tableCells.length; j++) {
                separator += ' --- |';
            }
            markdown += separator + '\n';
        }
    }
    
    return markdown;
}

/**
 * 테이블 셀에서 텍스트를 추출합니다.
 * @param {Object} cell - Google Docs 테이블 셀 객체
 * @returns {string} 추출된 텍스트
 */
function extractTableCellText(cell) {
    if (!cell.content) return '';
    
    let text = '';
    for (const element of cell.content) {
        if (element.paragraph) {
            text += extractParagraphText(element.paragraph);
        }
    }
    
    return text.replace(/\n/g, ' ').trim();
}

/**
 * Google Docs 검색 결과를 포맷팅합니다.
 * @param {string} keyword - 검색 키워드
 * @param {Array} docs - 검색된 문서 목록
 * @returns {string} 포맷된 메시지
 */
function formatDocsSearchResults(keyword, docs) {
    if (docs.length === 0) {
        return `🔍 **Google Docs 검색 결과**\n\n**검색어:** "${keyword}"\n\n검색 결과가 없습니다.`;
    }
    
    let message = `🔍 **Google Docs 검색 결과**\n\n`;
    message += `**검색어:** "${keyword}"\n`;
    message += `**총 ${docs.length}개 문서 발견**\n\n`;
    
    docs.forEach((doc, index) => {
        message += `📝 **${index + 1}. ${doc.title}**\n`;
        message += `   👤 작성자: ${doc.owner}\n`;
        message += `   📅 수정: ${doc.modifiedTimeFormatted}\n`;
        message += `   🔗 [문서 링크](${doc.webViewLink})\n\n`;
    });
    
    message += `💡 읽고 분석하려는 문서의 번호 버튼을 클릭하세요!`;
    
    return message;
}

/**
 * 날짜를 'YYYY년 MM월 DD일 HH:mm' 형식으로 포맷팅합니다.
 * @param {string} dateString - ISO 8601 형식의 날짜 문자열
 * @returns {string} 포맷된 날짜 문자열
 */
function formatDate(dateString) {
    if (!dateString) return '날짜 정보 없음';
    const date = new Date(dateString);
    return `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일 ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
}

module.exports = {
    readGoogleDoc,
    readDocumentByAlias,
    searchAndReadDocuments,
    extractTextFromDocument,
    summarizeContent,
    searchKeywordInContent,
    searchKeywordInDocument,
    searchGoogleDocs,
    readGoogleDocsAsMarkdown,
    formatDocsSearchResults
};
