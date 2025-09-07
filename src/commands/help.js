const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('help')
        .setDescription('봇의 모든 기능과 사용법을 안내합니다')
        .addStringOption(option =>
            option.setName('category')
                .setDescription('특정 기능 카테고리에 대한 상세 정보')
                .setRequired(false)
                .addChoices(
                    { name: '📅 일정 관리', value: 'schedule' },
                    { name: '✅ 할일 관리', value: 'task' },
                    { name: '🎨 이미지 생성', value: 'image' },
                    { name: '📄 문서 분석', value: 'document' },
                    { name: '🧠 메모리 관리', value: 'memory' },
                    { name: '💬 일반 질문', value: 'general' },
                    { name: '🎤 음성 인식', value: 'voice' }
                )),
    
    async execute(interaction) {
        const category = interaction.options.getString('category');
        
        if (category) {
            // 특정 카테고리 상세 정보
            const categoryHelp = getCategoryHelp(category);
            const embed = new EmbedBuilder()
                .setColor(0x0099FF)
                .setTitle(`🤖 ${categoryHelp.title}`)
                .setDescription(categoryHelp.description)
                .addFields(categoryHelp.fields)
                .setFooter({ text: '더 궁금한 점이 있으시면 언제든 말씀해주세요!' })
                .setTimestamp();
            
            await interaction.reply({ embeds: [embed] });
        } else {
            // 전체 기능 안내
            const embed = new EmbedBuilder()
                .setColor(0x0099FF)
                .setTitle('🤖 Elanvital Agent 기능 안내')
                .setDescription('저는 다음과 같은 기능들을 제공합니다:')
                .addFields(
                    {
                        name: '📅 일정 관리',
                        value: '• Google Calendar 연동\n• 자연어로 일정 추가\n• 스마트 일정 삭제',
                        inline: true
                    },
                    {
                        name: '✅ 할일 관리',
                        value: '• Google Tasks 연동\n• 멀티 할일 추가\n• 스마트 완료 처리',
                        inline: true
                    },
                    {
                        name: '🎨 이미지 생성',
                        value: '• AI 이미지 생성\n• 이미지 수정\n• 프롬프트 자동 개선',
                        inline: true
                    },
                    {
                        name: '📄 문서 분석',
                        value: '• PDF/Word 분석\n• 자동 요약\n• 문서 기반 질문 답변',
                        inline: true
                    },
                    {
                        name: '🧠 메모리 관리',
                        value: '• 대화 기록 저장\n• 컨텍스트 유지\n• 자동 압축',
                        inline: true
                    },
                    {
                        name: '💬 일반 질문',
                        value: '• GPT-4o 기반 답변\n• 문서 기반 답변\n• 자연스러운 대화',
                        inline: true
                    },
                    {
                        name: '🎤 음성 인식',
                        value: '• Whisper 음성 변환\n• 모바일 지원\n• 자동 기능 연동',
                        inline: true
                    },
                    {
                        name: '📖 상세 정보',
                        value: '특정 기능에 대한 자세한 정보는 `/help category:[카테고리]`를 사용하세요.',
                        inline: false
                    }
                )
                .setFooter({ text: '궁금한 점이 있으시면 언제든 말씀해주세요!' })
                .setTimestamp();
            
            await interaction.reply({ embeds: [embed] });
        }
    },
};

function getCategoryHelp(category) {
    const categoryData = {
        schedule: {
            title: '📅 일정 관리',
            description: 'Google Calendar와 연동된 스마트 일정 관리 시스템',
            fields: [
                {
                    name: '📝 일정 추가',
                    value: '```\n"내일 오후 3시에 팀 회의 추가해줘"\n"다음주 월요일 9시부터 2시간 동안 워크샵"\n"종일 휴가"\n```',
                    inline: false
                },
                {
                    name: '📋 일정 조회',
                    value: '```\n"오늘 일정 알려줘"\n"다음주 스케줄"\n"이번달 일정"\n```\n• 인터랙티브 UI로 수정/삭제 가능',
                    inline: false
                },
                {
                    name: '🗑️ 일정 삭제',
                    value: '```\n"오늘 회의 취소해줘"\n"내일 점심 약속 삭제"\n```\n• 유사도 기반 스마트 매칭',
                    inline: false
                },
                {
                    name: '🎯 특별 기능',
                    value: '• 자연어로 시간 표현 인식\n• 종일 일정 자동 감지\n• 시간 계산 (3시간 동안 등)\n• 인터랙티브 수정/삭제 UI',
                    inline: false
                }
            ]
        },
        task: {
            title: '✅ 할일 관리',
            description: 'Google Tasks와 연동된 스마트 할일 관리 시스템',
            fields: [
                {
                    name: '📝 할일 추가',
                    value: '```\n"장보기 할일 추가해줘"\n"운동하기 등록해줘"\n```\n**멀티 할일 추가:**\n```\n"하기 할일 목록 추가해주세요\n• 육아 휴직 신청\n• 장보기"\n```',
                    inline: false
                },
                {
                    name: '📋 할일 조회',
                    value: '```\n"할일 목록 보여줘"\n"등록된 할일"\n"메모 현황 보여줘"\n```\n• 완료되지 않은 할일만 표시\n• 인터랙티브 완료 버튼 제공',
                    inline: false
                },
                {
                    name: '✅ 할일 완료',
                    value: '```\n"장보기 완료 처리해줘"\n"운동하기 끝났어"\n"청소 삭제해줘" (완료 처리)\n```\n• 유사도 기반 스마트 매칭 (80% 이상 자동 완료)\n• 버튼 클릭으로 즉시 완료',
                    inline: false
                },
                {
                    name: '🎯 특별 기능',
                    value: '• 다양한 불릿 포인트 지원 (•, ○, ●, -, * 등)\n• 번호 리스트 지원 (1., 1) 등)\n• 헤더 텍스트 자동 제거\n• 스마트 완료 (80% 유사도 자동 처리)',
                    inline: false
                },
                {
                    name: '💬 슬래시 커맨드',
                    value: '• `/task add` - 할일 추가\n• `/task list` - 할일 목록\n• `/task complete` - 할일 완료',
                    inline: false
                }
            ]
        },
        image: {
            title: '🎨 이미지 생성',
            description: 'Google Gemini AI를 활용한 고품질 이미지 생성 및 수정',
            fields: [
                {
                    name: '🆕 이미지 생성',
                    value: '```\n"고양이 그림 그려줘"\n"태양계 인포그래픽 만들어줘"\n"현대적인 로고 디자인"\n```',
                    inline: false
                },
                {
                    name: '✏️ 이미지 수정',
                    value: '```\n[이미지 업로드] "이걸 수정해줘"\n"더 밝게 만들어줘"\n"배경을 바꿔줘"\n```',
                    inline: false
                },
                {
                    name: '🧠 메모리 활용',
                    value: '• 이전 이미지 기억\n• 컨텍스트 기반 생성\n• "해당 내용으로 그려줘" 가능',
                    inline: false
                },
                {
                    name: '⚡ 프롬프트 보강',
                    value: '• ChatGPT로 프롬프트 자동 개선\n• 고품질 결과물 보장\n• 전문적인 디자인 요소 추가',
                    inline: false
                }
            ]
        },
        document: {
            title: '📄 문서 분석',
            description: 'PDF, Word 문서의 지능형 분석 및 처리',
            fields: [
                {
                    name: '📎 지원 파일',
                    value: '• PDF (.pdf)\n• Word 문서 (.docx, .doc)\n• 자동 텍스트 추출',
                    inline: false
                },
                {
                    name: '📝 자동 요약',
                    value: '```\n[파일 업로드] "문서 요약해줘"\n"핵심 내용만 알려줘"\n"이 문서에서 중요한 부분은?"\n```',
                    inline: false
                },
                {
                    name: '💾 구조화 저장',
                    value: '• Markdown 형태로 변환\n• 제목, 단락 구조 유지\n• 메모리에 영구 저장',
                    inline: false
                },
                {
                    name: '🔍 문서 질문',
                    value: '• 문서 내용 기반 질문 답변\n• 컨텍스트 유지\n• 중복 문서 자동 감지',
                    inline: false
                }
            ]
        },
        memory: {
            title: '🧠 메모리 관리',
            description: '지능형 대화 기록 및 컨텍스트 관리 시스템',
            fields: [
                {
                    name: '💾 저장 항목',
                    value: '• 대화 기록 (최대 5개)\n• 업로드된 이미지\n• 분석된 문서\n• 압축된 대화 히스토리',
                    inline: false
                },
                {
                    name: '🔄 자동 압축',
                    value: '• 오래된 대화 자동 요약\n• 메모리 효율성 최적화\n• 중요 정보 보존',
                    inline: false
                },
                {
                    name: '🗑️ 메모리 정리',
                    value: '```\n"메모리 정리해줘"\n"새 대화"\n"대화 클리어"\n"new chat"\n```',
                    inline: false
                },
                {
                    name: '🎯 컨텍스트 활용',
                    value: '• 이전 대화 참조\n• 이미지 재활용\n• 문서 내용 기반 답변',
                    inline: false
                }
            ]
        },
        general: {
            title: '💬 일반 질문',
            description: '모든 종류의 질문에 대한 지능형 답변 시스템',
            fields: [
                {
                    name: '🤖 AI 답변',
                    value: '• OpenAI GPT-4o-mini 활용\n• 정확하고 상세한 답변\n• 한국어 최적화',
                    inline: false
                },
                {
                    name: '📄 문서 기반 답변',
                    value: '• 최근 업로드된 문서 활용\n• 컨텍스트 기반 정보 제공\n• 관련 내용 자동 연결',
                    inline: false
                },
                {
                    name: '💬 자연스러운 대화',
                    value: '• 이전 대화 맥락 유지\n• 개인화된 응답\n• 친근한 톤앤매너',
                    inline: false
                },
                {
                    name: '📱 모바일 최적화',
                    value: '• 긴 답변 자동 분할\n• 읽기 쉬운 형태로 전송\n• 모바일 친화적 UI',
                    inline: false
                }
            ]
        },
        voice: {
            title: '🎤 음성 인식',
            description: 'OpenAI Whisper를 활용한 고품질 음성-텍스트 변환',
            fields: [
                {
                    name: '🎵 음성 처리',
                    value: '• Discord 음성 메시지 자동 인식\n• OpenAI Whisper API 활용\n• 높은 정확도',
                    inline: false
                },
                {
                    name: '📱 모바일 지원',
                    value: '• 모바일 Discord 음성 버튼\n• 파일 업로드 방식\n• 실시간 변환',
                    inline: false
                },
                {
                    name: '🔄 자동 처리',
                    value: '• 음성 → 텍스트 변환\n• 기존 기능과 자동 연동\n• 일정, 이미지 등 모든 기능 지원',
                    inline: false
                },
                {
                    name: '✨ 사용법',
                    value: '1. 모바일에서 음성 메시지 녹음\n2. 자동으로 텍스트 변환\n3. 해당 기능 자동 실행',
                    inline: false
                }
            ]
        }
    };
    
    return categoryData[category] || categoryData.general;
}
