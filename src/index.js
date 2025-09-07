const fs = require('node:fs');
const path = require('node:path');
const { Client, Collection, Events, GatewayIntentBits } = require('discord.js');
const { classifyUserInput } = require('./classifier');
const { saveConversationToMemory } = require('./utils/memoryHandler');
const { transcribeAudio } = require('./utils/voiceHandler');
const { handleScheduleRequest } = require('./handlers/scheduleHandler');
const { handleImageRequest } = require('./handlers/imageHandler');
const { handleHelpRequest } = require('./handlers/helpHandler');
const { handleGeneralRequest } = require('./handlers/generalHandler');
const { handleDocumentRequest } = require('./handlers/documentHandler');
const { handleMemoryRequest } = require('./handlers/memoryHandler');
const { handleInteractionCreate } = require('./handlers/interactionHandler');
require('dotenv').config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

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

client.on('interactionCreate', async interaction => {
  if (interaction.isChatInputCommand()) {
    const command = interaction.client.commands.get(interaction.commandName);
    if (!command) return;
    try {
      await command.execute(interaction);
    } catch (error) {
      console.error(error);
      await interaction.reply({ content: 'There was an error while executing this command!', ephemeral: true });
    }
  } else {
    // 버튼, 모달 등의 다른 인터랙션은 interactionHandler에서 처리
    await handleInteractionCreate(interaction);
  }
});

client.on('messageCreate', async message => {
  if (message.author.bot || message.content.startsWith('/')) return;

  try {
    let actualContent = message.content;
    let classification;

    // 음성 파일 처리
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
});

client.login(process.env.DISCORD_TOKEN);