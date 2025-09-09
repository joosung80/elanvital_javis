const { Events, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
const { handleTaskCompleteButton } = require('../utils/taskHandler');
const { generateImageWithOpenAI } = require('../utils/imageHandler');
const { handleDeleteConfirmation, quickDeleteEvent } = require('../utils/scheduleHandler');
const { handleDriveReadButton } = require('../utils/driveHandler');
const { handleSummarizeButton, handleSearchInDocument } = require('../utils/documentHandler');

module.exports = {
    name: Events.InteractionCreate,
    async execute(interaction) {
        const { client } = interaction;

        // Slash Command 처리
        if (interaction.isChatInputCommand()) {
            const command = client.commands.get(interaction.commandName);

            if (!command) {
                console.error(`❌ 알 수 없는 명령어: ${interaction.commandName}`);
                return;
            }

            try {
                console.log(`💬 Slash Command 실행: /${interaction.commandName}`);
                await command.execute(interaction);
            } catch (error) {
                console.error(`❌ Slash Command 실행 오류:`, error);
                const errorMessage = '명령어 실행 중 오류가 발생했습니다.';
                
                if (interaction.replied || interaction.deferred) {
                    await interaction.followUp({ content: errorMessage, ephemeral: true });
                } else {
                    await interaction.reply({ content: errorMessage, ephemeral: true });
                }
            }
        }

        if (interaction.isButton()) {
            const customId = interaction.customId;
            console.log(`[INTERACTION] 🔘 버튼 클릭: ${customId}`);

            try {
                if (customId.startsWith('complete_task_')) {
                    await handleTaskCompleteButton(interaction);
                } else if (customId.startsWith('openai_image_')) {
                    // OpenAI DALL-E 이미지 생성 버튼 처리
                    const parts = customId.split('_');
                    if (parts.length >= 4) {
                        const encodedPrompt = parts.slice(3).join('_');
                        try {
                            const prompt = Buffer.from(encodedPrompt, 'base64').toString('utf-8');
                            
                            await interaction.reply({ content: '🎨 OpenAI DALL-E로 이미지를 생성하고 있습니다...', ephemeral: true });
                            
                            // 원본 메시지를 가져와서 generateImageWithOpenAI 호출
                            const originalMessage = interaction.message;
                            const mockMessage = {
                                author: interaction.user,
                                channel: interaction.channel,
                                client: interaction.client
                            };
                            
                            await generateImageWithOpenAI(prompt, mockMessage);
                            
                            await interaction.followUp({ content: '✅ OpenAI DALL-E 이미지 생성이 완료되었습니다!', ephemeral: true });
                        } catch (decodeError) {
                            console.error('프롬프트 디코딩 실패:', decodeError);
                            await interaction.reply({ content: '❌ 프롬프트 처리 중 오류가 발생했습니다.', ephemeral: true });
                        }
                    } else {
                        await interaction.reply({ content: '❌ 잘못된 버튼 형식입니다.', ephemeral: true });
                    }
                } else if (customId.startsWith('select_task_')) {
                    // 기존 select_task_ 처리 (필요시 유지)
                    console.log('Legacy select_task_ button clicked');
                } else if (customId.startsWith('delete_schedule_')) {
                    await handleDeleteConfirmation(interaction, client.scheduleSessions);
                } else if (customId.startsWith('quick_delete_')) {
                    // quick_delete_sessionId_eventIndex 형태 파싱
                    const parts = customId.split('_');
                    if (parts.length >= 4) {
                        const sessionId = parts.slice(2, -1).join('_'); // sessionId 부분
                        const eventIndex = parseInt(parts[parts.length - 1]); // 마지막 부분이 eventIndex
                        
                        console.log(`[INTERACTION] 🗑️ 빠른 삭제 요청 - 세션: ${sessionId}, 인덱스: ${eventIndex}`);
                        
                        const result = await quickDeleteEvent(sessionId, eventIndex);
                        if (result.success) {
                            await interaction.reply({ content: result.message, ephemeral: true });
                        } else {
                            await interaction.reply({ content: result.message, ephemeral: true });
                        }
                    } else {
                        await interaction.reply({ content: '❌ 잘못된 버튼 형식입니다.', ephemeral: true });
                    }
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
