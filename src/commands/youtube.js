const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('youtube')
        .setDescription('유튜브 동영상의 스크립트를 정리해드립니다')
        .addStringOption(option =>
            option.setName('url')
                .setDescription('유튜브 동영상 URL')
                .setRequired(true)),
    
    async execute(interaction) {
        const youtubeUrl = interaction.options.getString('url');
        
        // URL 유효성 검사
        const youtubeUrlPattern = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/)([a-zA-Z0-9_-]{11})/;
        const match = youtubeUrl.match(youtubeUrlPattern);
        
        if (!match) {
            await interaction.reply({
                content: '❌ 올바른 유튜브 URL을 입력해주세요.\n예시: https://www.youtube.com/watch?v=abc123',
                ephemeral: true
            });
            return;
        }
        
        const videoId = match[1];
        
        await interaction.deferReply();
        
        try {
            // 유튜브 처리 서비스 호출
            const { processYouTubeVideo } = require('../utils/youtubeHandler');
            const result = await processYouTubeVideo(youtubeUrl, videoId);
            
            // 응답 길이 제한 (Discord 메시지 제한: 2000자)
            if (result.length > 1900) {
                // 긴 응답은 파일로 전송
                const { AttachmentBuilder } = require('discord.js');
                const attachment = new AttachmentBuilder(Buffer.from(result, 'utf-8'), {
                    name: `youtube_transcript_${videoId}.txt`
                });
                
                await interaction.editReply({
                    content: '📝 **유튜브 동영상 스크립트 정리 완료**\n\n응답이 길어서 파일로 첨부했습니다.',
                    files: [attachment]
                });
            } else {
                await interaction.editReply({
                    content: `📝 **유튜브 동영상 스크립트 정리**\n\n${result}`
                });
            }
            
        } catch (error) {
            console.error('❌ 유튜브 처리 오류:', error);
            await interaction.editReply({
                content: '❌ 유튜브 동영상 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.'
            });
        }
    },
};

