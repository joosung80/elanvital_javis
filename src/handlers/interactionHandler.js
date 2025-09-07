const { executeScheduleDelete, cancelScheduleDelete, quickDeleteEvent, createEditModal, executeEventUpdate } = require('../utils/scheduleHandler');
const { executeTaskComplete } = require('../utils/taskHandler');

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
              await interaction.reply({ content: modalResult.message, ephemeral: true });
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
            await interaction.reply({ content: '❌ 처리 중 오류가 발생했습니다.', ephemeral: true });
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
            await interaction.reply({ content: '❌ 처리 중 오류가 발생했습니다.', ephemeral: true });
        }
    } catch (replyError) {
        console.error(`[MODAL DEBUG] ❌ 오류 응답 실패:`, replyError);
    }
  }
}

module.exports = { handleInteractionCreate };
