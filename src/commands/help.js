const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { MODEL_DESCRIPTIONS } = require('../config/models');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('help')
        .setDescription('봇의 모든 기능과 사용법을 안내합니다'),
    
    async execute(interaction) {
        const embed = new EmbedBuilder()
            .setColor(0x0099FF)
            .setTitle('🤖 Elanvital Agent 기능 안내')
            .setDescription('안녕하세요! 저는 다양한 업무를 도와드리는 AI 어시스턴트입니다. 아래 기능들을 자연어로 편리하게 사용하실 수 있습니다:')
            .addFields(
                {
                    name: '📅 일정 관리 (Google Calendar 연동)',
                    value: '```\n"내일 오후 3시에 팀 회의 추가해줘"\n"오늘 일정 알려줘"\n"다음주 스케줄 보여줘"\n"내일 회의 취소해줘"\n```\n• 자연어 시간 인식 (종일, 3시간 동안 등)\n• 인터랙티브 수정/삭제 UI\n• 스마트 일정 매칭',
                    inline: false
                },
                {
                    name: '✅ 할일 관리 (Google Tasks 연동)',
                    value: '```\n"할일 목록 보여줘"\n"장보기 할일 추가해줘"\n"운동하기 완료 처리해줘"\n```\n**멀티 할일 추가:**\n```\n"할일 목록 추가해주세요\n• 육아 휴직 신청\n• 장보기\n• 운동하기"\n```\n• 80% 이상 유사도 시 자동 완료\n• 인터랙티브 완료 버튼',
                    inline: false
                },
                {
                    name: '🔍 스마트 드라이브 검색 (Google Drive 연동)',
                    value: '```\n"드라이브에서 마케팅 기획안 찾아줘"\n"패스워드 문서 읽어줘"\n"회의록 요약해줘"\n```\n**통합 검색 (NEW!):**\n```\n"패스워드 문서에서 넷플릭스 검색"\n"회의록에서 예산 찾아줘"\n```\n• 한글↔영어 키워드 자동 확장\n• Docs, Sheets, Slides 지원\n• 문서 내 키워드 검색\n• 자동 요약 및 구조화',
                    inline: false
                },
                {
                    name: `🎨 이미지 생성 & 편집 (${MODEL_DESCRIPTIONS.GEMINI_MAIN})`,
                    value: '```\n"고양이 그림 그려줘"\n"태양계 인포그래픽 만들어줘"\n[이미지 업로드] "이걸 수정해줘"\n"더 밝게 만들어줘"\n```\n• ChatGPT 프롬프트 자동 개선\n• 메모리 기반 컨텍스트 활용\n• 고품질 현실적 이미지 생성',
                    inline: false
                },
                {
                    name: '🧠 메모리 & 컨텍스트 관리',
                    value: '```\n"이거 기억해줘"\n"아까 뭐라고 했지?"\n"메모리 정리해줘"\n"새 대화"\n```\n• 최대 5개 대화 기록 유지\n• 업로드된 이미지/문서 기억\n• 자동 대화 압축\n• 컨텍스트 기반 답변',
                    inline: false
                },
                {
                    name: '🎤 음성 인식 (OpenAI Whisper)',
                    value: '• Discord 음성 메시지 자동 변환\n• 모바일 지원 (음성 버튼)\n• 변환된 텍스트로 모든 기능 자동 연동\n• 높은 한국어 인식 정확도',
                    inline: false
                },
                {
                    name: '💬 일반 질문 & 대화',
                    value: `• ${MODEL_DESCRIPTIONS.GPT_MAIN} 기반 지능형 답변\n• 문서 컨텍스트 활용 답변\n• 이전 대화 맥락 유지\n• 자연스러운 한국어 대화`,
                    inline: false
                },
                {
                    name: '🚀 사용 팁',
                    value: '• **자연어로 편하게 말씀하세요!** "내일 3시에 회의 있어" 같은 일상 표현도 OK\n• **음성 메시지**로도 모든 기능 사용 가능\n• **이전 대화나 문서를 기억**하므로 "그거", "아까 그 문서" 등 참조 가능\n• **복합 요청**도 가능: "드라이브에서 예산안 찾아서 요약해줘"',
                    inline: false
                }
            )
            .setFooter({ text: '💡 궁금한 점이 있으시면 언제든 자연어로 물어보세요! | 💰 LLM 호출 시 비용이 발생합니다.' })
            .setTimestamp();
        
        await interaction.reply({ embeds: [embed] });
    },
};
