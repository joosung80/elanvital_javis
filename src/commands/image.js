const { SlashCommandBuilder } = require('discord.js');
const { processImageGeneration } = require('../utils/imageHandler');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('image')
        .setDescription('프롬프트를 기반으로 이미지를 생성하거나 수정합니다.')
        .addStringOption(option =>
            option.setName('prompt')
                .setDescription('이미지 생성 또는 수정 프롬프트')
                .setRequired(true))
        .addAttachmentOption(option =>
            option.setName('image')
                .setDescription('수정할 이미지를 업로드하세요 (선택사항)')
                .setRequired(false)),
    async execute(interaction) {
        const prompt = interaction.options.getString('prompt');
        const attachment = interaction.options.getAttachment('image');

        // 이미지 파일이 있는 경우 유효성 검증
        if (attachment && (!attachment.contentType || !attachment.contentType.startsWith('image/'))) {
            await interaction.reply({ content: '이미지 파일만 업로드할 수 있습니다.', ephemeral: true });
            return;
        }

        await interaction.deferReply();

        // processImageGeneration 호출 시 interaction 객체 전달
        const result = await processImageGeneration(
            prompt,
            attachment ? attachment.url : null,
            attachment ? attachment.contentType : null,
            interaction.user.tag,
            interaction.user.displayAvatarURL(),
            interaction, // interaction 객체를 전달하여 피드백을 보낼 수 있도록 함
            interaction.user.id
        );

        if (result.success) {
            await interaction.editReply({
                embeds: [result.embed],
                files: result.files
            });
        } else {
            await interaction.editReply(result.textResponse || "이미지를 처리할 수 없습니다.");
        }
    },
};
