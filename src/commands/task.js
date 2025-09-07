const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { addTask, addMultipleTasks, listTasks, cacheTasksForCompletion, searchAndCacheTasks, parseMultipleTasks } = require('../utils/taskHandler');

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
    .setName('task')
    .setDescription('Google Tasks 할 일 관리')
    .addSubcommand(subcommand =>
      subcommand
        .setName('add')
        .setDescription('새로운 할 일을 추가합니다')
        .addStringOption(option =>
          option.setName('title')
            .setDescription('할 일 제목')
            .setRequired(true)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('list')
        .setDescription('할 일 목록을 조회합니다'))
    .addSubcommand(subcommand =>
      subcommand
        .setName('complete')
        .setDescription('특정 할 일을 완료 처리합니다')
        .addStringOption(option =>
          option.setName('keyword')
            .setDescription('완료할 할 일의 키워드')
            .setRequired(true))),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    try {
      if (subcommand === 'add') {
        await handleAddTask(interaction);
      } else if (subcommand === 'list') {
        await handleListTasks(interaction);
      } else if (subcommand === 'complete') {
        await handleCompleteTask(interaction);
      }
    } catch (error) {
      console.error('Task command error:', error);
      
      let errorMessage = '❌ 할 일 처리 중 오류가 발생했습니다.';
      if (error.message.includes('credentials.json not found')) {
        errorMessage = '🔒 **인증 파일 없음!**\n`credentials.json` 파일을 프로젝트 최상단에 추가해주세요.';
      } else if (error.message.includes('invalid_grant')) {
        errorMessage = '🔒 **인증 실패!**\n인증 정보가 만료되었거나 올바르지 않습니다. `token.json` 파일을 삭제하고 다시 시도해주세요.';
      } else if (error.message.includes('No task lists found')) {
        errorMessage = '🚫 **태스크 리스트 없음!**\nGoogle Tasks에서 태스크 리스트를 먼저 생성해주세요.';
      }

      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({ content: errorMessage });
      } else {
        await interaction.reply({ content: errorMessage, ephemeral: true });
      }
    }
  },
};

async function handleAddTask(interaction) {
  const title = interaction.options.getString('title');
  
  await interaction.deferReply();
  
  // Parse multiple tasks
  const taskTitles = parseMultipleTasks(title);
  
  if (taskTitles.length === 1) {
    // Single task
    const task = await addTask(taskTitles[0]);
    await interaction.editReply(`✅ **Google Tasks에 할 일을 추가했습니다!**\n**할 일:** ${task.title}`);
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
    
    const chunks = splitMessageForMobile(responseMessage);
    await interaction.editReply(chunks[0]);
    
    // Send additional chunks if needed
    for (let i = 1; i < chunks.length; i++) {
      await interaction.followUp({ content: chunks[i] });
    }
  }
}

async function handleListTasks(interaction) {
  await interaction.deferReply();
  
  const tasks = await listTasks();
  if (tasks.length === 0) {
    await interaction.editReply('🗒️ 완료할 할 일이 없습니다.');
    return;
  }

  // Cache tasks for interactive completion
  const sessionId = cacheTasksForCompletion(tasks);
  
  // Create numbered list
  const taskList = tasks.map((task, index) => 
    `${index + 1}. **${task.title}**`
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

  const content = `🗒️ **완료할 작업을 선택해주세요:**\n\n${taskList}\n\n아래 번호를 클릭하여 완료 처리하세요:`;
  const chunks = splitMessageForMobile(content);
  
  await interaction.editReply({
    content: chunks[0],
    components: rows
  });
  
  // Send additional chunks if needed
  for (let i = 1; i < chunks.length; i++) {
    await interaction.followUp({ content: chunks[i] });
  }
}

async function handleCompleteTask(interaction) {
  const keyword = interaction.options.getString('keyword');
  
  await interaction.deferReply();
  
  const { sessionId, matchedTasks, autoCompleted, completedTask } = await searchAndCacheTasks(keyword);
  
  // If auto-completed, show success message
  if (autoCompleted && completedTask) {
    await interaction.editReply(`✅ **자동 완료!**\n할 일 **'${completedTask.title}'**을(를) 완료했습니다. (유사도: ${Math.round(completedTask.similarity * 100)}%)`);
    return;
  }
  
  if (!matchedTasks || matchedTasks.length === 0) {
    await interaction.editReply(`🔍 **'${keyword}'**와 관련된 할 일을 찾을 수 없습니다.\n전체 목록을 확인하려면 \`/task list\` 명령어를 사용해주세요.`);
    return;
  }

  // Create numbered list of matched tasks with similarity scores
  const taskList = matchedTasks.map((task, index) => 
    `${index + 1}. **${task.title}** - 유사도: ${Math.round(task.similarity * 100)}%`
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

  const content = `🔍 **'${keyword}'**와 관련된 할 일을 찾았습니다:\n\n${taskList}\n\n완료할 작업의 번호를 클릭해주세요:`;
  const chunks = splitMessageForMobile(content);
  
  await interaction.editReply({
    content: chunks[0],
    components: rows
  });
  
  // Send additional chunks if needed
  for (let i = 1; i < chunks.length; i++) {
    await interaction.followUp({ content: chunks[i] });
  }
}

