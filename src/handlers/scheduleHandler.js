const { processNaturalSchedule, deleteScheduleEvent } = require('../utils/scheduleHandler');
const { splitMessageForMobile } = require('../utils/messageUtils');

async function handleScheduleRequest(message, classification, actualContent = null) {
  const contentToProcess = actualContent || message.content;
  
  console.log(`[SCHEDULE DEBUG] 🎯 스케줄 요청 처리 시작`);
  console.log(`[SCHEDULE DEBUG] 👤 사용자: ${message.author.tag}`);
  console.log(`[SCHEDULE DEBUG] 💬 메시지: "${contentToProcess}"`);
  console.log(`[SCHEDULE DEBUG] 🎲 분류 신뢰도: ${classification.confidence}`);
  
  try {
    let result;
    if (classification.scheduleType === 'delete') {
      result = await deleteScheduleEvent(contentToProcess, message.author.id);
    } else {
      result = await processNaturalSchedule(contentToProcess, classification);
    }
    
    console.log(`[SCHEDULE DEBUG] 📤 응답 전송: ${result.success ? '성공' : '실패'}`);
    
    if (result.isInteractive && result.components) {
      console.log(`[SCHEDULE DEBUG] 🔘 인터랙티브 UI 전송`);
      await message.reply({
        content: result.message,
        components: result.components
      });
      return `스케줄 인터랙티브 응답: ${result.message}`;
    } else {
      const messageChunks = splitMessageForMobile(result.message);
      
      for (let i = 0; i < messageChunks.length; i++) {
        if (i === 0) {
          await message.reply(messageChunks[i]);
        } else {
          await message.channel.send(messageChunks[i]);
        }
      }
      
      console.log(`[SCHEDULE DEBUG] ✅ 스케줄 요청 처리 완료`);
      return `스케줄 처리 완료: ${result.message}`;
    }
  } catch (error) {
    console.error(`[SCHEDULE DEBUG] ❌ 스케줄 핸들링 오류:`, error);
    await message.reply('일정 처리 중 오류가 발생했습니다. `/myschedule` 명령어를 사용해보세요.');
    return `스케줄 처리 오류: ${error.message}`;
  }
}

module.exports = { handleScheduleRequest };
