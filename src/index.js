const fs = require('node:fs');
const path = require('node:path');
const { Client, Collection, Events, GatewayIntentBits } = require('discord.js');
const { classifyUserInput } = require('./classifier');
const { 
  saveImageToMemory, 
  saveConversationToMemory, 
  checkForImageMemory,
  getCurrentContext,
  getMemoryStats 
} = require('./utils/memoryHandler');
const FormData = require('form-data');
const https = require('https');
const axios = require('axios');
require('dotenv').config();

// Discord 클라이언트 초기화
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});


// 슬래시 명령어 로드
client.commands = new Collection();
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
  const filePath = path.join(commandsPath, file);
  const command = require(filePath);
  if ('data' in command && 'execute' in command) {
    client.commands.set(command.data.name, command);
  } else {
    console.log(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
  }
}

client.once(Events.ClientReady, () => {
  console.log(`Logged in as ${client.user.tag}!`);
});

// 음성 파일을 텍스트로 변환하는 함수
async function transcribeAudio(audioUrl, filename) {
  console.log(`[VOICE DEBUG] 🎤 음성 변환 시작 - 파일: ${filename}`);
  
  try {
    // 음성 파일 다운로드
    const audioBuffer = await downloadFile(audioUrl);
    console.log(`[VOICE DEBUG] 📥 파일 다운로드 완료 - 크기: ${audioBuffer.length} bytes`);
    
    // 파일 크기 검증 (Whisper API 제한: 25MB)
    if (audioBuffer.length > 25 * 1024 * 1024) {
      throw new Error('파일 크기가 25MB를 초과합니다.');
    }
    
    // 파일 크기가 너무 작은 경우
    if (audioBuffer.length < 100) {
      throw new Error('파일 크기가 너무 작습니다.');
    }
    
    const contentType = getContentType(filename);
    console.log(`[VOICE DEBUG] 📄 파일 정보 - 이름: ${filename}, 타입: ${contentType}, 크기: ${audioBuffer.length} bytes`);
    
    // FormData 생성
    const formData = new FormData();
    formData.append('file', audioBuffer, {
      filename: filename,
      contentType: contentType
    });
    formData.append('model', 'whisper-1');
    formData.append('language', 'ko'); // 한국어 설정
    
    console.log(`[VOICE DEBUG] 📤 Whisper API 요청 전송 중...`);
    
    // OpenAI Whisper API 호출 (axios 사용)
    const response = await axios.post('https://api.openai.com/v1/audio/transcriptions', formData, {
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        ...formData.getHeaders()
      },
      maxContentLength: Infinity,
      maxBodyLength: Infinity
    });
    
    console.log(`[VOICE DEBUG] ✅ 음성 변환 완료: "${response.data.text}"`);
    
    return response.data.text;
  } catch (error) {
    console.error(`[VOICE DEBUG] ❌ 음성 변환 실패:`, error);
    throw error;
  }
}

// 파일 다운로드 함수
async function downloadFile(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (response) => {
      const chunks = [];
      
      response.on('data', (chunk) => {
        chunks.push(chunk);
      });
      
      response.on('end', () => {
        resolve(Buffer.concat(chunks));
      });
      
      response.on('error', (error) => {
        reject(error);
      });
    }).on('error', (error) => {
      reject(error);
    });
  });
}

// 파일 확장자에 따른 Content-Type 반환
function getContentType(filename) {
  const ext = path.extname(filename).toLowerCase();
  switch (ext) {
    case '.ogg':
      return 'audio/ogg';
    case '.webm':
      return 'audio/webm';
    case '.mp3':
      return 'audio/mpeg';
    case '.wav':
      return 'audio/wav';
    case '.m4a':
      return 'audio/mp4';
    default:
      return 'audio/ogg'; // Discord 기본값
  }
}

// 슬래시 명령어 핸들러
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;
  const command = interaction.client.commands.get(interaction.commandName);
  if (!command) return;

  try {
    await command.execute(interaction);
  } catch (error) {
    console.error(error);
    await interaction.reply({ content: 'There was an error while executing this command!', ephemeral: true });
  }
});

// 일반 채팅 핸들러 (LLM 분류 시스템)
client.on('messageCreate', async message => {
  if (message.author.bot || message.content.startsWith('/')) return;

  try {
    let messageContent = message.content;
    
    // 음성 파일 처리
    if (message.attachments.size > 0) {
      for (const attachment of message.attachments.values()) {
        // 음성 파일 확인 (Discord 음성 메시지는 보통 .ogg 또는 .webm)
        if (attachment.contentType && attachment.contentType.startsWith('audio/')) {
          console.log(`[VOICE DEBUG] 🎤 음성 파일 감지: ${attachment.name}`);
          
          try {
            // 음성을 텍스트로 변환
            const transcribedText = await transcribeAudio(attachment.url, attachment.name);
            
            // 기존 텍스트와 음성 변환 텍스트 결합
            if (messageContent.trim()) {
              messageContent = `${messageContent} ${transcribedText}`;
            } else {
              messageContent = transcribedText;
            }
            
            // 사용자에게 변환 결과 알림
            await message.reply(`🎤 **음성 인식 결과:** "${transcribedText}"`);
            
          } catch (error) {
            console.error(`[VOICE DEBUG] ❌ 음성 처리 실패:`, error);
            await message.reply('❌ 음성 인식에 실패했습니다. 다시 시도해주세요.');
            return;
          }
        }
      }
    }
    
    // 텍스트가 없으면 처리하지 않음
    if (!messageContent.trim()) {
      return;
    }

    // 사용자 입력 분류 (음성 변환된 텍스트 포함)
    const classification = await classifyUserInput(
      messageContent, 
      Array.from(message.attachments.values()),
      message.author.id
    );

    console.log(`[GPT-4o-mini 분류 결과] 사용자: ${message.author.tag}, 카테고리: ${classification.category}, 신뢰도: ${classification.confidence}`);
    
    // 메모리 컨텍스트 정보 로그
    if (classification.memoryContext) {
      console.log(`[MEMORY CLASSIFICATION] 🧠 메모리 활용 분류:`);
      console.log(`[MEMORY CLASSIFICATION] 📸 저장된 이미지: ${classification.memoryContext.hasLastImage ? '있음' : '없음'}`);
      console.log(`[MEMORY CLASSIFICATION] 📋 마지막 주제: ${classification.memoryContext.lastTopic || '없음'}`);
      console.log(`[MEMORY CLASSIFICATION] 🔄 세션 타입: ${classification.memoryContext.sessionType || '없음'}`);
      console.log(`[MEMORY CLASSIFICATION] 💬 최근 대화 수: ${classification.memoryContext.recentConversationCount}`);
      console.log(`[MEMORY CLASSIFICATION] ✅ 메모리 활용 여부: ${classification.memoryContext.usedMemoryForClassification}`);
    }

    // 메모리 기반 특별 처리 - 더 엄격한 조건
    if (classification.memoryContext && classification.memoryContext.hasLastImage && 
        message.attachments.size === 0 && classification.category !== 'SCHEDULE') {
      
      const messageText = messageContent || message.content;
      
      // 명시적인 이미지 관련 키워드나 컨텍스트 기반 요청 확인
      const explicitImageKeywords = [
        '그려', '그림', '이미지', '수정', '바꿔', '변경', '만들어', 'draw', 'image', 'modify', 'change',
        '더 밝게', '더 어둡게', '색깔', '배경', '스타일', '예쁘게', '멋있게', '귀엽게'
      ];
      
      const contextKeywords = [
        '대화를 바탕으로', '컨텍스트를 바탕으로', '이전 이미지', '방금 전', '아까',
        '이번에는', '이제는', '다시', '또', '계속해서'
      ];
      
      const hasExplicitImageKeyword = explicitImageKeywords.some(keyword => 
        messageText.toLowerCase().includes(keyword.toLowerCase())
      );
      
      const hasContextKeyword = contextKeywords.some(keyword => 
        messageText.toLowerCase().includes(keyword.toLowerCase())
      );
      
      // 이미지 관련 키워드가 있거나 명시적인 컨텍스트 요청인 경우만 재분류
      if (hasExplicitImageKeyword || hasContextKeyword) {
        console.log(`[MEMORY OVERRIDE] 🧠 이미지 관련 키워드 감지: "${messageText}"`);
        console.log(`[MEMORY OVERRIDE] 🔍 이미지 키워드: ${hasExplicitImageKeyword}, 컨텍스트 키워드: ${hasContextKeyword}`);
        
        classification.category = 'IMAGE';
        classification.reason = '메모리에 저장된 이미지와 명시적인 이미지 관련 요청으로 판단';
        classification.confidence = Math.min(0.9, classification.confidence + 0.2);
        classification.memoryOverride = true;
        
        console.log(`[MEMORY OVERRIDE] ✅ 카테고리 재분류: IMAGE (신뢰도: ${classification.confidence})`);
      } else {
        console.log(`[MEMORY OVERRIDE] ❌ 이미지 키워드 없음: 일반 질문으로 유지`);
        console.log(`[MEMORY OVERRIDE] 📝 메시지: "${messageText}"`);
      }
    }

    let botResponse = '';
    
    switch (classification.category) {
      case 'SCHEDULE':
        botResponse = await handleScheduleRequest(message, classification, messageContent);
        break;
      case 'IMAGE':
        botResponse = await handleImageRequest(message, classification, messageContent);
        break;
      case 'GENERAL':
      default:
        botResponse = await handleGeneralRequest(message, classification);
        break;
    }
    
    // 대화 내용을 메모리에 저장
    saveConversationToMemory(
      message.author.id,
      messageContent || message.content,
      botResponse || '응답 완료',
      classification.category,
      {
        confidence: classification.confidence,
        timestamp: new Date(),
        hasAttachments: message.attachments.size > 0
      }
    );

  } catch (error) {
    console.error('Error in message processing:', error);
    await message.reply('죄송합니다. 요청을 처리하는 동안 오류가 발생했습니다.');
  }
});

// 모바일 친화적인 메시지 분할 함수
function splitMessageForMobile(text, maxLength = 1800) {
  if (text.length <= maxLength) return [text];
  
  const chunks = [];
  let currentChunk = '';
  const lines = text.split('\n');
  
  for (const line of lines) {
    // 현재 청크에 이 줄을 추가했을 때 길이 확인
    const testChunk = currentChunk + (currentChunk ? '\n' : '') + line;
    
    if (testChunk.length <= maxLength) {
      currentChunk = testChunk;
    } else {
      // 현재 청크를 저장하고 새 청크 시작
      if (currentChunk) {
        chunks.push(currentChunk);
        currentChunk = line;
      } else {
        // 한 줄이 너무 긴 경우 강제로 자르기
        chunks.push(line.substring(0, maxLength));
        currentChunk = line.substring(maxLength);
      }
    }
  }
  
  if (currentChunk) {
    chunks.push(currentChunk);
  }
  
  return chunks;
}

// 스케줄 관리 요청 처리
async function handleScheduleRequest(message, classification, actualContent = null) {
  const { processNaturalSchedule } = require('./utils/scheduleHandler');
  
  // 음성 변환된 텍스트가 있으면 사용, 없으면 원래 메시지 사용
  const contentToProcess = actualContent || message.content;
  
  console.log(`[SCHEDULE DEBUG] 🎯 스케줄 요청 처리 시작`);
  console.log(`[SCHEDULE DEBUG] 👤 사용자: ${message.author.tag}`);
  console.log(`[SCHEDULE DEBUG] 💬 메시지: "${contentToProcess}"`);
  console.log(`[SCHEDULE DEBUG] 🎲 분류 신뢰도: ${classification.confidence}`);
  
  try {
    // 삭제 요청인 경우 사용자 ID 전달
    let result;
    if (classification.scheduleType === 'delete') {
      const { deleteScheduleEvent } = require('./utils/scheduleHandler');
      result = await deleteScheduleEvent(contentToProcess, message.author.id);
    } else {
      result = await processNaturalSchedule(contentToProcess, classification);
    }
    
    console.log(`[SCHEDULE DEBUG] 📤 응답 전송: ${result.success ? '성공' : '실패'}`);
    console.log(`[SCHEDULE DEBUG] 💌 응답 메시지: "${result.message}"`);
    
    // 인터랙티브 UI가 있는 경우
    if (result.isInteractive && result.components) {
      console.log(`[SCHEDULE DEBUG] 🔘 인터랙티브 UI 전송 (버튼 ${result.components.length}개 행)`);
      await message.reply({
        content: result.message,
        components: result.components
      });
      return `스케줄 인터랙티브 응답: ${result.message}`;
    } else {
      // 일반 메시지인 경우
      const messageChunks = splitMessageForMobile(result.message);
      
      for (let i = 0; i < messageChunks.length; i++) {
        if (i === 0) {
          await message.reply(messageChunks[i]);
        } else {
          await message.channel.send(messageChunks[i]);
        }
      }
      
      console.log(`[SCHEDULE DEBUG] ✅ 스케줄 요청 처리 완료 (${messageChunks.length}개 메시지)`);
      return `스케줄 처리 완료: ${result.message}`;
    }
  } catch (error) {
    console.error(`[SCHEDULE DEBUG] ❌ 스케줄 핸들링 오류:`, error);
    await message.reply('일정 처리 중 오류가 발생했습니다. `/myschedule` 명령어를 사용해보세요.');
    return `스케줄 처리 오류: ${error.message}`;
  }
}

// 이미지 생성 요청 처리
async function handleImageRequest(message, classification, actualContent = null) {
  const { processImageGeneration } = require('./utils/imageHandler');
  
  // 음성 변환된 텍스트가 있으면 사용, 없으면 원래 메시지 사용
  const contentToProcess = actualContent || message.content;
  
  console.log(`[IMAGE DEBUG] 🎨 이미지 처리 시작`);
  console.log(`[IMAGE DEBUG] 📝 원본 메시지: "${message.content}"`);
  console.log(`[IMAGE DEBUG] 🎤 음성 변환 텍스트: "${actualContent || 'null'}"`);
  console.log(`[IMAGE DEBUG] ✅ 최종 처리 텍스트: "${contentToProcess}"`);
  console.log(`[IMAGE DEBUG] 🏷️ 분류 결과:`, classification);
  
  try {
    const attachments = Array.from(message.attachments.values());
    const imageAttachments = attachments.filter(att => att.contentType && att.contentType.startsWith('image/'));
    
    console.log(`[IMAGE DEBUG] 📎 전체 첨부파일 수: ${attachments.length}`);
    console.log(`[IMAGE DEBUG] 🖼️ 이미지 첨부파일 수: ${imageAttachments.length}`);
    
    // 메모리에서 이미지 확인
    let imageToUse = null;
    let isFromMemory = false;
    
    if (imageAttachments.length > 0) {
      // 새로운 이미지가 업로드됨
      imageToUse = {
        url: imageAttachments[0].url,
        mimeType: imageAttachments[0].contentType
      };
      
      // 새 이미지를 메모리에 저장
      saveImageToMemory(
        message.author.id, 
        imageAttachments[0].url, 
        imageAttachments[0].contentType, 
        contentToProcess
      );
      
      console.log(`[IMAGE DEBUG] 💾 새 이미지 메모리에 저장됨`);
    } else {
      // 새 이미지가 없으면 메모리에서 확인
      const memoryImage = checkForImageMemory(message.author.id, contentToProcess);
      if (memoryImage) {
        imageToUse = memoryImage;
        isFromMemory = true;
        console.log(`[IMAGE DEBUG] 🧠 메모리에서 이미지 사용: ${memoryImage.url.substring(0, 50)}...`);
      }
    }
    
    if (imageToUse) {
      // 이미지 + 텍스트 처리
      console.log(`[IMAGE DEBUG] 🔄 이미지 ${isFromMemory ? '수정' : '처리'} 모드 시작`);
      console.log(`[IMAGE DEBUG] 📸 이미지 URL: ${imageToUse.url}`);
      console.log(`[IMAGE DEBUG] 🎯 이미지 타입: ${imageToUse.mimeType}`);
      console.log(`[IMAGE DEBUG] 🧠 메모리 사용: ${isFromMemory}`);
      
      // 메모리 사용 시 사용자에게 알림
      if (isFromMemory) {
        await message.reply('🧠 **이전에 업로드한 이미지를 사용합니다!** 새로운 프롬프트로 이미지를 수정하겠습니다.');
      }
      
      const result = await processImageGeneration(
        contentToProcess,
        imageToUse.url,
        imageToUse.mimeType,
        message.author.tag,
        message.author.displayAvatarURL(),
        message,
        message.author.id
      );

      if (result.success) {
        console.log(`[IMAGE DEBUG] ✅ 이미지 수정 성공!`);
        await message.reply({
          embeds: [result.embed],
          files: result.files
        });
        return `이미지 ${isFromMemory ? '수정' : '생성'} 완료`;
      } else {
        console.log(`[IMAGE DEBUG] ❌ 이미지 수정 실패:`, result.textResponse || result.error);
        await message.reply(result.textResponse || "이미지를 생성할 수 없습니다.");
        return `이미지 처리 실패: ${result.textResponse || result.error}`;
      }
      
    } else {
      // 텍스트만으로 이미지 생성
      console.log(`[IMAGE DEBUG] 🆕 이미지 생성 모드 시작`);
      console.log(`[IMAGE DEBUG] 📝 생성 프롬프트: "${contentToProcess}"`);
      
      // 프롬프트 보강 과정에서 피드백 제공
      
      const result = await processImageGeneration(
        contentToProcess,
        null,
        null,
        message.author.tag,
        message.author.displayAvatarURL(),
        message,
        message.author.id
      );

      if (result.success) {
        console.log(`[IMAGE DEBUG] ✅ 이미지 생성 성공!`);
        await message.reply({
          embeds: [result.embed],
          files: result.files
        });
        return '이미지 생성 완료';
      } else {
        console.log(`[IMAGE DEBUG] ❌ 이미지 생성 실패:`, result.textResponse || result.error);
        await message.reply(result.textResponse || '죄송합니다. 이미지를 생성할 수 없습니다. `/image` 명령어를 사용해보세요.');
        return `이미지 생성 실패: ${result.textResponse || result.error}`;
      }
    }
    
  } catch (error) {
    console.error(`[IMAGE DEBUG] 💥 이미지 처리 중 예외 발생:`, error);
    console.error(`[IMAGE DEBUG] 💥 스택 트레이스:`, error.stack);
    await message.reply('이미지 처리 중 오류가 발생했습니다. `/image` 명령어를 사용해보세요.');
    return `이미지 처리 오류: ${error.message}`;
  }
}

// 일반 요청 처리
async function handleGeneralRequest(message, classification) {
  console.log(`[GENERAL DEBUG] 🎯 일반 질문 요청 처리 시작`);
  console.log(`[GENERAL DEBUG] 👤 사용자: ${message.author.tag}`);
  console.log(`[GENERAL DEBUG] 💬 메시지: "${message.content}"`);
  console.log(`[GENERAL DEBUG] 🎲 분류 신뢰도: ${classification.confidence}`);
  
  try {
    console.log(`[GENERAL DEBUG] 📦 generalHandler 모듈 로드 중...`);
    const { processGeneralQuestion } = require('./utils/generalHandler');
    console.log(`[GENERAL DEBUG] ✅ generalHandler 모듈 로드 완료`);
    
    const attachments = Array.from(message.attachments.values());
    console.log(`[GENERAL DEBUG] 📎 첨부파일 수: ${attachments.length}`);
    
    console.log(`[GENERAL DEBUG] 🚀 processGeneralQuestion 호출 중...`);
    const result = await processGeneralQuestion(
      message.content,
      attachments,
      message.author.id
    );
    
    console.log(`[GENERAL DEBUG] 📤 응답 전송: ${result.success ? '성공' : '실패'}`);
    
    if (result.success) {
      // 메시지 청크들을 순차적으로 전송
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

// 버튼 및 모달 인터랙션 핸들러
client.on('interactionCreate', async interaction => {
    if (interaction.isButton()) {
        await handleButtonInteraction(interaction);
    } else if (interaction.isModalSubmit()) {
        await handleModalSubmit(interaction);
    }
});

// 버튼 인터랙션 처리
async function handleButtonInteraction(interaction) {
    const { executeScheduleDelete, cancelScheduleDelete, quickDeleteEvent, createEditModal } = require('./utils/scheduleHandler');
    
    try {
        const customId = interaction.customId;
        console.log(`[BUTTON DEBUG] 🔘 버튼 클릭: ${customId}`);
        
        if (customId.startsWith('delete_')) {
            // 기존 삭제 버튼 (검색 결과에서)
            const parts = customId.split('_');
            if (parts.length >= 3) {
                const sessionId = parts.slice(1, -1).join('_');
                const eventIndex = parseInt(parts[parts.length - 1]);
                
                console.log(`[BUTTON DEBUG] 🗑️ 일정 삭제 실행 - 세션: ${sessionId}, 인덱스: ${eventIndex}`);
                
                await interaction.deferUpdate();
                const result = await executeScheduleDelete(sessionId, eventIndex);
                
                await interaction.editReply({
                    content: result.message,
                    components: []
                });
                
                console.log(`[BUTTON DEBUG] ✅ 삭제 처리 완료: ${result.success ? '성공' : '실패'}`);
            }
        } else if (customId.startsWith('quick_delete_')) {
            // 빠른 삭제 버튼 (일정 목록에서)
            const parts = customId.split('_');
            if (parts.length >= 4) {
                const sessionId = parts.slice(2, -1).join('_');
                const eventIndex = parseInt(parts[parts.length - 1]);
                
                console.log(`[BUTTON DEBUG] 🗑️ 빠른 삭제 - 세션: ${sessionId}, 인덱스: ${eventIndex}`);
                
                await interaction.deferUpdate();
                const result = await quickDeleteEvent(sessionId, eventIndex);
                
                await interaction.editReply({
                    content: result.message,
                    components: []
                });
                
                console.log(`[BUTTON DEBUG] ✅ 빠른 삭제 완료: ${result.success ? '성공' : '실패'}`);
            }
        } else if (customId.startsWith('edit_')) {
            // 수정 버튼
            const parts = customId.split('_');
            if (parts.length >= 3) {
                const sessionId = parts.slice(1, -1).join('_');
                const eventIndex = parseInt(parts[parts.length - 1]);
                
                console.log(`[BUTTON DEBUG] ✏️ 일정 수정 - 세션: ${sessionId}, 인덱스: ${eventIndex}`);
                
                const modalResult = createEditModal(sessionId, eventIndex);
                
                if (modalResult.success) {
                    await interaction.showModal(modalResult.modal);
                    console.log(`[BUTTON DEBUG] ✅ 수정 모달 표시 완료`);
                } else {
                    await interaction.reply({
                        content: modalResult.message,
                        ephemeral: true
                    });
                }
            }
        } else if (customId.startsWith('cancel_')) {
            // 취소 버튼
            const sessionId = customId.replace('cancel_', '');
            
            console.log(`[BUTTON DEBUG] ❌ 삭제 취소 - 세션: ${sessionId}`);
            
            await interaction.deferUpdate();
            const result = cancelScheduleDelete(sessionId);
            
            await interaction.editReply({
                content: result.message,
                components: []
            });
            
            console.log(`[BUTTON DEBUG] ✅ 취소 처리 완료`);
        }
        
    } catch (error) {
        console.error(`[BUTTON DEBUG] ❌ 버튼 인터랙션 오류:`, error);
        
        try {
            if (interaction.deferred || interaction.replied) {
                await interaction.editReply({
                    content: '❌ 처리 중 오류가 발생했습니다.',
                    components: []
                });
            } else {
                await interaction.reply({
                    content: '❌ 처리 중 오류가 발생했습니다.',
                    ephemeral: true
                });
            }
        } catch (replyError) {
            console.error(`[BUTTON DEBUG] ❌ 오류 응답 실패:`, replyError);
        }
    }
}

// 모달 제출 처리
async function handleModalSubmit(interaction) {
    const { executeEventUpdate } = require('./utils/scheduleHandler');
    
    try {
        const customId = interaction.customId;
        console.log(`[MODAL DEBUG] 📝 모달 제출: ${customId}`);
        
        if (customId.startsWith('edit_modal_')) {
            const parts = customId.split('_');
            if (parts.length >= 4) {
                const sessionId = parts.slice(2, -1).join('_');
                const eventIndex = parseInt(parts[parts.length - 1]);
                
                // 폼 데이터 추출
                const formData = {
                    title: interaction.fields.getTextInputValue('title'),
                    date: interaction.fields.getTextInputValue('date'),
                    start_time: interaction.fields.getTextInputValue('start_time'),
                    end_time: interaction.fields.getTextInputValue('end_time'),
                    description: interaction.fields.getTextInputValue('description')
                };
                
                console.log(`[MODAL DEBUG] 💾 일정 수정 데이터:`, formData);
                
                await interaction.deferReply();
                
                const result = await executeEventUpdate(sessionId, eventIndex, formData);
                
                await interaction.editReply({
                    content: result.message
                });
                
                console.log(`[MODAL DEBUG] ✅ 수정 처리 완료: ${result.success ? '성공' : '실패'}`);
            }
        }
        
    } catch (error) {
        console.error(`[MODAL DEBUG] ❌ 모달 처리 오류:`, error);
        
        try {
            if (interaction.deferred || interaction.replied) {
                await interaction.editReply({
                    content: '❌ 처리 중 오류가 발생했습니다.'
                });
            } else {
                await interaction.reply({
                    content: '❌ 처리 중 오류가 발생했습니다.',
                    ephemeral: true
                });
            }
        } catch (replyError) {
            console.error(`[MODAL DEBUG] ❌ 오류 응답 실패:`, replyError);
        }
    }
}

client.login(process.env.DISCORD_TOKEN);