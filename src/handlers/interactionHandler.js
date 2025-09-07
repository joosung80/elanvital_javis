const { executeScheduleDelete, cancelScheduleDelete, quickDeleteEvent, createEditModal, executeEventUpdate } = require('../utils/scheduleHandler');
const { executeTaskComplete } = require('../utils/taskHandler');
const { readGoogleDocsAsMarkdown } = require('../utils/docsHandler');
const { saveDocumentsToMemory, getUserMemory } = require('../utils/memoryHandler');
const { docsSearchSessions } = require('./messageHandler');
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const { getOpenAIClient } = require('../utils/openaiClient');

async function handleInteractionCreate(interaction) {
  if (interaction.isButton()) {
    await handleButtonInteraction(interaction);
  } else if (interaction.isModalSubmit()) {
    await handleModalSubmit(interaction);
  }
}


async function handleButtonInteraction(interaction) {
  try {
    const customId = interaction.customId;
    console.log(`[BUTTON DEBUG] 🔘 버튼 클릭: ${customId}`);
    
    if (customId.startsWith('complete_task_')) {
      const parts = customId.split('_');
      if (parts.length >= 4) {
          const sessionId = parts.slice(2, -1).join('_');
          const taskIndex = parseInt(parts[parts.length - 1]);
          await interaction.deferUpdate();
          const result = await executeTaskComplete(sessionId, taskIndex);
          await interaction.editReply({ content: result.message, components: [] });
      }
    } else if (customId.startsWith('select_doc_')) {
      await handleDocumentSelection(interaction);
    } else if (customId.startsWith('summarize_document_')) {
      await handleDocumentQueryButton(interaction, 'summarize');
    } else if (customId.startsWith('key_points_document_')) {
      await handleDocumentQueryButton(interaction, 'key_points');
    } else if (customId.startsWith('delete_')) {
      const parts = customId.split('_');
      if (parts.length >= 3) {
          const sessionId = parts.slice(1, -1).join('_');
          const eventIndex = parseInt(parts[parts.length - 1]);
          await interaction.deferUpdate();
          const result = await executeScheduleDelete(sessionId, eventIndex);
          await interaction.editReply({ content: result.message, components: [] });
      }
    } else if (customId.startsWith('quick_delete_')) {
      const parts = customId.split('_');
      if (parts.length >= 4) {
          const sessionId = parts.slice(2, -1).join('_');
          const eventIndex = parseInt(parts[parts.length - 1]);
          await interaction.deferUpdate();
          const result = await quickDeleteEvent(sessionId, eventIndex);
          await interaction.editReply({ content: result.message, components: [] });
      }
    } else if (customId.startsWith('edit_')) {
      const parts = customId.split('_');
      if (parts.length >= 3) {
          const sessionId = parts.slice(1, -1).join('_');
          const eventIndex = parseInt(parts[parts.length - 1]);
          const modalResult = createEditModal(sessionId, eventIndex);
          if (modalResult.success) {
              await interaction.showModal(modalResult.modal);
          } else {
              await interaction.reply({ content: modalResult.message, flags: [MessageFlags.Ephemeral] });
          }
      }
    } else if (customId.startsWith('cancel_')) {
      const sessionId = customId.replace('cancel_', '');
      await interaction.deferUpdate();
      const result = cancelScheduleDelete(sessionId);
      await interaction.editReply({ content: result.message, components: [] });
    }
  } catch (error) {
    console.error(`[BUTTON DEBUG] ❌ 버튼 인터랙션 오류:`, error);
    try {
        if (interaction.deferred || interaction.replied) {
            await interaction.editReply({ content: '❌ 처리 중 오류가 발생했습니다.', components: [] });
        } else {
            await interaction.reply({ content: '❌ 처리 중 오류가 발생했습니다.', flags: [MessageFlags.Ephemeral] });
        }
    } catch (replyError) {
        console.error(`[BUTTON DEBUG] ❌ 오류 응답 실패:`, replyError);
    }
  }
}

async function handleModalSubmit(interaction) {
  try {
    const customId = interaction.customId;
    if (customId.startsWith('edit_modal_')) {
        const parts = customId.split('_');
        if (parts.length >= 4) {
            const sessionId = parts.slice(2, -1).join('_');
            const eventIndex = parseInt(parts[parts.length - 1]);
            const formData = {
                title: interaction.fields.getTextInputValue('title'),
                date: interaction.fields.getTextInputValue('date'),
                start_time: interaction.fields.getTextInputValue('start_time'),
                end_time: interaction.fields.getTextInputValue('end_time'),
                description: interaction.fields.getTextInputValue('description')
            };
            await interaction.deferReply();
            const result = await executeEventUpdate(sessionId, eventIndex, formData);
            await interaction.editReply({ content: result.message });
        }
    }
  } catch (error) {
    console.error(`[MODAL DEBUG] ❌ 모달 처리 오류:`, error);
    try {
        if (interaction.deferred || interaction.replied) {
            await interaction.editReply({ content: '❌ 처리 중 오류가 발생했습니다.' });
        } else {
            await interaction.reply({ content: '❌ 처리 중 오류가 발생했습니다.', flags: [MessageFlags.Ephemeral] });
        }
    } catch (replyError) {
        console.error(`[MODAL DEBUG] ❌ 오류 응답 실패:`, replyError);
    }
  }
}


/**
 * 문서 선택 버튼 클릭을 처리합니다.
 * @param {Object} interaction - Discord 인터랙션 객체
 */
async function handleDocumentSelection(interaction) {
  try {
    const customId = interaction.customId;
    console.log(`[DOC SELECTION] 🔘 문서 선택 버튼 클릭: ${customId}`);
    
    // 정규 표현식을 사용하여 sessionId와 docIndex를 안정적으로 추출
    const match = customId.match(/^select_doc_(.+)_(\d+)$/);
    if (!match) {
      await interaction.reply({ content: '❌ 잘못된 문서 선택 요청입니다.', flags: [MessageFlags.Ephemeral] });
      return;
    }
    
    const sessionId = match[1];
    const docIndex = parseInt(match[2]);
    
    console.log(`[DOC SELECTION] 📋 세션 ID: ${sessionId}, 문서 인덱스: ${docIndex}`);
    
    // 세션에서 문서 정보 가져오기
    const session = docsSearchSessions.get(sessionId);
    if (!session) {
      await interaction.reply({ content: '❌ 세션이 만료되었습니다. 다시 검색해주세요.', flags: [MessageFlags.Ephemeral] });
      return;
    }
    
    // 사용자 권한 확인
    if (session.userId !== interaction.user.id) {
      await interaction.reply({ content: '❌ 다른 사용자의 검색 결과입니다.', flags: [MessageFlags.Ephemeral] });
      return;
    }
    
    // 문서 인덱스 유효성 확인
    if (docIndex < 0 || docIndex >= session.docs.length) {
      await interaction.reply({ content: '❌ 잘못된 문서 번호입니다.', flags: [MessageFlags.Ephemeral] });
      return;
    }
    
    const doc = session.docs[docIndex];
    
    // 문서 읽기 시작 알림
    await interaction.deferReply();
    await interaction.editReply(`📖 **문서 읽기 시작**\n\n📝 **문서명:** ${doc.title}\n\n⏳ 문서를 읽고 분석 중...`);
    
    try {
      // Google Docs 문서 읽기 및 Markdown 변환
      const documentData = await readGoogleDocsAsMarkdown(doc.id);
      
      // 메모리에 문서 저장
      await saveDocumentsToMemory(interaction.user.id, {
        title: documentData.title,
        content: documentData.content,
        source: 'Google Docs',
        url: documentData.webViewLink
      });
      
      // 성공 메시지 생성
      let successMessage = `✅ **문서 읽기 완료!**\n\n`;
      successMessage += `📝 **문서명:** ${documentData.title}\n`;
      successMessage += `📊 **통계:**\n`;
      successMessage += `   • 단어 수: ${documentData.wordCount.toLocaleString()}개\n`;
      successMessage += `   • 문자 수: ${documentData.charCount.toLocaleString()}자\n\n`;
      successMessage += `🔗 **문서 링크:** [Google Docs에서 열기](${documentData.webViewLink})\n\n`;
      successMessage += `💾 **컨텍스트 저장 완료!**\n`;
      successMessage += `이제 이 문서에 대해 질문하거나 요약을 요청할 수 있습니다.\n\n`;
      successMessage += `**📖 문서 미리보기:**\n`;
      
      // 문서 내용 미리보기 (처음 250자)
      const preview = documentData.content.length > 250 
        ? documentData.content.substring(0, 250) + '...' 
        : documentData.content;
      
      successMessage += `\`\`\`markdown\n${preview}\n\`\`\`\n\n`;
      
      const buttons = new ActionRowBuilder()
          .addComponents(
              new ButtonBuilder()
                  .setCustomId(`summarize_document_${interaction.user.id}`)
                  .setLabel('이 문서의 주요 내용을 요약해줘')
                  .setStyle(ButtonStyle.Success),
              new ButtonBuilder()
                  .setCustomId(`key_points_document_${interaction.user.id}`)
                  .setLabel('문서에서 중요한 포인트 뭐야?')
                  .setStyle(ButtonStyle.Success)
          );

      await interaction.editReply({ content: successMessage, components: [buttons] });
      
      // 성공 로그
      console.log(`[DOC SELECTION] ✅ 문서 읽기 성공: ${documentData.title} (${documentData.wordCount}단어)`);
      
    } catch (readError) {
      console.error(`[DOC SELECTION] ❌ 문서 읽기 오류:`, readError);
      
      let errorMessage = `❌ **문서 읽기 실패**\n\n`;
      
      if (readError.message.includes('권한')) {
        errorMessage += `문서에 대한 접근 권한이 없습니다.\n\n`;
        errorMessage += `💡 **해결 방법:**\n`;
        errorMessage += `• 문서 소유자에게 공유 권한을 요청해주세요\n`;
        errorMessage += `• 문서가 "링크가 있는 모든 사용자"로 공유되어 있는지 확인해주세요\n\n`;
        errorMessage += `🔗 **문서 링크:** [Google Docs에서 열기](${doc.webViewLink})`;
      } else if (readError.message.includes('찾을 수 없음')) {
        errorMessage += `문서를 찾을 수 없습니다.\n\n`;
        errorMessage += `💡 문서가 삭제되었거나 이동되었을 수 있습니다.`;
      } else {
        errorMessage += `${readError.message}\n\n`;
        errorMessage += `💡 잠시 후 다시 시도해주세요.\n\n`;
        errorMessage += `🔗 **문서 링크:** [Google Docs에서 열기](${doc.webViewLink})`;
      }
      
      await interaction.editReply(errorMessage);
    }
    
  } catch (error) {
    console.error(`[DOC SELECTION] ❌ 처리 오류:`, error);
    
    try {
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply('❌ 문서 선택 처리 중 오류가 발생했습니다.');
      } else {
        await interaction.reply({ content: '❌ 문서 선택 처리 중 오류가 발생했습니다.', flags: [MessageFlags.Ephemeral] });
      }
    } catch (replyError) {
      console.error(`[DOC SELECTION] ❌ 오류 응답 실패:`, replyError);
    }
  }
}

async function handleDocumentQueryButton(interaction, queryType) {
    try {
        const componentLabel = interaction.component.label;
        
        // 1. 버튼 비활성화를 위해 원래 메시지에서 컴포넌트(버튼)를 제거합니다.
        await interaction.update({ components: [] });

        // 2. 사용자가 질문한 것처럼 보이도록 채널에 메시지를 보냅니다.
        await interaction.channel.send(`> **${interaction.user.username}:** ${componentLabel}`);

        // 3. "처리 중" 메시지를 보내고, 나중에 이 메시지를 결과로 수정합니다.
        const thinkingMessage = await interaction.channel.send(`⏳ '${componentLabel}' 요청을 처리하는 중입니다...`);
        
        const userId = interaction.user.id;
        const memory = getUserMemory(userId);

        if (!memory.lastDocuments || memory.lastDocuments.length === 0) {
            await thinkingMessage.edit('❌ 컨텍스트에 문서가 없습니다. 다시 문서를 읽어주세요.');
            return;
        }

        const lastDocument = memory.lastDocuments[0];

        let systemPrompt = '';
        let resultTitle = '';

        if (queryType === 'summarize') {
            systemPrompt = "You are a helpful assistant who summarizes documents. Summarize the following document content concisely, in Korean, focusing on the key points.";
            resultTitle = '주요 내용 요약';
        } else if (queryType === 'key_points') {
            systemPrompt = "You are a helpful assistant who extracts key points from documents. From the following document, extract the most important key points and list them in Korean using bullet points.";
            resultTitle = '중요한 포인트';
        } else {
            await thinkingMessage.edit('❌ 잘못된 요청 타입입니다.');
            return;
        }

        const openai = getOpenAIClient();
        const response = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: `Please process the following document:\n\nTitle: ${lastDocument.title}\n\nContent:\n${lastDocument.content}` }
            ],
            temperature: 0.5,
        });

        const resultText = response.choices[0].message.content;
        const replyMessage = `📝 **'${lastDocument.title}' 문서 - ${resultTitle}**\n\n${resultText}`;
        await thinkingMessage.edit(replyMessage);

    } catch (error) {
        console.error(`[DOC QUERY] ❌ 문서 처리 중 오류 발생:`, error);
        try {
            await interaction.followUp({ content: '❌ 요청을 처리하는 중 오류가 발생했습니다.', ephemeral: true });
        } catch (replyError) {
            console.error(`[DOC QUERY] ❌ 오류 응답 실패:`, replyError);
        }
    }
}

module.exports = { handleInteractionCreate };
