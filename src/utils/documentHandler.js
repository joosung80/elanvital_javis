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
const { getUserMemory } = require('../utils/memoryHandler');
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');

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
                systemPrompt = `당신은 긴 문서를 분석하고 보고하는 수석 애널리스트입니다. 다음 규칙을 **반드시** 지켜서 주어진 문서를 분석하고 요약해주세요.

**Part 1: 문서 용도 추측**
- 문서의 내용, 형식, 단어 선택 등을 종합적으로 분석하여 이 문서의 **핵심 용도**를 추측합니다. (예: 강의안, 회의록, 프로젝트 기획서, 기술 메뉴얼, 주간 보고서 등)
- 추측한 용도와 그 근거를 **정확히 2줄**로 설명하여 요약의 가장 첫 부분에 제시해주세요.

**Part 2: 핵심 내용 요약**
- '문서 용도'를 제시한 후, 한 줄을 띄고 다음 규칙에 따라 내용을 요약합니다.
- **서론**: 문서의 핵심 주제를 1~2줄로 설명합니다.
- **본론**: 가장 중요한 포인트 2~5개를 글머리 기호(-)를 사용하여 목록으로 만듭니다.
- **결론**: 문서의 최종 결론이나 시사점을 1줄로 요약합니다.
- **분량**: Part 2의 요약은 **8줄 이내**로 작성하여, 전체(Part 1 + Part 2)가 너무 길어지지 않게 합니다.
- **스타일**: 중요한 키워드는 **굵은 글씨**로 강조하고, 전문적인 톤을 유지합니다.
- **언어**: 반드시 한국어로 작성합니다.`;
                break;
        }
        
        userPrompt = `다음 문서를 위의 규칙에 따라 요약해주세요:

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
    
    const successfulDocs = documentContexts.filter(doc => !doc.error);
    if (successfulDocs.length > 0) {
      await saveDocumentsToMemory(message.author.id, successfulDocs);
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
 * '문서 요약' 버튼 상호작용을 처리합니다.
 * @param {object} interaction - Discord 상호작용 객체
 */
async function handleSummarizeButton(interaction) {
    await interaction.deferReply();
    const { client, user } = interaction;
    const userMemory = client.memory.getUserMemory(user.id);
    const lastDocument = userMemory.lastDocument;

    if (!lastDocument || !lastDocument.content) {
        await interaction.followUp({ content: '❌ 요약할 문서가 컨텍스트에 없습니다. 먼저 문서를 읽어주세요.', ephemeral: true });
        return;
    }

    const documentTitle = lastDocument.filename || lastDocument.title || '현재 문서';
    
    try {
        await interaction.update({ content: `📝 **'${documentTitle}'** 문서를 요약 중입니다...`, components: [] });
        
        const summary = await summarizeDocument(lastDocument.content, documentTitle);
        
        const replyMessage = `📝 **'${documentTitle}' 문서 요약**\n\n${summary}`;
        
        await interaction.followUp(replyMessage);

    } catch (error) {
        console.error(`[DOC SUMMARIZE] ❌ 문서 요약 중 오류 발생:`, error);
        await interaction.followUp({ content: '❌ 문서 요약을 처리하는 중 오류가 발생했습니다.', ephemeral: true });
    }
}

/**
 * 문서 요약 요청을 처리합니다.
 * @param {object} message - Discord 메시지 객체
 */
async function handleDocumentSummarizationRequest(message) {
    const userId = message.author.id;
    const memory = getUserMemory(userId);

    if (!memory.lastDocuments || memory.lastDocuments.length === 0) {
        await message.reply('❌ 요약할 문서가 컨텍스트에 없습니다. 먼저 문서를 읽어주세요.');
        return;
    }

    const lastDocument = memory.lastDocuments[0];
    
    try {
        await message.channel.sendTyping();
        const openai = getOpenAIClient();
        const systemPrompt = "You are a helpful assistant who summarizes documents. Summarize the following document content concisely, in Korean, focusing on the key points.";

        const response = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: `Please summarize the following document:\n\nTitle: ${lastDocument.title}\n\nContent:\n${lastDocument.content}` }
            ],
            temperature: 0.5,
        });

        const summary = response.choices[0].message.content;
        const replyMessage = `📝 **'${lastDocument.title}' 문서 요약**\n\n${summary}`;
        await message.reply(replyMessage);

    } catch (error) {
        console.error(`[DOC SUMMARIZE] ❌ 문서 요약 중 오류 발생:`, error);
        await message.reply('❌ 문서 요약을 처리하는 중 오류가 발생했습니다.');
    }
}

function searchInDocument(document, keyword) {
    const { content, mimeType, title } = document;
    const readableType = mimeType === 'application/vnd.google-apps.document' ? 'Docs' 
                       : mimeType === 'application/vnd.google-apps.spreadsheet' ? 'Sheets'
                       : mimeType === 'application/vnd.google-apps.presentation' ? 'Slides' 
                       : 'Unknown';
    console.log(`[SEARCH] 📄 "${title}" (${readableType})에서 "${keyword}" 검색 중...`);
    if (!content) return '';

    let results = [];
    const lines = content.split('\n');
    const lowerCaseKeyword = keyword.toLowerCase();
    
    let matchCount = 0;
    const contextAfter = 3; // 모든 문서 유형에 대해 아래 3줄의 컨텍스트를 표시
    const maxMatches = 5;   // 최대 5개의 일치 항목을 표시

    for (let i = 0; i < lines.length; i++) {
        if (lines[i].toLowerCase().includes(lowerCaseKeyword)) {
            if (matchCount >= maxMatches) {
                results.push('> ... (일치하는 결과가 더 있지만 5개만 표시합니다)');
                break;
            }

            let resultBlock = [];
            const start = i;
            const end = Math.min(lines.length - 1, i + contextAfter);

            for (let j = start; j <= end; j++) {
                const lineContent = lines[j] || '';
                if (j === i) {
                    resultBlock.push(`> **Line ${j + 1}:** ${lineContent}`);
                } else {
                    resultBlock.push(`> Line ${j + 1}: ${lineContent}`);
                }
            }
            results.push(`**[매치 #${matchCount + 1}]**\n${resultBlock.join('\n')}`);
            matchCount++;
        }
    }
    return results.join('\n\n---\n\n');
}

async function getSmartKeywords(originalKeyword, isKorean) {
    try {
        const openai = getOpenAIClient();
        
        // 한글 키워드인지 자동 감지
        const isKoreanKeyword = isKorean !== undefined ? isKorean : /[ㄱ-ㅎ|ㅏ-ㅣ|가-힣]/.test(originalKeyword);
        
        const systemPrompt = `You are a Search Query Expansion assistant. Your goal is to generate 2 highly relevant keywords based on an original search term.

1.  **Analyze Intent**: Understand the user's likely intent behind the original keyword.
2.  **Generate Keywords**: Provide up to 2 alternative keywords that a user might search for to find the same or related content.
3.  **Strategy Selection**: 
    - If the original keyword is Korean, prioritize English translation first, then Korean synonyms
    - If the original keyword is English, prioritize Korean translation first, then English synonyms
4.  **Format**: Your output **MUST** be a JSON object with "strategy" and "keywords" fields:
    - strategy: "english" (for English translations), "korean_synonyms" (for Korean synonyms), "english_synonyms" (for English synonyms), or "korean" (for Korean translations)
    - keywords: array of strings (up to 2 keywords)

**Example 1:**
Original Keyword: "패스워드"
Your Output:
{
  "strategy": "english",
  "keywords": ["password", "login"]
}

**Example 2:**
Original Keyword: "마케팅 기획서"
Your Output:
{
  "strategy": "korean_synonyms",
  "keywords": ["광고 전략", "홍보 방안"]
}

**Example 3:**
Original Keyword: "machine learning"
Your Output:
{
  "strategy": "korean",
  "keywords": ["머신러닝", "기계학습"]
}
`;

        const completion = await openai.chat.completions.create({
            model: 'gpt-4-turbo',
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: `Original Keyword: "${originalKeyword}"` }
            ],
            temperature: 0.4,
            max_tokens: 150,
            response_format: { type: "json_object" },
        });

        const response = JSON.parse(completion.choices[0].message.content);
        console.log(`[SMART_SEARCH] 🧠 "${originalKeyword}" → [${response.keywords.join(', ')}] (${response.strategy})`);
        return response;
    } catch (error) {
        console.error(`[SMART_SEARCH] ❌ 스마트 검색 키워드 생성 실패:`, error);
        return null;
    }
}

async function handleSearchInDocument(interaction, document, keyword) {
    try {
        let searchResultText = searchInDocument(document, keyword);

        // 검색 결과가 없을 경우 스마트 검색 적용
        if (!searchResultText || searchResultText.trim() === '') {
            await interaction.editReply({ content: `'${keyword}'에 대한 검색 결과가 없습니다. 스마트 검색으로 다시 시도합니다... 🧐` });
            
            const isKorean = /[ㄱ-ㅎ|ㅏ-ㅣ|가-힣]/.test(keyword);
            const expansion = await getSmartKeywords(keyword, isKorean);

            let expandedSearchResults = [];
            
            if (expansion && expansion.keywords && expansion.keywords.length > 0) {
                for (const newKeyword of expansion.keywords) {
                    const newResult = searchInDocument(document, newKeyword);
                    if (newResult) {
                         expandedSearchResults.push(`---\n**'${newKeyword}'(으)로 다시 검색한 결과:**\n${newResult}`);
                    }
                }
                searchResultText = expandedSearchResults.join('\n');
            }
        }


        if (!searchResultText || searchResultText.trim() === '') {
            await interaction.editReply(`문서 '**${document.title || '제목 없음'}**'에서 키워드 '**${keyword}**'(으)로 검색된 내용이 없습니다.`);
            return;
        }

        const truncatedResult = searchResultText.length > 3800 ? searchResultText.substring(0, 3800) + '...' : searchResultText;

        const resultEmbed = new EmbedBuilder()
            .setColor(0x0099FF)
            .setTitle(`'${document.title || '제목 없음'}' 문서 내 검색 결과`)
            .setDescription(`**검색 키워드:** \`${keyword}\`\n\n${truncatedResult}`)
            .setFooter({ text: '검색이 완료되었습니다.'})
            .setTimestamp();

        await interaction.editReply({ embeds: [resultEmbed] });

    } catch (error) {
        console.error('[DOCUMENT SEARCH] 문서 내 검색 중 오류:', error);
        await interaction.editReply('문서 내 검색 중 오류가 발생했습니다.');
    }
}

/**
 * 날짜를 'YYYY년 MM월 DD일 HH:mm' 형식으로 포맷팅합니다.
 * @param {string} dateString - ISO 8601 형식의 날짜 문자열
 */
function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleString('ko-KR', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });
}

module.exports = {
    parseDocument,
    parseMultipleDocuments,
    formatDocumentSummary,
    createDocumentContext,
    summarizeDocument,
    handleDocumentRequest,
    handleSummarizeButton,
    handleDocumentSummarizationRequest,
    searchInDocument,
    handleSearchInDocument,
    getSmartKeywords
};
