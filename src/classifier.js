const { askGPTForJSON } = require('./services/gptService');

/**
 * 숏컷 발화를 처리하는 함수
 * 예: "할일:4차시 원고검토", "일정:차주 5시 멘토링", "이미지:고양이가 산에서 노는 모습"
 */
function parseShortcutCommand(userInput) {
    console.log(`🚀 숏컷 명령어 확인: "${userInput}"`);
    
    // 동의어 사전
    const synonyms = {
        '할일': ['할일', '타스크', '메모', 'task', 'todo'],
        '일정': ['일정', '스케쥴', 'schedule', '스케줄', '캘린더'],
        '이미지': ['이미지', '이미지생성', 'image', '그림', '그려'],
        '문서': ['문서', '드라이브', '구글드라이브', '구글독', '독스', 'drive', 'docs']
    };
    
    // 구분자 패턴 (콜론, 컴마, 탭, 스페이스, 대시 등)
    const delimiters = /[:\s,\t\-—]/;
    
    // 첫 번째 구분자를 찾아서 명령어와 내용 분리
    const delimiterMatch = userInput.match(delimiters);
    if (!delimiterMatch) {
        console.log(`❌ 구분자 없음`);
        return null;
    }
    
    const delimiterIndex = delimiterMatch.index;
    const command = userInput.substring(0, delimiterIndex).trim().toLowerCase();
    const content = userInput.substring(delimiterIndex + 1).trim();
    
    if (!content) {
        console.log(`❌ 내용 없음`);
        return null;
    }
    
    console.log(`🔍 명령어: "${command}", 내용: "${content}"`);
    
    // 동의어 매칭
    for (const [category, synonymList] of Object.entries(synonyms)) {
        if (synonymList.some(synonym => synonym === command)) {
            console.log(`✅ 숏컷 매칭: ${category} - "${content}"`);
            
            switch (category) {
                case '할일':
                    return {
                        category: 'TASK',
                        extractedInfo: {
                            taskType: 'add',
                            content: content
                        }
                    };
                    
                case '일정':
                    return {
                        category: 'SCHEDULE',
                        extractedInfo: {
                            scheduleType: 'add',
                            period: extractPeriodFromContent(content),
                            content: content
                        }
                    };
                    
                case '이미지':
                    return {
                        category: 'IMAGE',
                        extractedInfo: {
                            prompt: content
                        }
                    };
                    
                case '문서':
                    return parseDocumentShortcut(content);
            }
        }
    }
    
    console.log(`❌ 숏컷 매칭 실패`);
    return null;
}

/**
 * 내용에서 시간/날짜 정보를 추출하는 함수
 * 복합 시간 표현도 처리 (예: "차주 5시", "내일 오후 3시")
 */
function extractPeriodFromContent(content) {
    console.log(`📅 시간 정보 추출 시작: "${content}"`);
    
    // 1단계: 복합 시간 표현 패턴 (날짜 + 시간)
    const complexTimePatterns = [
        // "차차주 5시", "2주후 3시", "3주뒤 5시"
        /(차차주|\d+주\s*후|\d+주\s*뒤)\s*(\d{1,2}시)/,
        // "차차주 오후 5시", "2주후 오전 9시"
        /(차차주|\d+주\s*후|\d+주\s*뒤)\s*(오전|오후)\s*(\d{1,2}시)/,
        // "차차주 월요일 5시", "2주후 화요일 3시"
        /(차차주|\d+주\s*후|\d+주\s*뒤)\s*(월요일|화요일|수요일|목요일|금요일|토요일|일요일)\s*(\d{1,2}시)/,
        // "차차주 월요일 오후 5시"
        /(차차주|\d+주\s*후|\d+주\s*뒤)\s*(월요일|화요일|수요일|목요일|금요일|토요일|일요일)\s*(오전|오후)\s*(\d{1,2}시)/,
        // "차주 5시", "다음주 3시", "내일 5시"
        /(차주|다음주|이번주|내일|모레)\s*(\d{1,2}시)/,
        // "차주 오후 5시", "내일 오전 9시"
        /(차주|다음주|이번주|내일|모레)\s*(오전|오후)\s*(\d{1,2}시)/,
        // "차주 월요일 5시", "다음주 화요일 3시"
        /(차주|다음주|이번주)\s*(월요일|화요일|수요일|목요일|금요일|토요일|일요일)\s*(\d{1,2}시)/,
        // "차주 월요일 오후 5시"
        /(차주|다음주|이번주)\s*(월요일|화요일|수요일|목요일|금요일|토요일|일요일)\s*(오전|오후)\s*(\d{1,2}시)/,
        // "12월 25일 5시"
        /(\d{1,2}월\s*\d{1,2}일)\s*(\d{1,2}시)/,
        // "12월 25일 오후 5시"
        /(\d{1,2}월\s*\d{1,2}일)\s*(오전|오후)\s*(\d{1,2}시)/
    ];
    
    // 복합 패턴 먼저 확인
    for (const pattern of complexTimePatterns) {
        const match = content.match(pattern);
        if (match) {
            const extractedTime = match[0];
            console.log(`✅ 복합 시간 표현 추출: "${extractedTime}"`);
            return extractedTime;
        }
    }
    
    // 2단계: 개별 시간/날짜 패턴
    const simpleTimePatterns = [
        /(\d{1,2}시)/,
        /(오전|오후)\s*\d{1,2}시/,
        /(내일|모레|다음주|이번주|차주)/,
        /(월요일|화요일|수요일|목요일|금요일|토요일|일요일)/,
        /\d{1,2}월\s*\d{1,2}일/,
        /\d{4}년\s*\d{1,2}월\s*\d{1,2}일/
    ];
    
    for (const pattern of simpleTimePatterns) {
        const match = content.match(pattern);
        if (match) {
            const extractedTime = match[0];
            console.log(`✅ 단순 시간 표현 추출: "${extractedTime}"`);
            return extractedTime;
        }
    }
    
    // 시간 정보가 없으면 전체 내용을 period로 사용
    console.log(`❌ 시간 정보 없음, 전체 내용 사용: "${content}"`);
    return content;
}

/**
 * 문서 검색 숏컷을 파싱하는 함수
 * 예: "해커스 강의" -> 일반 문서 검색
 *     "해커스 강의#키워드" -> 문서 내 키워드 검색
 */
function parseDocumentShortcut(content) {
    console.log(`📄 문서 검색 파싱: "${content}"`);
    
    // # 기호로 문서명과 키워드 분리
    const hashIndex = content.indexOf('#');
    
    if (hashIndex !== -1) {
        // 문서 내 키워드 검색: "해커스 강의#키워드"
        const searchKeyword = content.substring(0, hashIndex).trim();
        const inDocumentKeyword = content.substring(hashIndex + 1).trim();
        
        if (!searchKeyword || !inDocumentKeyword) {
            console.log(`❌ 문서명 또는 키워드 없음`);
            return null;
        }
        
        console.log(`✅ 통합 문서 키워드 검색: "${searchKeyword}" 문서에서 "${inDocumentKeyword}" 검색`);
        
        return {
            category: 'DRIVE',
            extractedInfo: {
                searchKeyword: searchKeyword,
                inDocumentKeyword: inDocumentKeyword
            }
        };
    } else {
        // 일반 문서 검색: "해커스 강의"
        if (!content.trim()) {
            console.log(`❌ 검색할 문서명 없음`);
            return null;
        }
        
        console.log(`✅ 드라이브 문서 검색: "${content}"`);
        
        return {
            category: 'DRIVE',
            extractedInfo: {
                searchKeyword: content.trim()
            }
        };
    }
}

// 명확한 다른 의도가 있는지 확인하는 함수
function checkExplicitIntent(userInput) {
    const explicitKeywords = {
        SCHEDULE: ['일정', '스케줄', '캘린더', '약속', '회의', '미팅', '다음주', '이번주', '오늘', '내일', '모레', '언제', '시간', '날짜'],
        DRIVE: ['드라이브', '독스', '시트', '문서', '파일', '자료', '검색', '찾아', '읽어', '요약'],
        TASK: ['할일', '할 일', '투두', 'todo', '작업', '완료', '체크'],
        HELP: ['도움', '도와', '명령어', '사용법', '어떻게', '뭐 할 수', '기능'],
        MEMORY: ['기억', '저장', '메모리', '아까', '전에', '이전에']
    };

    console.log(`🔍 명시적 의도 확인: "${userInput}"`);
    
    for (const [category, keywords] of Object.entries(explicitKeywords)) {
        const matchedKeywords = keywords.filter(keyword => userInput.includes(keyword));
        if (matchedKeywords.length > 0) {
            console.log(`✅ ${category} 키워드 매칭: [${matchedKeywords.join(', ')}]`);
            
            // SCHEDULE의 경우 scheduleType과 period도 함께 판단
            if (category === 'SCHEDULE') {
                const scheduleType = determineScheduleType(userInput);
                const period = extractPeriod(userInput);
                return { category, extractedInfo: { scheduleType, period } };
            }
            // DRIVE와 TASK의 경우 OpenAI를 통해 상세 정보 추출 필요
            if (category === 'DRIVE') {
                console.log(`🔄 DRIVE 분류 - OpenAI로 상세 정보 추출 진행`);
                return null; // OpenAI 분류로 넘어가서 상세 정보 추출
            }
            if (category === 'TASK') {
                console.log(`🔄 TASK 분류 - OpenAI로 상세 정보 추출 진행`);
                return null; // OpenAI 분류로 넘어가서 상세 정보 추출
            }
            return { category, extractedInfo: {} };
        }
    }
    
    console.log(`❌ 명시적 의도 없음 - OpenAI 분류로 진행`);
    return null;
}

// 일정 유형을 판단하는 함수
function determineScheduleType(userInput) {
    // 더 엄격한 키워드 조건 - 명시적인 동작 키워드만
    const addKeywords = ['추가해', '등록해', '만들어', '생성해', '넣어', '저장해', '기록해', '추가하', '등록하', '만들', '생성하', '기록하'];
    const deleteKeywords = ['삭제해', '지워', '취소해', '제거해', '삭제하', '제거하', '취소하'];
    const updateKeywords = ['수정해', '변경해', '바꿔', '업데이트해', '수정하', '변경하', '업데이트하'];
    
    // 명시적인 동작 키워드가 있을 때만 해당 동작 수행
    if (addKeywords.some(keyword => userInput.includes(keyword))) {
        return 'add';
    } else if (deleteKeywords.some(keyword => userInput.includes(keyword))) {
        return 'delete';
    } else if (updateKeywords.some(keyword => userInput.includes(keyword))) {
        return 'update';
    } else {
        // 추가 패턴 확인: 구체적인 시간 + 구체적인 내용이 있으면 추가로 간주할 수도 있지만
        // 안전하게 명시적 키워드가 없으면 모두 조회로 처리
        // "다음주 일정" → query
        // "내일 3시 회의" → query (명시적 추가 키워드 없음)
        // "내일 3시 회의 추가해줘" → add (명시적 키워드 있음)
        return 'query';
    }
}

// 시간 기간을 추출하는 함수
function extractPeriod(userInput) {
    const timeKeywords = [
        '다음주', '이번주', '저번주', '지난주',
        '오늘', '내일', '모레', '어제', '그제',
        '다음달', '이번달', '저번달', '지난달',
        '올해', '내년', '작년',
        '월요일', '화요일', '수요일', '목요일', '금요일', '토요일', '일요일'
    ];
    
    // 시간 관련 키워드 찾기
    for (const keyword of timeKeywords) {
        if (userInput.includes(keyword)) {
            return keyword;
        }
    }
    
    // 날짜 패턴 찾기 (예: "12월 25일", "2024년 1월")
    const datePatterns = [
        /(\d{1,2}월\s*\d{1,2}일)/,
        /(\d{4}년\s*\d{1,2}월)/,
        /(\d{1,2}\/\d{1,2})/,
        /(\d{4}-\d{1,2}-\d{1,2})/
    ];
    
    for (const pattern of datePatterns) {
        const match = userInput.match(pattern);
        if (match) {
            return match[1];
        }
    }
    
    // 시간 키워드가 없으면 전체 텍스트 반환
    return userInput;
}

async function classifyUserInput(message, client, actualContent = null) {
    const userId = message.author.id;
    const userInput = actualContent || message.content;

    const context = client.memory.getUserMemory(userId);
    const recentConversations = client.memory.getRecentConversations(userId);

    // 0단계: 숏컷 명령어 확인 (최우선 처리)
    const shortcutResult = parseShortcutCommand(userInput);
    if (shortcutResult) {
        console.log(`🚀 숏컷 명령어 처리: ${shortcutResult.category}`);
        return shortcutResult;
    }

    // 1단계: 명확한 다른 의도가 있는지 먼저 확인 (우선순위 높음)
    const explicitIntent = checkExplicitIntent(userInput);
    
    if (explicitIntent) {
        console.log(`🎯 ${explicitIntent.category} 의도 감지`);
        if (explicitIntent.category === 'SCHEDULE') {
            console.log(`📅 일정 유형: ${explicitIntent.extractedInfo.scheduleType}`);
        }
        return explicitIntent;
    } else {
        // 2단계: 이미지가 첨부된 경우 IMAGE 카테고리로 분류
        const hasImageAttachment = message.attachments.some(attachment => 
            attachment.contentType && attachment.contentType.startsWith('image/')
        );
        
        if (hasImageAttachment) {
            console.log('🖼️ 이미지 첨부 감지');
            return { category: 'IMAGE', extractedInfo: {} };
        }

        // 3단계: 메모리에 이미지가 있고 이미지 관련 키워드가 포함된 경우 IMAGE 카테고리로 분류
        const hasImageInMemory = context.lastImageUrl;
        const imageKeywords = [
            '그려', '그림', '이미지', '사진', '편집', '수정', '바꿔', '변경', '배경', '색깔', '스타일',
            '해변', '바다', '공원', '숲', '산', '도시', '실내', '야외', // 장소/환경
            '강아지', '고양이', '동물', '사람', '아이', '여자', '남자', // 주체
            '뛰어', '노는', '앉아', '서있', '걷는', '달리는', '웃는', '잠자는', // 동작
            '만화', '애니', '실사', '흑백', '컬러', '빈티지', '모던' // 스타일
        ];
        const hasImageKeyword = imageKeywords.some(keyword => userInput.includes(keyword));
        
        // 메모리에 이미지가 있으면서 명확한 이미지 관련 키워드가 포함된 경우만
        if (hasImageInMemory && hasImageKeyword) {
            console.log('🔄 메모리 이미지 + 이미지 키워드 감지');
            return { category: 'IMAGE', extractedInfo: {} };
        }
    }

    const formattedConversations = Array.from(recentConversations.values())
        .map(conv => `User: ${conv.userMessage}\nBot: ${conv.botResponse}`)
        .join('\n\n');

    const lastDocument = context.lastDocument;
    const documentContext = lastDocument 
        ? `The user is currently interacting with a document titled "${lastDocument.title}". Document content snippet:\n${lastDocument.content.substring(0, 200)}...`
        : "The user is not interacting with any specific document right now.";
    
    const imageContext = context.lastImageUrl ? `The user has recently uploaded or interacted with an image.` : `There is no image context.`;

    const systemPrompt = `You are a message classification expert for a Discord bot. Your task is to analyze the user's message and current context, then classify it into one of the following categories and extract relevant information. Your response MUST be a JSON object.

[CONTEXT]
- Recent Conversations:
${formattedConversations}
- Document Context: ${documentContext}
- Image Context: ${imageContext}

[CATEGORIES]
{
    "HELP": "User is asking for help about the bot's capabilities or commands. (e.g., '도와줘', '뭐 할 수 있어?', '명령어 알려줘').",
    "SCHEDULE": "User is asking to query, add, delete, or update a CALENDAR EVENT with specific date/time. These are time-bound events. MUST extract 'scheduleType' ('query', 'add', 'delete', 'update') and 'period'. For 'add' and 'update', also extract 'content'. Examples: '내일 3시 회의', '다음주 월요일 프레젠테이션 일정 추가'.",
    "IMAGE": "User is asking to generate or edit an image. (e.g., '고양이 그리기', '이 이미지 수정하기').",
    "DRIVE": "User is asking to search, read, or summarize documents in Google Drive. This can also be a combined request to find a document AND search for a keyword inside it. Keywords: '드라이브', '독스', '시트', '문서', '파일', '자료'. MUST extract 'searchKeyword'. If the user wants to search for a keyword inside the document, ALSO extract 'inDocumentKeyword'.",
    "MEMORY": "User is asking the bot to remember or recall something. (e.g., '이거 기억해', '아까 뭐라고 했지?').",
    "TASK": "User is asking to manage a TO-DO LIST item. These are tasks to be completed, NOT time-bound events. MUST extract 'taskType' ('query', 'add', 'complete') and 'content' (for 'add' and 'complete'). Examples: '보고서 작성 할일 추가', '회의 준비 할일 완료', '할일 목록 보여줘'. DO NOT extract 'period' for tasks.",
    "GENERAL": "A general conversation or a topic that doesn't fit into other categories."
}

[EXTRACTION RULES]
- For DRIVE, if the user says '해커스 문서 찾아줘', 'searchKeyword' MUST be '해커스', excluding '문서'.
- For DRIVE, if the user says '패스워드 문서에서 넷플릭스 검색', 'searchKeyword' MUST be '패스워드', and 'inDocumentKeyword' MUST be '넷플릭스'.
- For SCHEDULE, if the user says '다음 주 수요일 3시에 회의 추가해줘', 'period' is '다음 주 수요일 3시' and 'content' is '회의'.
- For TASK, if the user says 'CJ 강연 스케줄 협의 내용 할일 추가해줘', 'taskType' is 'add' and 'content' is 'CJ 강연 스케줄 협의 내용'. DO NOT include 'period' for tasks.

[RESPONSE FORMAT]
{
  "category": "CATEGORY_NAME",
  "extractedInfo": {
    "scheduleType": "...", // Only for SCHEDULE
    "period": "...", // Only for SCHEDULE
    "content": "...", // For SCHEDULE (add/update) and TASK (add/complete)
    "searchKeyword": "...", // Only for DRIVE
    "inDocumentKeyword": "...", // Only for DRIVE
    "taskType": "..." // Only for TASK
  }
}

IMPORTANT: 
- TASK should NEVER have 'period' field
- SCHEDULE should NEVER have 'taskType' field
- Only include relevant fields for each category
`;

    try {
        const result = await askGPTForJSON('CLASSIFICATION', systemPrompt, userInput, { purpose: '메시지 분류' });
        console.log(`✅ AI 분류 결과: ${result.category}`);
        return result;

    } catch (error) {
        console.error('❌ 분류 오류:', error.message);
        return { category: 'GENERAL', extractedInfo: {} }; // Fallback to GENERAL
    }
}

module.exports = { classifyUserInput };
