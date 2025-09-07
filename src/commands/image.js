const { SlashCommandBuilder } = require('discord.js');
const { processImageGeneration } = require('../utils/imageHandler');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('image')
        .setDescription('이미지를 프롬프트에 따라 수정합니다.')
        .addAttachmentOption(option =>
            option.setName('image')
                .setDescription('수정할 이미지를 업로드하세요')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('prompt')
                .setDescription('이미지 수정 프롬프트')
                .setRequired(true)),
    async execute(interaction) {
        const attachment = interaction.options.getAttachment('image');
        const prompt = interaction.options.getString('prompt');

        // 이미지 파일 검증
        if (!attachment.contentType || !attachment.contentType.startsWith('image/')) {
            await interaction.reply({ content: '이미지 파일만 업로드할 수 있습니다.', ephemeral: true });
            return;
        }

        await interaction.deferReply();
        await interaction.editReply(`"${prompt}"로 이미지 수정중... ✨`);

        const result = await processImageGeneration(
            prompt,
            attachment.url,
            attachment.contentType,
            interaction.user.tag,
            interaction.user.displayAvatarURL()
        );

        if (result.success) {
            await interaction.editReply({
                content: '',
                embeds: [result.embed],
                files: result.files
            });
        } else {
            await interaction.editReply(result.textResponse || "이미지를 수정할 수 없습니다.");
        }
    },
};
