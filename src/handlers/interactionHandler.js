const { Events, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
const { handleTaskCompleteButton } = require('../utils/taskHandler');
const { generateImageWithOpenAI } = require('../utils/imageHandler');
const { quickDeleteEvent } = require('../utils/scheduleHandler');
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
            console.log(`[INTERACTION] 👤 사용자: ${interaction.user.id} (${interaction.user.username})`);
            console.log(`[INTERACTION] 📍 채널: ${interaction.channel.id}`);

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
                    // delete_schedule_sessionId_eventIndex 형태 파싱
                    const parts = customId.split('_');
                    if (parts.length >= 4) {
                        const sessionId = parts.slice(2, -1).join('_');
                        const eventIndex = parseInt(parts[parts.length - 1]);
                        
                        console.log(`[INTERACTION] 🗑️ 일정 삭제 확인 - 세션: ${sessionId}, 인덱스: ${eventIndex}`);
                        
                        // 인터랙션 응답 지연 (3초 제한 해결)
                        await interaction.deferUpdate();
                        console.log(`[INTERACTION] ⏳ 인터랙션 응답 지연 처리 완료`);
                        
                        const { executeScheduleDelete } = require('../utils/scheduleHandler');
                        const result = await executeScheduleDelete(sessionId, eventIndex);
                        
                        if (result.success) {
                            if (result.showUpdatedList && result.components) {
                                // 삭제 후 업데이트된 목록과 함께 표시
                                await interaction.editReply({
                                    content: result.message,
                                    components: result.components
                                });
                            } else {
                                // 삭제만 완료된 경우
                                await interaction.editReply({
                                    content: result.message,
                                    components: []
                                });
                            }
                        } else {
                            await interaction.editReply({
                                content: result.message,
                                components: []
                            });
                        }
                    } else {
                        await interaction.reply({ content: '❌ 잘못된 버튼 형식입니다.', ephemeral: true });
                    }
                } else if (customId.startsWith('quick_delete_')) {
                    // quick_delete_sessionId_eventIndex 형태 파싱
                    const parts = customId.split('_');
                    if (parts.length >= 4) {
                        const sessionId = parts.slice(2, -1).join('_'); // sessionId 부분
                        const eventIndex = parseInt(parts[parts.length - 1]); // 마지막 부분이 eventIndex
                        
                        console.log(`[INTERACTION] 🗑️ 빠른 삭제 요청 - 세션: ${sessionId}, 인덱스: ${eventIndex}`);
                        
                        // 인터랙션 응답 지연 (3초 제한 해결)
                        await interaction.deferUpdate();
                        console.log(`[INTERACTION] ⏳ 인터랙션 응답 지연 처리 완료`);
                        
                        const result = await quickDeleteEvent(sessionId, eventIndex);
                        
                        console.log(`[INTERACTION] 🔍 quickDeleteEvent 결과:`, {
                            success: result.success,
                            showUpdatedList: result.showUpdatedList,
                            hasComponents: !!result.components,
                            hasMessage: !!result.message,
                            componentsLength: result.components ? result.components.length : 0
                        });
                        
                        if (result.success) {
                            if (result.showUpdatedList && result.components) {
                                // 삭제 후 업데이트된 목록과 함께 표시
                                console.log(`[INTERACTION] 📝 메시지 업데이트 (목록 포함)`);
                                await interaction.editReply({
                                    content: result.message,
                                    components: result.components
                                });
                            } else {
                                // 삭제만 완료된 경우 (더 이상 일정이 없음)
                                console.log(`[INTERACTION] 📝 메시지 업데이트 (목록 없음)`);
                                await interaction.editReply({
                                    content: result.message,
                                    components: []
                                });
                            }
                        } else {
                            console.log(`[INTERACTION] ❌ 삭제 실패`);
                            await interaction.editReply({
                                content: result.message,
                                components: []
                            });
                        }
                    } else {
                        await interaction.reply({ content: '❌ 잘못된 버튼 형식입니다.', ephemeral: true });
                    }
                } else if (customId.startsWith('edit_')) {
                    // edit_sessionId_eventIndex 형태 파싱
                    const parts = customId.split('_');
                    if (parts.length >= 3) {
                        const sessionId = parts.slice(1, -1).join('_'); // sessionId 부분
                        const eventIndex = parseInt(parts[parts.length - 1]); // 마지막 부분이 eventIndex
                        
                        console.log(`[INTERACTION] ✏️ 일정 수정 요청 - 세션: ${sessionId}, 인덱스: ${eventIndex}`);
                        
                        const { createEditModal } = require('../utils/scheduleHandler');
                        const modalResult = createEditModal(sessionId, eventIndex);
                        
                        if (modalResult.success) {
                            console.log(`[INTERACTION] 📝 수정 모달 표시 중...`);
                            await interaction.showModal(modalResult.modal);
                        } else {
                            console.log(`[INTERACTION] ❌ 모달 생성 실패: ${modalResult.message}`);
                            await interaction.reply({ content: modalResult.message, ephemeral: true });
                        }
                    } else {
                        console.log(`[INTERACTION] ❌ 잘못된 edit 버튼 형식: ${customId}`);
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
            } else if (interaction.customId.startsWith('edit_modal_')) {
                // edit_modal_sessionId_eventIndex 형태 파싱
                const parts = interaction.customId.split('_');
                if (parts.length >= 4) {
                    const sessionId = parts.slice(2, -1).join('_'); // sessionId 부분
                    const eventIndex = parseInt(parts[parts.length - 1]); // 마지막 부분이 eventIndex
                    
                    console.log(`[INTERACTION] 💾 일정 수정 모달 제출 - 세션: ${sessionId}, 인덱스: ${eventIndex}`);
                    
                    // 모달에서 입력된 데이터 추출
                    const formData = {
                        title: interaction.fields.getTextInputValue('title'),
                        date: interaction.fields.getTextInputValue('date'),
                        start_time: interaction.fields.getTextInputValue('start_time'),
                        end_time: interaction.fields.getTextInputValue('end_time'),
                        description: interaction.fields.getTextInputValue('description')
                    };
                    
                    console.log(`[INTERACTION] 📝 입력된 데이터:`, formData);
                    
                    // 응답 지연 처리
                    await interaction.deferReply({ ephemeral: true });
                    
                    const { executeEventUpdate } = require('../utils/scheduleHandler');
                    const result = await executeEventUpdate(sessionId, eventIndex, formData);
                    
                    if (result.success) {
                        console.log(`[INTERACTION] ✅ 일정 수정 완료`);
                        await interaction.editReply(result.message);
                    } else {
                        console.log(`[INTERACTION] ❌ 일정 수정 실패: ${result.message}`);
                        await interaction.editReply(result.message);
                    }
                } else {
                    console.log(`[INTERACTION] ❌ 잘못된 모달 형식: ${interaction.customId}`);
                    await interaction.reply({ content: '❌ 잘못된 모달 형식입니다.', ephemeral: true });
                }
            }
        }
    },
};
