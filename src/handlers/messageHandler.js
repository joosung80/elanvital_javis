const { classifyUserInput } = require('../classifier');
const { saveConversationToMemory, clearUserMemory, checkForImageMemory, saveImageToMemory } = require('../utils/memoryHandler');
const { transcribeAudio } = require('../utils/voiceHandler');
const { processNaturalSchedule, deleteScheduleEvent } = require('../utils/scheduleHandler');
const { processImageGeneration } = require('../utils/imageHandler');
const { splitMessageForMobile } = require('../utils/messageUtils');
const { processGeneralQuestion } = require('../utils/generalHandler');
const { handleDocumentRequest } = require('../utils/documentHandler');

async function handleMessageCreate(message) {
  if (message.author.bot || message.content.startsWith('/')) return;

  try {
    let actualContent = message.content;
    let classification;

    if (message.attachments.size > 0) {
      const audioAttachment = message.attachments.find(att => att.contentType && att.contentType.startsWith('audio/'));
      if (audioAttachment) {
        try {
          const transcribedText = await transcribeAudio(audioAttachment.url, audioAttachment.name);
          actualContent = transcribedText;
          await message.reply(`🎤 **음성 인식 결과:** "${transcribedText}"`);
        } catch (error) {
          await message.reply('❌ 음성 인식에 실패했습니다. 다시 시도해주세요.');
          return;
        }
      }
    }

    if (actualContent.trim()) {
      classification = await classifyUserInput(actualContent, Array.from(message.attachments.values()), message.author.id);
      console.log(`[CLASSIFY] User: ${message.author.tag}, Category: ${classification.category}, Confidence: ${classification.confidence}`);

      let botResponse = '';
      switch (classification.category) {
        case 'HELP':
          botResponse = await handleHelpRequest(message, classification);
          break;
        case 'SCHEDULE':
          botResponse = await handleScheduleRequest(message, classification, actualContent);
          break;
        case 'IMAGE':
          botResponse = await handleImageRequest(message, classification, actualContent);
          break;
        case 'DOCUMENT':
          botResponse = await handleDocumentRequest(message, classification, actualContent);
          break;
        case 'MEMORY':
          botResponse = await handleMemoryRequest(message, classification);
          break;
        case 'GENERAL':
        default:
          botResponse = await handleGeneralRequest(message, classification);
          break;
      }
      if (classification.category !== 'MEMORY') {
        await saveConversationToMemory(message.author.id, actualContent, botResponse || '응답 완료', classification.category);
      }
    }
  } catch (error) {
    console.error('Error in message processing:', error);
    await message.reply('죄송합니다. 요청을 처리하는 동안 오류가 발생했습니다.');
  }
}

async function handleHelpRequest(message, classification) {
    const helpMessage = `🤖 **Elanvital Agent 기능 안내**...`; // Full message content here
    await message.reply(helpMessage);
    return `도움말 제공 완료`;
}

async function handleScheduleRequest(message, classification, actualContent) {
    const contentToProcess = actualContent || message.content;
    let result;
    if (classification.scheduleType === 'delete') {
      result = await deleteScheduleEvent(contentToProcess, message.author.id);
    } else {
      result = await processNaturalSchedule(contentToProcess, classification);
    }

    if (result.isInteractive && result.components) {
      await message.reply({ content: result.message, components: result.components });
    } else {
      const messageChunks = splitMessageForMobile(result.message);
      for (let i = 0; i < messageChunks.length; i++) {
        await (i === 0 ? message.reply(messageChunks[i]) : message.channel.send(messageChunks[i]));
      }
    }
    return result.message;
}

async function handleImageRequest(message, classification, actualContent) {
  const { processImageGeneration } = require('../utils/imageHandler');
  const { saveImageToMemory, checkForImageMemory } = require('../utils/memoryHandler');
  
  const contentToProcess = actualContent || message.content;
  
  console.log(`[IMAGE DEBUG] 🎨 이미지 처리 시작`);
  console.log(`[IMAGE DEBUG] ✅ 최종 처리 텍스트: "${contentToProcess}"`);
  
  try {
    const attachments = Array.from(message.attachments.values());
    const imageAttachments = attachments.filter(att => att.contentType && att.contentType.startsWith('image/'));
    
    let imageToUse = null;
    let isFromMemory = false;
    
    if (imageAttachments.length > 0) {
      imageToUse = { url: imageAttachments[0].url, mimeType: imageAttachments[0].contentType };
      saveImageToMemory(message.author.id, imageToUse.url, imageToUse.mimeType, contentToProcess);
      console.log(`[IMAGE DEBUG] 💾 새 이미지 메모리에 저장됨`);

      // 사용자 요청 확인 메시지 추가
      await message.reply(`🖼️ **이미지 접수 완료!**\n> "${contentToProcess}"\n\n위 내용으로 이미지를 생성 또는 수정하겠습니다. 잠시만 기다려주세요...`);
      
    } else {
      const memoryImage = checkForImageMemory(message.author.id, contentToProcess);
      if (memoryImage) {
        imageToUse = memoryImage;
        isFromMemory = true;
        console.log(`[IMAGE DEBUG] 🧠 메모리에서 이미지 사용`);
      }
    }
    
    if (imageToUse) {
      if (isFromMemory) {
        await message.reply('🧠 **이전에 업로드한 이미지를 사용합니다!** 새로운 프롬프트로 이미지를 수정하겠습니다.');
      }
      const result = await processImageGeneration(contentToProcess, imageToUse.url, imageToUse.mimeType, message.author.tag, message.author.displayAvatarURL(), message, message.author.id);
      if (result.success) {
        await message.reply({ embeds: [result.embed], files: result.files });
        return `이미지 ${isFromMemory ? '수정' : '처리'} 완료`;
      } else {
        await message.reply(result.textResponse || "이미지를 생성할 수 없습니다.");
        return `이미지 처리 실패: ${result.textResponse || result.error}`;
      }
    } else {
      const result = await processImageGeneration(contentToProcess, null, null, message.author.tag, message.author.displayAvatarURL(), message, message.author.id);
      if (result.success) {
        await message.reply({ embeds: [result.embed], files: result.files });
        return '이미지 생성 완료';
      } else {
        await message.reply(result.textResponse || '죄송합니다. 이미지를 생성할 수 없습니다.');
        return `이미지 생성 실패: ${result.textResponse || result.error}`;
      }
    }
  } catch (error) {
    console.error(`[IMAGE DEBUG] 💥 이미지 처리 중 예외 발생:`, error);
    await message.reply('이미지 처리 중 오류가 발생했습니다. `/image` 명령어를 사용해보세요.');
    return `이미지 처리 오류: ${error.message}`;
  }
}

async function handleGeneralRequest(message, classification) {
    const result = await processGeneralQuestion(message.content, Array.from(message.attachments.values()), message.author.id);
    const messageChunks = splitMessageForMobile(result.messageChunks.join('\n'));
    for (let i = 0; i < messageChunks.length; i++) {
        await (i === 0 ? message.reply(messageChunks[i]) : message.channel.send(messageChunks[i]));
    }
    return result.messageChunks.join('\n');
}

async function handleMemoryRequest(message, classification) {
    const result = clearUserMemory(message.author.id);
    const successMessage = `🧠 **메모리 정리 완료!**...`; // Full message
    await message.reply(result.success ? successMessage : result.message);
    return result.message;
}

module.exports = { handleMessageCreate };
