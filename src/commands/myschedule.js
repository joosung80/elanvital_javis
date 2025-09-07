const { SlashCommandBuilder } = require('discord.js');
const { getScheduleSummary, addScheduleEvent, deleteScheduleEvent } = require('../utils/scheduleHandler');

// 모바일 친화적인 메시지 분할 함수
function splitMessageForMobile(text, maxLength = 1800) {
  if (text.length <= maxLength) return [text];
  
  const chunks = [];
  let currentChunk = '';
  const lines = text.split('\n');
  
  for (const line of lines) {
    const testChunk = currentChunk + (currentChunk ? '\n' : '') + line;
    
    if (testChunk.length <= maxLength) {
      currentChunk = testChunk;
    } else {
      if (currentChunk) {
        chunks.push(currentChunk);
        currentChunk = line;
      } else {
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


module.exports = {
    data: new SlashCommandBuilder()
        .setName('myschedule')
        .setDescription('Google Calendar와 연동하여 일정을 관리합니다.')
        .addSubcommand(subcommand =>
            subcommand
                .setName('summary')
                .setDescription('일정을 요약합니다.')
                .addStringOption(option =>
                    option.setName('period')
                        .setDescription('조회할 기간 (예: 오늘, 내일, 이번주, 다음주, 지난주, 이번달, 다음달)')
                        .setRequired(false)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('add')
                .setDescription('새로운 일정을 추가합니다.')
                .addStringOption(option =>
                    option.setName('input')
                        .setDescription('예: 내일 오후 3시에 팀 회의')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('delete')
                .setDescription('기존 일정을 삭제합니다.')
                .addStringOption(option =>
                    option.setName('input')
                        .setDescription('예: 오늘 회의 취소해줘, 내일 저녁식사 삭제')
                        .setRequired(true))),
    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();
        await interaction.deferReply();

        try {
            switch (subcommand) {
                case 'summary': {
                    const period = interaction.options.getString('period') || '오늘';
                    const result = await getScheduleSummary(period);
                    
                    // 모바일 친화적으로 메시지 분할
                    const messageChunks = splitMessageForMobile(result.message);
                    
                    // 첫 번째 메시지는 editReply로
                    await interaction.editReply(messageChunks[0]);
                    
                    // 나머지 메시지들은 followUp으로
                    for (let i = 1; i < messageChunks.length; i++) {
                        await interaction.followUp(messageChunks[i]);
                    }
                    break;
                }
                case 'add': {
                    const input = interaction.options.getString('input');
                    const result = await addScheduleEvent(input);
                    
                    // 모바일 친화적으로 메시지 분할
                    const messageChunks = splitMessageForMobile(result.message);
                    
                    await interaction.editReply(messageChunks[0]);
                    
                    for (let i = 1; i < messageChunks.length; i++) {
                        await interaction.followUp(messageChunks[i]);
                    }
                    break;
                }
                case 'delete': {
                    const input = interaction.options.getString('input');
                    const userId = interaction.user.id;
                    const result = await deleteScheduleEvent(input, userId);
                    
                    // 인터랙티브 UI가 있는 경우
                    if (result.isInteractive && result.components) {
                        await interaction.editReply({
                            content: result.message,
                            components: result.components
                        });
                    } else {
                        // 일반 메시지인 경우
                        const messageChunks = splitMessageForMobile(result.message);
                        
                        await interaction.editReply(messageChunks[0]);
                        
                        for (let i = 1; i < messageChunks.length; i++) {
                            await interaction.followUp(messageChunks[i]);
                        }
                    }
                    break;
                }
            }
        } catch (error) {
            console.error(error);
            await interaction.editReply({ content: '캘린더 처리 중 오류가 발생했습니다.', ephemeral: true });
        }
    },
};
