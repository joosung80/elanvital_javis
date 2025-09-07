const { processGeneralQuestion } = require('../utils/generalHandler');

async function handleGeneralRequest(message, classification) {
  console.log(`[GENERAL DEBUG] 🎯 일반 질문 요청 처리 시작`);
  console.log(`[GENERAL DEBUG] 👤 사용자: ${message.author.tag}`);
  console.log(`[GENERAL DEBUG] 💬 메시지: "${message.content}"`);
  console.log(`[GENERAL DEBUG] 🎲 분류 신뢰도: ${classification.confidence}`);
  
  try {
    const attachments = Array.from(message.attachments.values());
    console.log(`[GENERAL DEBUG] 📎 첨부파일 수: ${attachments.length}`);
    
    const result = await processGeneralQuestion(
      message.content,
      attachments,
      message.author.id
    );
    
    console.log(`[GENERAL DEBUG] 📤 응답 전송: ${result.success ? '성공' : '실패'}`);
    
    if (result.success) {
      for (let i = 0; i < result.messageChunks.length; i++) {
        if (i === 0) {
          await message.reply(result.messageChunks[i]);
        } else {
          await message.channel.send(result.messageChunks[i]);
        }
      }
      console.log(`[GENERAL DEBUG] ✅ 일반 질문 처리 완료 (${result.messageChunks.length}개 메시지)`);
      return `일반 질문 처리 완료: ${result.messageChunks.join(' ')}`;
    } else {
      await message.reply(result.messageChunks[0]);
      console.log(`[GENERAL DEBUG] ❌ 일반 질문 처리 실패: ${result.error}`);
      return `일반 질문 처리 실패: ${result.error}`;
    }
    
  } catch (error) {
    console.error(`[GENERAL DEBUG] ❌ 일반 질문 핸들링 오류:`, error);
    console.error(`[GENERAL DEBUG] ❌ 오류 스택:`, error.stack);
    await message.reply('죄송합니다. 답변을 생성하는 동안 오류가 발생했습니다. 잠시 후 다시 시도해주세요.');
    return `일반 질문 처리 오류: ${error.message}`;
  }
}

module.exports = { handleGeneralRequest };
