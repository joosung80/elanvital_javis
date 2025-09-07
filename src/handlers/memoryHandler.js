const { clearUserMemory } = require('../utils/memoryHandler');

async function handleMemoryRequest(message, classification) {
  console.log(`[MEMORY DEBUG] 🧠 메모리 관리 요청 처리 시작`);
  console.log(`[MEMORY DEBUG] 👤 사용자: ${message.author.tag}`);
  console.log(`[MEMORY DEBUG] 💬 메시지: "${message.content}"`);
  console.log(`[MEMORY DEBUG] 🎲 분류 신뢰도: ${classification.confidence}`);
  
  try {
    const result = clearUserMemory(message.author.id);
    
    console.log(`[MEMORY DEBUG] 📤 메모리 정리 결과: ${result.success ? '성공' : '실패'}`);
    console.log(`[MEMORY DEBUG] 📊 정리된 데이터:`, result.clearedData);
    
    if (result.success) {
      const successMessage = `🧠 **메모리 정리 완료!**\n\n` +
        `✅ **정리된 내용:**\n` +
        `📸 저장된 이미지: ${result.clearedData.images}개\n` +
        `📄 저장된 문서: ${result.clearedData.documents}개\n` +
        `💬 대화 기록: ${result.clearedData.conversations}개\n\n` +
        `🆕 **새로운 시작:** 모든 메모리가 초기화되었습니다.`;
      
      await message.reply(successMessage);
      console.log(`[MEMORY DEBUG] ✅ 메모리 정리 성공 메시지 전송`);
      return `메모리 정리 완료: 이미지 ${result.clearedData.images}개, 문서 ${result.clearedData.documents}개, 대화 ${result.clearedData.conversations}개 삭제`;
    } else {
      await message.reply(`🤔 **메모리 정리 결과**\n\n${result.message}`);
      console.log(`[MEMORY DEBUG] ⚠️ 메모리 정리 실패: ${result.message}`);
      return `메모리 정리 실패: ${result.message}`;
    }
    
  } catch (error) {
    console.error(`[MEMORY DEBUG] ❌ 메모리 관리 오류:`, error);
    console.error(`[MEMORY DEBUG] ❌ 오류 스택:`, error.stack);
    await message.reply('메모리 정리 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.');
    return `메모리 처리 오류: ${error.message}`;
  }
}

module.exports = { handleMemoryRequest };
