/**
 * 문서 파싱 핸들러
 * - PDF 문서 파싱 및 텍스트 추출
 * - Word 문서 파싱 및 텍스트 추출
 * - 문서 내용을 컨텍스트로 변환
 */

const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const https = require('https');
const http = require('http');
const { URL } = require('url');
const { saveDocumentsToMemory } = require('./memoryHandler');
const { getOpenAIClient } = require('./openaiClient');
const { readDocumentByAlias, searchAndReadDocuments, searchKeywordInDocument } = require('./docsHandler');

/**
 * URL에서 파일을 다운로드하여 Buffer로 반환
 * @param {string} url - 다운로드할 파일 URL
 * @returns {Promise<Buffer>} 파일 데이터 Buffer
 */
function downloadFile(url) {
    return new Promise((resolve, reject) => {
        const parsedUrl = new URL(url);
        const client = parsedUrl.protocol === 'https:' ? https : http;
        
        console.log(`[DOCUMENT] 📥 파일 다운로드 시작: ${url}`);
        
        client.get(url, (response) => {
            if (response.statusCode !== 200) {
                reject(new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`));
                return;
            }
            
            const chunks = [];
            let totalSize = 0;
            
            response.on('data', (chunk) => {
                chunks.push(chunk);
                totalSize += chunk.length;
            });
            
            response.on('end', () => {
                const buffer = Buffer.concat(chunks);
                console.log(`[DOCUMENT] ✅ 파일 다운로드 완료: ${totalSize} bytes`);
                resolve(buffer);
            });
            
            response.on('error', (error) => {
                console.error(`[DOCUMENT] ❌ 다운로드 오류:`, error);
                reject(error);
            });
        }).on('error', (error) => {
            console.error(`[DOCUMENT] ❌ 요청 오류:`, error);
            reject(error);
        });
    });
}

/**
 * PDF 문서에서 텍스트 추출
 * @param {Buffer} buffer - PDF 파일 Buffer
 * @returns {Promise<string>} 추출된 텍스트
 */
async function parsePDF(buffer) {
    console.log(`[DOCUMENT] 📄 PDF 파싱 시작: ${buffer.length} bytes`);
    
    try {
        const data = await pdfParse(buffer);
        const text = data.text.trim();
        
        console.log(`[DOCUMENT] ✅ PDF 파싱 완료: ${text.length}자`);
        console.log(`[DOCUMENT] 📊 PDF 정보: ${data.numpages}페이지, ${data.numrender}개 렌더링`);
        
        return text;
    } catch (error) {
        console.error(`[DOCUMENT] ❌ PDF 파싱 실패:`, error);
        throw new Error(`PDF 파싱 실패: ${error.message}`);
    }
}

/**
 * Word 문서에서 텍스트 추출
 * @param {Buffer} buffer - Word 파일 Buffer
 * @returns {Promise<string>} 추출된 텍스트
 */
async function parseWord(buffer) {
    console.log(`[DOCUMENT] 📝 Word 파싱 시작: ${buffer.length} bytes`);
    
    try {
        const result = await mammoth.extractRawText({ buffer: buffer });
        const text = result.value.trim();
        
        console.log(`[DOCUMENT] ✅ Word 파싱 완료: ${text.length}자`);
        
        if (result.messages && result.messages.length > 0) {
            console.log(`[DOCUMENT] ⚠️ Word 파싱 경고:`, result.messages);
        }
        
        return text;
    } catch (error) {
        console.error(`[DOCUMENT] ❌ Word 파싱 실패:`, error);
        throw new Error(`Word 파싱 실패: ${error.message}`);
    }
}

/**
 * 텍스트를 요약하여 컨텍스트로 변환
 * @param {string} text - 원본 텍스트
 * @param {string} filename - 파일명
 * @returns {Object} 문서 컨텍스트
 */
/**
 * 문서 내용을 Markdown 형태로 변환
 * @param {string} filename - 파일명
 * @param {string} content - 문서 내용
 * @returns {string} Markdown 형태의 문서
 */
function convertToMarkdown(filename, content) {
    const timestamp = new Date().toLocaleString('ko-KR', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });
    
    let markdown = `# ${filename}\n\n`;
    markdown += `**파싱 일시:** ${timestamp}\n\n`;
    markdown += `---\n\n`;
    
    // 내용을 단락별로 나누어 Markdown 형태로 변환
    const paragraphs = content.split(/\n\s*\n/).filter(p => p.trim());
    
    paragraphs.forEach((paragraph, index) => {
        const trimmedParagraph = paragraph.trim();
        
        // 제목처럼 보이는 짧은 줄 (50자 이하이고 다음 줄이 있는 경우)
        if (trimmedParagraph.length <= 50 && index < paragraphs.length - 1) {
            // 숫자로 시작하는 경우 (예: "1. 개요", "2.1 목적")
            if (/^\d+\./.test(trimmedParagraph)) {
                markdown += `## ${trimmedParagraph}\n\n`;
            }
            // 대문자나 한글로만 구성된 짧은 제목
            else if (/^[A-Z가-힣\s\-\(\)]+$/.test(trimmedParagraph)) {
                markdown += `### ${trimmedParagraph}\n\n`;
            }
            // 일반 단락
            else {
                markdown += `${trimmedParagraph}\n\n`;
            }
        }
        // 긴 내용은 일반 단락으로 처리
        else {
            // 줄바꿈을 유지하면서 단락 추가
            const formattedParagraph = trimmedParagraph.replace(/\n/g, '  \n');
            markdown += `${formattedParagraph}\n\n`;
        }
    });
    
    markdown += `---\n\n`;
    markdown += `*문서 파싱 완료*\n`;
    
    return markdown;
}

function createDocumentContext(text, filename) {
    console.log(`[DOCUMENT] 📋 문서 컨텍스트 생성: ${filename}`);
    
    // 텍스트 길이에 따른 요약 수준 결정
    const maxLength = 2000; // 최대 컨텍스트 길이
    let processedText = text;
    
    if (text.length > maxLength) {
        // 긴 텍스트는 앞부분과 뒷부분을 포함한 요약 생성
        const frontPart = text.substring(0, maxLength * 0.6);
        const backPart = text.substring(text.length - maxLength * 0.3);
        processedText = `${frontPart}\n\n... [중간 내용 생략] ...\n\n${backPart}`;
        
        console.log(`[DOCUMENT] ✂️ 텍스트 요약: ${text.length}자 → ${processedText.length}자`);
    }
    
    // Markdown 형태로 변환 (전체 텍스트 사용)
    const markdownContent = convertToMarkdown(filename, text);
    console.log(`[DOCUMENT] 📝 Markdown 변환 완료: ${markdownContent.length}자`);
    
    // 문서 메타데이터 추출
    const lines = text.split('\n').filter(line => line.trim().length > 0);
    const wordCount = text.split(/\s+/).length;
    const paragraphCount = text.split(/\n\s*\n/).length;
    
    const context = {
        filename: filename,
        originalLength: text.length,
        processedLength: processedText.length,
        wordCount: wordCount,
        paragraphCount: paragraphCount,
        lineCount: lines.length,
        content: processedText,
        markdownContent: markdownContent, // 새로 추가된 Markdown 형태 내용
        summary: lines.slice(0, 3).join(' ').substring(0, 200) + '...', // 첫 3줄 요약
        extractedAt: new Date(),
        type: 'document'
    };
    
    console.log(`[DOCUMENT] 📊 문서 분석 완료:`);
    console.log(`[DOCUMENT] - 단어 수: ${wordCount}개`);
    console.log(`[DOCUMENT] - 문단 수: ${paragraphCount}개`);
    console.log(`[DOCUMENT] - 줄 수: ${lines.length}개`);
    
    return context;
}

/**
 * 첨부된 문서 파일을 파싱하여 텍스트 컨텍스트로 변환
 * @param {Object} attachment - Discord 첨부파일 객체
 * @returns {Promise<Object>} 문서 컨텍스트 또는 null
 */
async function parseDocument(attachment) {
    const { name, contentType, url, size } = attachment;
    
    console.log(`[DOCUMENT] 🔍 문서 파싱 요청: ${name} (${contentType}, ${size} bytes)`);
    
    // 지원되는 문서 타입 확인
    const supportedTypes = {
        'application/pdf': 'pdf',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
        'application/msword': 'doc'
    };
    
    const fileExtension = name.toLowerCase().split('.').pop();
    const documentType = supportedTypes[contentType] || 
                        (fileExtension === 'pdf' ? 'pdf' : 
                         (fileExtension === 'docx' || fileExtension === 'doc') ? 'word' : null);
    
    if (!documentType) {
        console.log(`[DOCUMENT] ❌ 지원되지 않는 문서 타입: ${contentType} (${name})`);
        return null;
    }
    
    // 파일 크기 제한 (10MB)
    const maxSize = 10 * 1024 * 1024;
    if (size > maxSize) {
        console.log(`[DOCUMENT] ❌ 파일 크기 초과: ${size} bytes (최대 ${maxSize} bytes)`);
        throw new Error(`파일 크기가 너무 큽니다. 최대 10MB까지 지원됩니다.`);
    }
    
    try {
        // 파일 다운로드
        const buffer = await downloadFile(url);
        
        // 문서 타입에 따른 파싱
        let extractedText;
        if (documentType === 'pdf') {
            extractedText = await parsePDF(buffer);
        } else if (documentType === 'word') {
            extractedText = await parseWord(buffer);
        }
        
        if (!extractedText || extractedText.length === 0) {
            throw new Error('문서에서 텍스트를 추출할 수 없습니다.');
        }
        
        // 문서 컨텍스트 생성
        const documentContext = createDocumentContext(extractedText, name);
        
        console.log(`[DOCUMENT] 🎉 문서 파싱 성공: ${name}`);
        return documentContext;
        
    } catch (error) {
        console.error(`[DOCUMENT] ❌ 문서 파싱 실패: ${name}`, error);
        throw error;
    }
}

/**
 * 여러 문서 파일을 일괄 파싱
 * @param {Array} attachments - Discord 첨부파일 배열
 * @returns {Promise<Array>} 파싱된 문서 컨텍스트 배열
 */
async function parseMultipleDocuments(attachments) {
    console.log(`[DOCUMENT] 📚 다중 문서 파싱 시작: ${attachments.length}개 파일`);
    
    const documentAttachments = attachments.filter(att => {
        const supportedTypes = [
            'application/pdf',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/msword'
        ];
        const fileExtension = att.name.toLowerCase().split('.').pop();
        return supportedTypes.includes(att.contentType) || 
               ['pdf', 'docx', 'doc'].includes(fileExtension);
    });
    
    if (documentAttachments.length === 0) {
        console.log(`[DOCUMENT] ℹ️ 파싱 가능한 문서 없음`);
        return [];
    }
    
    const results = [];
    for (const attachment of documentAttachments) {
        try {
            const context = await parseDocument(attachment);
            if (context) {
                results.push(context);
            }
        } catch (error) {
            console.error(`[DOCUMENT] ❌ 개별 문서 파싱 실패: ${attachment.name}`, error);
            // 개별 파일 실패는 전체 프로세스를 중단하지 않음
            results.push({
                filename: attachment.name,
                error: error.message,
                type: 'document_error'
            });
        }
    }
    
    console.log(`[DOCUMENT] 📋 다중 문서 파싱 완료: ${results.length}개 결과`);
    return results;
}

/**
 * OpenAI를 이용한 문서 요약
 * @param {string} text - 요약할 텍스트
 * @param {string} filename - 파일명
 * @param {string} summaryType - 요약 타입 ('brief', 'detailed', 'key_points')
 * @returns {Promise<string>} 요약된 텍스트
 */
async function summarizeDocument(text, filename, summaryType = 'detailed') {
    console.log(`[DOCUMENT SUMMARY] 📝 문서 요약 시작: ${filename} (${summaryType})`);
    
    let openai;
    try {
        openai = getOpenAIClient();
    } catch (error) {
        console.log(`[DOCUMENT SUMMARY] ⚠️ OpenAI 클라이언트 초기화 실패 - 기본 요약 반환:`, error.message);
        const lines = text.split('\n').filter(line => line.trim().length > 0);
        return `**기본 요약 (OpenAI 없음)**\n\n파일명: ${filename}\n단어 수: ${text.split(/\s+/).length}개\n첫 부분: ${lines.slice(0, 5).join(' ').substring(0, 300)}...`;
    }
    
    try {
        let systemPrompt = '';
        let userPrompt = '';
        
        switch (summaryType) {
            case 'brief':
                systemPrompt = `당신은 문서 요약 전문가입니다. 주어진 문서를 간결하고 핵심적으로 요약해주세요.
- 3-5줄 이내로 요약
- 가장 중요한 내용만 포함
- 명확하고 이해하기 쉽게 작성`;
                break;
                
            case 'key_points':
                systemPrompt = `당신은 문서 분석 전문가입니다. 주어진 문서의 핵심 포인트를 추출해주세요.
- 주요 포인트를 번호로 나열 (5-10개)
- 각 포인트는 1-2줄로 간결하게
- 중요도 순으로 정렬`;
                break;
                
            case 'detailed':
            default:
                systemPrompt = `당신은 문서 요약 전문가입니다. 주어진 문서를 상세하고 체계적으로 요약해주세요.
- 문서의 주요 내용과 구조 파악
- 중요한 정보와 세부사항 포함
- 논리적 순서로 정리
- 읽기 쉽고 이해하기 쉽게 작성
- 한국어로 작성`;
                break;
        }
        
        userPrompt = `다음 문서를 요약해주세요:

파일명: ${filename}
내용:
${text}`;

        const response = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt }
            ],
            temperature: 0.3,
            max_tokens: 1500
        });
        
        const summary = response.choices[0].message.content;
        
        console.log(`[DOCUMENT SUMMARY] ✅ 요약 완료: ${summary.length}자`);
        return summary;
        
    } catch (error) {
        console.error(`[DOCUMENT SUMMARY] ❌ 요약 실패:`, error);
        
        // 요약 실패시 기본 요약 생성
        const lines = text.split('\n').filter(line => line.trim().length > 0);
        const wordCount = text.split(/\s+/).length;
        
        return `**요약 생성 실패 - 기본 정보**\n\n파일명: ${filename}\n단어 수: ${wordCount}개\n문단 수: ${text.split(/\n\s*\n/).length}개\n\n**문서 시작 부분:**\n${lines.slice(0, 10).join('\n').substring(0, 500)}...`;
    }
}

/**
 * 문서 컨텍스트를 사용자 친화적인 메시지로 변환
 * @param {Array} documentContexts - 문서 컨텍스트 배열
 * @param {string} summaryText - 요약 텍스트 (선택사항)
 * @returns {string} 사용자 메시지
 */
function formatDocumentSummary(documentContexts, summaryText = null) {
    if (!documentContexts || documentContexts.length === 0) {
        return '';
    }
    
    const successfulDocs = documentContexts.filter(doc => doc.type === 'document');
    const failedDocs = documentContexts.filter(doc => doc.type === 'document_error');
    
    let message = '';
    
    // AI 요약이 있으면 메인 콘텐츠로 표시
    if (summaryText) {
        message += `📄 **${successfulDocs[0]?.filename || '문서'}**\n\n`;
        message += `${summaryText}\n\n`;
        message += `💬 **문서에 대해 더 궁금한 점이 있으시면 언제든 물어보세요!**`;
    } else {
        // AI 요약이 없으면 기본 분석 결과 표시
        message += `📄 **문서 분석 완료**\n\n`;
        
        if (successfulDocs.length > 0) {
            successfulDocs.forEach((doc, index) => {
                message += `✅ **${doc.filename}**\n`;
                message += `📊 ${doc.wordCount.toLocaleString()}단어, ${doc.paragraphCount}문단\n\n`;
            });
        }
        
        if (failedDocs.length > 0) {
            message += `❌ **분석 실패:**\n`;
            failedDocs.forEach((doc, index) => {
                message += `• ${doc.filename}: ${doc.error}\n`;
            });
            message += `\n`;
        }
        
        if (successfulDocs.length > 0) {
            message += `💬 **문서 내용에 대해 질문해주세요!**`;
        }
    }
    
    return message;
}

/**
 * Discord 메시지로부터 문서 처리 요청을 핸들링하는 메인 함수
 * (기존 src/handlers/documentHandler.js의 내용)
 */
async function handleDocumentRequest(message, classification, actualContent = null) {
  console.log(`[DOCUMENT REQUEST] 📄 문서 처리 요청: ${classification.reason}`);
  
  try {
    const attachments = Array.from(message.attachments.values());
    const documentAttachments = attachments.filter(att => {
      const supportedTypes = [
        'application/pdf',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/msword'
      ];
      const fileExtension = att.name.toLowerCase().split('.').pop();
      return supportedTypes.includes(att.contentType) || 
             ['pdf', 'docx', 'doc'].includes(fileExtension);
    });
    
    if (documentAttachments.length === 0) {
      const response = `📄 **문서를 찾을 수 없습니다**...`; // 전체 응답 메시지
      await message.reply(response);
      return response;
    }
    
    const processingMessage = await message.reply(`📄 **문서 분석 중...**`);
    
    const documentContexts = await parseMultipleDocuments(documentAttachments);
    
    // 성공적으로 파싱된 문서 컨텍스트 중 첫 번째 문서의 요약을 가져옴
    const firstSuccessfulDoc = documentContexts.find(doc => doc.type === 'document');
    let summaryText = null;

    if (firstSuccessfulDoc) {
        summaryText = await summarizeDocument(firstSuccessfulDoc.content, firstSuccessfulDoc.filename);
    }

    const summaryMessage = formatDocumentSummary(documentContexts, summaryText);
    
    await processingMessage.edit(summaryMessage);
    
    if (successfulDocs.length > 0) {
      saveDocumentsToMemory(message.author.id, documentContexts);
      console.log(`[DOCUMENT] 💾 ${successfulDocs.length}개 문서가 메모리에 저장됨`);
    }
    
    return summaryMessage;
    
  } catch (error) {
    console.error('[DOCUMENT REQUEST] ❌ 문서 처리 오류:', error);
    const errorResponse = `❌ **문서 처리 중 오류가 발생했습니다**...`; // 전체 오류 메시지
    await message.reply(errorResponse);
    return errorResponse;
  }
}

/**
 * Google Docs 문서 읽기 요청을 처리합니다.
 * @param {string} keyword - 문서 별칭이나 검색 키워드
 * @param {string} userId - 사용자 ID
 * @returns {Promise<string>} 처리 결과 메시지
 */
async function handleGoogleDocsRequest(keyword, userId) {
    try {
        console.log(`[GOOGLE DOCS] 📄 문서 읽기 요청: ${keyword}`);
        
        let result;
        
        try {
            // 먼저 정확한 별칭으로 시도
            result = await readDocumentByAlias(keyword);
        } catch (error) {
            // 별칭이 없으면 검색으로 시도
            console.log(`[GOOGLE DOCS] 🔍 별칭 '${keyword}' 없음, 검색으로 시도`);
            result = await searchAndReadDocuments(keyword);
            result = result.document; // 검색 결과에서 문서 추출
        }
        
        const { title, content, wordCount, characterCount, aliasName, description } = result;
        
        // 메모리에 문서 저장
        const documentData = {
            filename: `${aliasName || title}.gdocs`,
            content: content,
            summary: content.length > 1000 ? content.substring(0, 1000) + '...' : content,
            uploadTime: new Date(),
            fileType: 'google_docs',
            metadata: {
                title,
                wordCount,
                characterCount,
                alias: result.alias,
                description
            }
        };
        
        saveDocumentsToMemory(userId, [documentData]);
        
        // 응답 메시지 생성
        let responseMessage = `📄 **Google Docs 문서를 읽어왔습니다!**\n\n`;
        responseMessage += `**📋 문서 정보:**\n`;
        responseMessage += `• **제목:** ${title}\n`;
        if (aliasName) {
            responseMessage += `• **별칭:** ${aliasName}\n`;
        }
        if (description) {
            responseMessage += `• **설명:** ${description}\n`;
        }
        responseMessage += `• **단어 수:** ${wordCount.toLocaleString()}개\n`;
        responseMessage += `• **문자 수:** ${characterCount.toLocaleString()}자\n\n`;
        
        // 내용 미리보기 (처음 500자)
        const preview = content.length > 500 ? content.substring(0, 500) + '...' : content;
        responseMessage += `**📖 내용 미리보기:**\n\`\`\`\n${preview}\n\`\`\`\n\n`;
        responseMessage += `💡 이 문서에 대해 질문하거나 요약을 요청할 수 있습니다!`;
        
        return responseMessage;
        
    } catch (error) {
        console.error(`[GOOGLE DOCS] ❌ 문서 읽기 실패:`, error);
        return `❌ **Google Docs 문서 읽기 실패**\n\n${error.message}\n\n💡 문서 별칭을 확인하거나 문서 공유 설정을 확인해주세요.`;
    }
}

/**
 * Google Docs 문서에서 키워드 검색 요청을 처리합니다.
 * @param {string} documentAlias - 문서 별칭
 * @param {string} searchKeyword - 검색할 키워드
 * @param {string} userId - 사용자 ID
 * @returns {Promise<string>} 처리 결과 메시지
 */
async function handleGoogleDocsSearchRequest(documentAlias, searchKeyword, userId) {
    try {
        console.log(`[GOOGLE DOCS SEARCH] 🔍 문서 '${documentAlias}'에서 '${searchKeyword}' 검색 요청`);
        
        const searchResult = await searchKeywordInDocument(documentAlias, searchKeyword);
        
        if (searchResult.totalMatches === 0) {
            return `🔍 **검색 결과 없음**\n\n**문서:** ${searchResult.document.aliasName || searchResult.document.title}\n**키워드:** "${searchKeyword}"\n\n해당 키워드를 포함하는 내용을 찾을 수 없습니다.`;
        }
        
        // 응답 메시지 생성
        let responseMessage = `🔍 **Google Docs 검색 결과**\n\n`;
        responseMessage += `**📄 문서:** ${searchResult.document.aliasName || searchResult.document.title}\n`;
        responseMessage += `**🔎 검색어:** "${searchKeyword}"\n`;
        responseMessage += `**📊 총 ${searchResult.totalMatches}개 결과 발견**\n\n`;
        
        // 각 검색 결과 표시 (최대 5개까지)
        const maxResults = Math.min(searchResult.results.length, 5);
        
        for (let i = 0; i < maxResults; i++) {
            const result = searchResult.results[i];
            responseMessage += `**📍 결과 ${i + 1} (${result.matchLineNumber}번째 줄):**\n`;
            responseMessage += '```\n';
            
            // 컨텍스트 라인들 표시
            for (const contextLine of result.context) {
                const prefix = contextLine.isMatch ? '→ ' : '  ';
                const lineNum = contextLine.lineNumber.toString().padStart(3, ' ');
                responseMessage += `${prefix}${lineNum}: ${contextLine.content}\n`;
            }
            
            responseMessage += '```\n\n';
        }
        
        // 결과가 5개보다 많으면 알림
        if (searchResult.totalMatches > 5) {
            responseMessage += `💡 총 ${searchResult.totalMatches}개 결과 중 처음 5개만 표시했습니다.\n`;
        }
        
        return responseMessage;
        
    } catch (error) {
        console.error(`[GOOGLE DOCS SEARCH] ❌ 검색 실패:`, error);
        return `❌ **Google Docs 검색 실패**\n\n${error.message}\n\n💡 문서 별칭을 확인하거나 문서 공유 설정을 확인해주세요.`;
    }
}

module.exports = {
    parseDocument,
    parseMultipleDocuments,
    formatDocumentSummary,
    createDocumentContext,
    summarizeDocument,
    handleDocumentRequest,
    handleGoogleDocsRequest,
    handleGoogleDocsSearchRequest // 새로 추가된 export
};
