const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { 
  getMemoryStats, 
  getCurrentContext, 
  getRecentConversations,
  getLastImage,
  clearUserMemory
} = require('../utils/memoryHandler');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('memory')
    .setDescription('메모리 관련 명령어')
    .addSubcommand(subcommand =>
      subcommand
        .setName('stats')
        .setDescription('메모리 통계 정보 확인')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('context')
        .setDescription('현재 컨텍스트 정보 확인')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('history')
        .setDescription('최근 대화 기록 확인')
        .addIntegerOption(option =>
          option
            .setName('limit')
            .setDescription('확인할 대화 수 (기본값: 5)')
            .setMinValue(1)
            .setMaxValue(20)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('image')
        .setDescription('저장된 이미지 정보 확인')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('clear')
        .setDescription('메모리 완전 정리 (모든 데이터 삭제)')
    ),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    const userId = interaction.user.id;

    try {
      switch (subcommand) {
        case 'stats':
          await handleStatsCommand(interaction);
          break;
        case 'context':
          await handleContextCommand(interaction, userId);
          break;
        case 'history':
          const limit = interaction.options.getInteger('limit') || 5;
          await handleHistoryCommand(interaction, userId, limit);
          break;
        case 'image':
          await handleImageCommand(interaction, userId);
          break;
        case 'clear':
          await handleClearCommand(interaction, userId);
          break;
        default:
          await interaction.reply('알 수 없는 하위 명령어입니다.');
      }
    } catch (error) {
      console.error('Memory command error:', error);
      await interaction.reply('메모리 명령어 처리 중 오류가 발생했습니다.');
    }
  },
};

async function handleStatsCommand(interaction) {
  const stats = getMemoryStats();
  
  const embed = new EmbedBuilder()
    .setTitle('🧠 메모리 시스템 통계')
    .setColor(0x0099FF)
    .addFields(
      { name: '👥 총 사용자 수', value: stats.totalUsers.toString(), inline: true },
      { name: '🖼️ 저장된 이미지 수', value: stats.totalImages.toString(), inline: true },
      { name: '💬 저장된 대화 수', value: stats.totalConversations.toString(), inline: true }
    )
    .setTimestamp()
    .setFooter({ text: '메모리는 24시간 후 자동 삭제됩니다' });

  await interaction.reply({ embeds: [embed] });
}

async function handleClearCommand(interaction, userId) {
  const result = clearUserMemory(userId);
  
  if (result.success) {
    const embed = new EmbedBuilder()
      .setTitle('🧠 메모리 정리 완료!')
      .setColor(0x00FF00)
      .addFields(
        { name: '📸 삭제된 이미지', value: result.clearedData.images.toString(), inline: true },
        { name: '💬 삭제된 대화', value: result.clearedData.conversations.toString(), inline: true },
        { name: '🆕 상태', value: '모든 메모리가 초기화되었습니다', inline: false }
      )
      .setTimestamp()
      .setFooter({ text: '새로운 시작입니다!' });

    await interaction.reply({ embeds: [embed] });
  } else {
    await interaction.reply(`🤔 **메모리 정리 결과**\n\n${result.message}`);
  }
}

async function handleContextCommand(interaction, userId) {
  const context = getCurrentContext(userId);
  
  const embed = new EmbedBuilder()
    .setTitle('🎯 현재 컨텍스트')
    .setColor(0x00FF99)
    .addFields(
      { 
        name: '🖼️ 마지막 이미지', 
        value: context.lastImageUrl ? 
          `[이미지 링크](${context.lastImageUrl.substring(0, 50)}...)` : 
          '없음', 
        inline: false 
      },
      { 
        name: '🎭 MIME 타입', 
        value: context.lastImageMimeType || '없음', 
        inline: true 
      },
      { 
        name: '📝 마지막 주제', 
        value: context.lastTopic || '없음', 
        inline: true 
      },
      { 
        name: '🔄 세션 타입', 
        value: context.sessionType || '없음', 
        inline: true 
      }
    )
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}

async function handleClearCommand(interaction, userId) {
  const result = clearUserMemory(userId);
  
  if (result.success) {
    const embed = new EmbedBuilder()
      .setTitle('🧠 메모리 정리 완료!')
      .setColor(0x00FF00)
      .addFields(
        { name: '📸 삭제된 이미지', value: result.clearedData.images.toString(), inline: true },
        { name: '💬 삭제된 대화', value: result.clearedData.conversations.toString(), inline: true },
        { name: '🆕 상태', value: '모든 메모리가 초기화되었습니다', inline: false }
      )
      .setTimestamp()
      .setFooter({ text: '새로운 시작입니다!' });

    await interaction.reply({ embeds: [embed] });
  } else {
    await interaction.reply(`🤔 **메모리 정리 결과**\n\n${result.message}`);
  }
}

async function handleHistoryCommand(interaction, userId, limit) {
  const conversations = getRecentConversations(userId, limit);
  
  if (conversations.length === 0) {
    await interaction.reply('저장된 대화 기록이 없습니다.');
    return;
  }

  const embed = new EmbedBuilder()
    .setTitle(`📜 최근 대화 기록 (${conversations.length}개)`)
    .setColor(0xFF9900)
    .setTimestamp();

  conversations.forEach((conv, index) => {
    const timeStr = conv.timestamp.toLocaleString('ko-KR');
    embed.addFields({
      name: `${index + 1}. ${conv.category} (${timeStr})`,
      value: `**사용자:** ${conv.userMessage.substring(0, 100)}${conv.userMessage.length > 100 ? '...' : ''}\n**봇:** ${conv.botResponse.substring(0, 100)}${conv.botResponse.length > 100 ? '...' : ''}`,
      inline: false
    });
  });

  await interaction.reply({ embeds: [embed] });
}

async function handleClearCommand(interaction, userId) {
  const result = clearUserMemory(userId);
  
  if (result.success) {
    const embed = new EmbedBuilder()
      .setTitle('🧠 메모리 정리 완료!')
      .setColor(0x00FF00)
      .addFields(
        { name: '📸 삭제된 이미지', value: result.clearedData.images.toString(), inline: true },
        { name: '💬 삭제된 대화', value: result.clearedData.conversations.toString(), inline: true },
        { name: '🆕 상태', value: '모든 메모리가 초기화되었습니다', inline: false }
      )
      .setTimestamp()
      .setFooter({ text: '새로운 시작입니다!' });

    await interaction.reply({ embeds: [embed] });
  } else {
    await interaction.reply(`🤔 **메모리 정리 결과**\n\n${result.message}`);
  }
}

async function handleImageCommand(interaction, userId) {
  const lastImage = getLastImage(userId);
  
  if (!lastImage) {
    await interaction.reply('저장된 이미지가 없습니다.');
    return;
  }

  const embed = new EmbedBuilder()
    .setTitle('🖼️ 저장된 이미지 정보')
    .setColor(0xFF0099)
    .addFields(
      { name: '📅 업로드 시간', value: lastImage.uploadTime.toLocaleString('ko-KR'), inline: true },
      { name: '🎭 MIME 타입', value: lastImage.mimeType, inline: true },
      { name: '📝 설명', value: lastImage.description || '없음', inline: false }
    )
    .setImage(lastImage.url)
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}

async function handleClearCommand(interaction, userId) {
  const result = clearUserMemory(userId);
  
  if (result.success) {
    const embed = new EmbedBuilder()
      .setTitle('🧠 메모리 정리 완료!')
      .setColor(0x00FF00)
      .addFields(
        { name: '📸 삭제된 이미지', value: result.clearedData.images.toString(), inline: true },
        { name: '💬 삭제된 대화', value: result.clearedData.conversations.toString(), inline: true },
        { name: '🆕 상태', value: '모든 메모리가 초기화되었습니다', inline: false }
      )
      .setTimestamp()
      .setFooter({ text: '새로운 시작입니다!' });

    await interaction.reply({ embeds: [embed] });
  } else {
    await interaction.reply(`🤔 **메모리 정리 결과**\n\n${result.message}`);
  }
}
