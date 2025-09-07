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
 * 문서 컨텍스트를 사용자 친화적인 메시지로 변환
 * @param {Array} documentContexts - 문서 컨텍스트 배열
 * @returns {string} 사용자 메시지
 */
function formatDocumentSummary(documentContexts) {
    if (!documentContexts || documentContexts.length === 0) {
        return '';
    }
    
    const successfulDocs = documentContexts.filter(doc => doc.type === 'document');
    const failedDocs = documentContexts.filter(doc => doc.type === 'document_error');
    
    let message = `📄 **문서 분석 결과**\n\n`;
    
    if (successfulDocs.length > 0) {
        message += `✅ **성공적으로 분석된 문서 (${successfulDocs.length}개):**\n`;
        successfulDocs.forEach((doc, index) => {
            message += `${index + 1}. **${doc.filename}**\n`;
            message += `   - 📊 ${doc.wordCount.toLocaleString()}단어, ${doc.paragraphCount}문단, ${doc.lineCount}줄\n`;
            message += `   - 📝 요약: ${doc.summary}\n\n`;
        });
    }
    
    if (failedDocs.length > 0) {
        message += `❌ **분석 실패한 문서 (${failedDocs.length}개):**\n`;
        failedDocs.forEach((doc, index) => {
            message += `${index + 1}. **${doc.filename}**: ${doc.error}\n`;
        });
        message += `\n`;
    }
    
    if (successfulDocs.length > 0) {
        message += `💬 **이제 문서 내용에 대해 질문하거나 요청하실 수 있습니다!**`;
    }
    
    return message;
}

module.exports = {
    parseDocument,
    parseMultipleDocuments,
    formatDocumentSummary,
    createDocumentContext
};
