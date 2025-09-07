const { classifyUserInput } = require('../classifier');
const { saveConversationToMemory, clearUserMemory, checkForImageMemory, saveImageToMemory } = require('../utils/memoryHandler');
const { transcribeAudio } = require('../utils/voiceHandler');
const { processNaturalSchedule, deleteScheduleEvent } = require('../utils/scheduleHandler');
const { processImageGeneration } = require('../utils/imageHandler');
const { splitMessageForMobile } = require('../utils/messageUtils');
const { processGeneralQuestion } = require('../utils/generalHandler');
const { handleDocumentRequest } = require('../utils/documentHandler');
const { addTask, addMultipleTasks, listTasks, cacheTasksForCompletion, searchAndCacheTasks, parseMultipleTasks } = require('../utils/taskHandler');
const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

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
        case 'TASK':
          botResponse = await handleTaskRequest(message, classification, actualContent);
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

async function handleTaskRequest(message, classification, actualContent) {
    try {
        if (classification.taskType === 'add') {
            const content = classification.extractedInfo.content || actualContent;
            if (!content) {
                await message.reply('📝 추가할 할 일 내용을 입력해주세요.');
                return '할 일 내용 없음';
            }

            // Parse multiple tasks
            const taskTitles = parseMultipleTasks(content);
            
            if (taskTitles.length === 1) {
                // Single task
                const task = await addTask(taskTitles[0]);
                await message.reply(`✅ **Google Tasks에 할 일을 추가했습니다!**\n**할 일:** ${task.title}`);
                return `Google Tasks 할 일 추가 완료: ${task.title}`;
            } else {
                // Multiple tasks
                const { createdTasks, errors } = await addMultipleTasks(taskTitles);
                
                let responseMessage = `✅ **Google Tasks에 ${createdTasks.length}개의 할 일을 추가했습니다!**\n\n`;
                
                if (createdTasks.length > 0) {
                    responseMessage += '**추가된 할 일:**\n';
                    createdTasks.forEach((task, index) => {
                        responseMessage += `${index + 1}. ${task.title}\n`;
                    });
                }
                
                if (errors.length > 0) {
                    responseMessage += `\n⚠️ **실패한 할 일 (${errors.length}개):**\n`;
                    errors.forEach((error, index) => {
                        responseMessage += `${index + 1}. ${error.title} - ${error.error}\n`;
                    });
                }
                
                await message.reply(responseMessage);
                return `Google Tasks 멀티 할 일 추가 완료: ${createdTasks.length}개 성공, ${errors.length}개 실패`;
            }

        } else if (classification.taskType === 'query') {
            const tasks = await listTasks();
            if (tasks.length === 0) {
                await message.reply('🗒️ 완료할 할 일이 없습니다.');
                return '등록된 할 일 없음';
            }

            // Cache tasks for interactive completion
            const sessionId = cacheTasksForCompletion(tasks);
            
            // Create numbered list
            const taskList = tasks.map((task, index) => 
                `${index + 1}. **${task.title}** (목록: ${task.tasklistTitle})`
            ).join('\n');

            // Create buttons (max 5 buttons per row, Discord limit)
            const buttons = [];
            const maxTasks = Math.min(tasks.length, 10); // Limit to 10 tasks for UI clarity
            
            for (let i = 0; i < maxTasks; i++) {
                buttons.push(
                    new ButtonBuilder()
                        .setCustomId(`complete_task_${sessionId}_${i}`)
                        .setLabel(`${i + 1}`)
                        .setStyle(ButtonStyle.Primary)
                        .setEmoji('✅')
                );
            }

            // Split buttons into rows (max 5 buttons per row)
            const rows = [];
            for (let i = 0; i < buttons.length; i += 5) {
                const row = new ActionRowBuilder().addComponents(buttons.slice(i, i + 5));
                rows.push(row);
            }

            await message.reply({
                content: `🗒️ **완료할 작업을 선택해주세요:**\n\n${taskList}\n\n아래 번호를 클릭하여 완료 처리하세요:`,
                components: rows
            });
            
            return 'Google Tasks 목록 조회 완료 (버튼 방식)';
            
        } else if (classification.taskType === 'complete') {
            const searchKeyword = classification.extractedInfo.content || actualContent;
            if (!searchKeyword) {
                await message.reply('🔍 완료하려는 할 일의 키워드를 입력해주세요.');
                return '완료할 할 일 키워드 없음';
            }

            // Extract keyword by removing completion-related words
            const cleanKeyword = searchKeyword
                .replace(/완료\s*처리해줘?|끝났어|했어|완료해줘?|처리해줘?|삭제해줘?|지워줘?|취소해줘?/gi, '')
                .trim();

            const { sessionId, matchedTasks, autoCompleted, completedTask } = await searchAndCacheTasks(cleanKeyword);
            
            // If auto-completed, show success message
            if (autoCompleted && completedTask) {
                await message.reply(`✅ **자동 완료!**\n할 일 **'${completedTask.title}'**을(를) 완료했습니다. (유사도: ${Math.round(completedTask.similarity * 100)}%)`);
                return `할 일 자동 완료: ${completedTask.title}`;
            }
            
            if (!matchedTasks || matchedTasks.length === 0) {
                await message.reply(`🔍 **'${cleanKeyword}'**와 관련된 할 일을 찾을 수 없습니다.\n전체 목록을 확인하려면 "할일 목록 보여줘"라고 입력해주세요.`);
                return '관련 할 일 없음';
            }

            // Create numbered list of matched tasks with similarity scores
            const taskList = matchedTasks.map((task, index) => 
                `${index + 1}. **${task.title}** (목록: ${task.tasklistTitle}) - 유사도: ${Math.round(task.similarity * 100)}%`
            ).join('\n');

            // Create buttons for matched tasks
            const buttons = [];
            const maxTasks = Math.min(matchedTasks.length, 10);
            
            for (let i = 0; i < maxTasks; i++) {
                buttons.push(
                    new ButtonBuilder()
                        .setCustomId(`complete_task_${sessionId}_${i}`)
                        .setLabel(`${i + 1}`)
                        .setStyle(ButtonStyle.Success)
                        .setEmoji('✅')
                );
            }

            // Split buttons into rows (max 5 buttons per row)
            const rows = [];
            for (let i = 0; i < buttons.length; i += 5) {
                const row = new ActionRowBuilder().addComponents(buttons.slice(i, i + 5));
                rows.push(row);
            }

            await message.reply({
                content: `🔍 **'${cleanKeyword}'**와 관련된 할 일을 찾았습니다:\n\n${taskList}\n\n완료할 작업의 번호를 클릭해주세요:`,
                components: rows
            });
            
            return `관련 할 일 검색 완료: ${matchedTasks.length}개 발견`;
        }
    } catch (error) {
        console.error('Google Tasks 처리 중 오류:', error);
        
        let replyMessage = '알 수 없는 오류가 발생했습니다.';
        if (error.message.includes('credentials.json not found')) {
            replyMessage = '🔒 **인증 파일 없음!**\n`credentials.json` 파일을 프로젝트 최상단에 추가해주세요.';
        } else if (error.message.includes('invalid_grant')) {
            replyMessage = '🔒 **인증 실패!**\n인증 정보가 만료되었거나 올바르지 않습니다. `token.json` 파일을 삭제하고 다시 시도해주세요.';
        } else if (error.message.includes('No task lists found')) {
            replyMessage = '🚫 **태스크 리스트 없음!**\nGoogle Tasks에서 태스크 리스트를 먼저 생성해주세요.';
        } else {
            replyMessage = '🔒 **Google 연동이 필요합니다.**\n처음 사용하는 경우, 콘솔에 표시된 URL에 접속하여 로그인을 완료해주세요.';
        }
        
        await message.reply(replyMessage);
        return `Google Tasks 오류: ${error.message}`;
    }
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
