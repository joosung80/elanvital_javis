const { processImageGeneration } = require('../utils/imageHandler');
const { saveImageToMemory, checkForImageMemory } = require('../utils/memoryHandler');

async function handleImageRequest(message, classification, actualContent = null) {
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

module.exports = { handleImageRequest };
