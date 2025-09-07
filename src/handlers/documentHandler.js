const { parseMultipleDocuments, summarizeDocument, formatDocumentSummary } = require('../utils/documentHandler');
const { saveDocumentsToMemory } = require('../utils/memoryHandler');

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
      const response = `📄 **문서를 찾을 수 없습니다**\n\n지원되는 문서 형식:\n- PDF (.pdf)\n- Word 문서 (.docx, .doc)\n\n문서를 첨부하고 다시 시도해주세요.`;
      await message.reply(response);
      return response;
    }
    
    const processingMessage = await message.reply(`📄 **문서 분석 중...**\n\n${documentAttachments.map(att => `📎 ${att.name}`).join('\n')}\n\n⏳ 잠시만 기다려주세요...`);
    
    const documentContexts = await parseMultipleDocuments(documentAttachments);
    
    const contentToProcess = actualContent || message.content;
    const explicitSummaryKeywords = [
      '요약', '요약해줘', '요약해주세요', '정리', '정리해줘', '정리해주세요',
      'summary', 'summarize', '핵심', '핵심만', '간단히', '간략히',
      '주요 내용', '중요한 내용', '포인트'
    ];
    
    const documentQuestionKeywords = [
      '문서 요약', '내용 요약', '문서 내용', '이 문서', '이 파일',
      '문서에서', '파일에서', '내용에서', '문서 정리', '파일 정리'
    ];
    
    const hasExplicitSummary = explicitSummaryKeywords.some(keyword => 
      contentToProcess.toLowerCase().includes(keyword.toLowerCase())
    );
    
    const hasDocumentQuestion = documentQuestionKeywords.some(keyword => 
      contentToProcess.toLowerCase().includes(keyword.toLowerCase())
    );
    
    const isSimpleUpload = contentToProcess.trim().length === 0 || 
                          contentToProcess.trim() === '문서 요약해줘';
    
    const requestsSummary = hasExplicitSummary || hasDocumentQuestion || isSimpleUpload;
    
    let aiSummary = null;
    
    const successfulDocs = documentContexts.filter(doc => doc.type === 'document');
    if (requestsSummary && successfulDocs.length > 0) {
      console.log(`[DOCUMENT] 🤖 요약 요청 감지 - AI 요약 실행`);
      
      await processingMessage.edit(`📄 **문서 분석 중...**\n\n${documentAttachments.map(att => `📎 ${att.name}`).join('\n')}\n\n🤖 **AI 요약 생성 중...** ⏳`);
      
      try {
        const firstDoc = successfulDocs[0];
        
        let summaryType = 'detailed';
        if (contentToProcess.includes('간단') || contentToProcess.includes('간략') || contentToProcess.includes('brief')) {
          summaryType = 'brief';
        } else if (contentToProcess.includes('핵심') || contentToProcess.includes('포인트') || contentToProcess.includes('key')) {
          summaryType = 'key_points';
        }
        
        aiSummary = await summarizeDocument(firstDoc.content, firstDoc.filename, summaryType);
        console.log(`[DOCUMENT] ✅ AI 요약 완료: ${aiSummary.length}자`);
        
      } catch (error) {
        console.error(`[DOCUMENT] ❌ AI 요약 실패:`, error);
        aiSummary = `**AI 요약 생성 실패**\n\n${error.message}\n\n기본 문서 정보를 확인해주세요.`;
      }
    }
    
    const summaryMessage = formatDocumentSummary(documentContexts, aiSummary);
    
    await processingMessage.edit(summaryMessage);
    
    if (successfulDocs.length > 0) {
      saveDocumentsToMemory(message.author.id, documentContexts);
      console.log(`[DOCUMENT] 💾 ${successfulDocs.length}개 문서가 메모리에 저장됨`);
    }
    
    return summaryMessage;
    
  } catch (error) {
    console.error('[DOCUMENT REQUEST] ❌ 문서 처리 오류:', error);
    const errorResponse = `❌ **문서 처리 중 오류가 발생했습니다**\n\n${error.message}\n\n다시 시도해주세요.`;
    await message.reply(errorResponse);
    return errorResponse;
  }
}

module.exports = { handleDocumentRequest };
