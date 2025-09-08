const { Events, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
const { handleTaskButton } = require('../utils/taskHandler');
const { handleDeleteConfirmation } = require('../utils/scheduleHandler');
const { handleDriveReadButton } = require('../utils/driveHandler');
const { handleSummarizeButton, handleSearchInDocument } = require('../utils/documentHandler');

module.exports = {
    name: Events.InteractionCreate,
    async execute(interaction) {
        const { client } = interaction;

        if (interaction.isButton()) {
            const customId = interaction.customId;
            console.log(`[INTERACTION] 🔘 버튼 클릭: ${customId}`);

            try {
                if (customId.startsWith('select_task_')) {
                    await handleTaskButton(interaction, client.taskSessions);
                } else if (customId.startsWith('delete_schedule_')) {
                    await handleDeleteConfirmation(interaction, client.scheduleSessions);
                } else if (customId.startsWith('read_drive_')) {
                    await handleDriveReadButton(interaction, client.driveSearchSessions);
                } else if (customId === 'summarize_document') {
                    await handleSummarizeButton(interaction);
                } else if (customId === 'search_in_document') {
                    console.log(`[INTERACTION] 🕵️ User ${interaction.user.id} clicked 'search_in_document' button.`);
                    const userMemory = client.memory.getUserMemory(interaction.user.id);
                    
                    if (!userMemory.lastDocument) {
                        console.error(`[INTERACTION_ERROR] 🚫 No lastDocument found for user ${interaction.user.id}.`);
                        await interaction.reply({ content: '오류: 검색할 문서의 정보가 없습니다. 문서를 다시 읽어주세요.', ephemeral: true });
                        return;
                    }
                    
                    console.log(`[INTERACTION] ✅ Found lastDocument for user ${interaction.user.id}. Title: ${userMemory.lastDocument.title}`);

                    const modal = new ModalBuilder()
                        .setCustomId('modal_search_in_document')
                        .setTitle('문서 내 키워드 검색');

                    const keywordInput = new TextInputBuilder()
                        .setCustomId('keywordInput')
                        .setLabel("검색할 키워드를 입력하세요.")
                        .setStyle(TextInputStyle.Short)
                        .setRequired(true);

                    const firstActionRow = new ActionRowBuilder().addComponents(keywordInput);
                    modal.addComponents(firstActionRow);

                    await interaction.showModal(modal);
                }
            } catch (error) {
                console.error('인터랙션 핸들러 오류:', error);
                try {
                    await interaction.reply({ content: '버튼 처리 중 오류가 발생했습니다.', ephemeral: true });
                } catch (e) {
                    console.error('오류 응답 전송 실패:', e);
                }
            }
        }

        if (interaction.isModalSubmit()) {
            if (interaction.customId === 'modal_search_in_document') {
                await interaction.deferReply({ ephemeral: true });
                const keyword = interaction.fields.getTextInputValue('keywordInput');
                const userMemory = client.memory.getUserMemory(interaction.user.id);
                const lastDocument = userMemory.lastDocument;

                if (!lastDocument || !lastDocument.content) {
                    await interaction.editReply('검색할 문서가 없습니다. 먼저 문서를 읽어주세요.');
                    return;
                }

                await handleSearchInDocument(interaction, lastDocument, keyword);
            }
        }
    },
};
