const { authorize, listEvents, addEvent, deleteEvent, updateEvent, searchEvents } = require('../google-calendar');
const { calculateMatchScore } = require('./similarityUtils');
const { getOpenAIClient, logOpenAICall } = require('./openaiClient');

/**
 * 자연어 텍스트를 Google Calendar 이벤트 데이터로 파싱합니다.
 * @param {string} text - 파싱할 텍스트
 * @returns {Object|null} 파싱된 이벤트 데이터
 */
async function parseEventWithGemini(text) {
    console.log(`📅 일정 파싱: "${text}"`);
    
    const now = new Date();
    const koreanTime = now.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
    const koreanDate = now.toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' });
    const koreanWeekday = now.toLocaleDateString('ko-KR', { weekday: 'long', timeZone: 'Asia/Seoul' });
    
    const prompt = `
당신은 한국어 자연어를 정확한 일정 데이터로 변환하는 전문가입니다.

현재 시간 정보:
- 현재 UTC 시간: ${now.toISOString()}
- 현재 한국 시간: ${koreanTime}
- 현재 한국 날짜: ${koreanDate}
- 현재 요일: ${koreanWeekday}
- 현재 년도: ${now.getFullYear()}년
- 현재 월: ${now.getMonth() + 1}월

**자연어 시간 표현 해석 규칙:**
- "오늘" = ${koreanDate}
- "내일" = ${koreanDate}의 다음날
- "어제" = ${koreanDate}의 전날
- "이번주" = 현재 주 (월요일~일요일)
- "다음주" = 다음 주 (월요일~일요일)

**시간 표현 인식:**
- "6시" = 오후 6시 (18:00)로 해석 (일반적인 저녁 시간)
- "오전 6시", "AM 6시" = 06:00
- "오후 6시", "PM 6시" = 18:00
- "1시반", "1시 30분" = 13:30 (오후) 또는 01:30 (오전)
- "9시 15분", "9:15" = 09:15 또는 21:15
- "10시반", "10:30" = 10:30 또는 22:30
- "새벽 2시" = 02:00
- "밤 11시" = 23:00

**지속시간 표현 인식 및 자동 계산:**
- "9시부터 3시간동안" → 시작: 09:00, 종료: 12:00 (3시간 추가)
- "2시부터 1시간 30분" → 시작: 14:00, 종료: 15:30 (1.5시간 추가)
- "오후 3시부터 2시간" → 시작: 15:00, 종료: 17:00 (2시간 추가)
- "10시부터 45분간" → 시작: 10:00, 종료: 10:45 (45분 추가)
- "1시반부터 90분" → 시작: 13:30, 종료: 15:00 (90분 추가)
- "오전 9시부터 2시간 15분" → 시작: 09:00, 종료: 11:15

**종일 일정 판단 규칙:**
다음 경우에는 종일 일정으로 처리:
1. "종일", "하루종일", "전일", "올데이", "all day" 키워드 포함
2. 구체적인 시간 언급이 전혀 없는 경우 (예: "내일 회의", "오늘 휴가")
3. "~일에" 형태로만 날짜만 언급된 경우

**시간 지정 일정 판단:**
구체적인 시간이나 지속시간이 언급된 경우 시간 지정 일정으로 처리
- 시작시간만: "3시", "오후 2시", "10:30", "오전 9시"
- 시작-종료: "3시부터 5시까지", "14:00-16:00"
- 지속시간: "9시부터 3시간", "2시부터 1시간 30분"

변환 작업:
1. 입력 텍스트에서 일정 제목과 시간 정보를 정확히 추출
2. 종일 일정인지 시간 지정 일정인지 판단
3. 시간 지정 일정: 자연어 시간 표현을 정확한 ISO 8601 형식으로 변환
4. 종일 일정: date 형식 사용 (dateTime 대신)
5. 시간대는 항상 'Asia/Seoul' 사용

입력 텍스트: "${text}"

응답 형식 (JSON만):

**시간 지정 일정인 경우:**
{
  "summary": "추출된 일정 제목",
  "start": {
    "dateTime": "YYYY-MM-DDTHH:MM:SS+09:00",
    "timeZone": "Asia/Seoul"
  },
  "end": {
    "dateTime": "YYYY-MM-DDTHH:MM:SS+09:00",
    "timeZone": "Asia/Seoul"
  }
}

**종일 일정인 경우:**
{
  "summary": "추출된 일정 제목",
  "start": {
    "date": "YYYY-MM-DD"
  },
  "end": {
    "date": "YYYY-MM-DD"
  }
}

변환 예시:

**시간 지정 일정:**
- "내일 6시에 영준이와 저녁식사" → 시작: 내일 18:00, 종료: 내일 19:00
- "오늘 오후 3시 팀 회의" → 시작: 오늘 15:00, 종료: 오늘 16:00
- "내일 1시반부터 미팅" → 시작: 내일 13:30, 종료: 내일 14:30
- "오후 2시부터 3시간 워크샵" → 시작: 오늘 14:00, 종료: 오늘 17:00
- "9시부터 1시간 30분 회의" → 시작: 오늘 09:00, 종료: 오늘 10:30
- "오전 10시부터 45분간 브리핑" → 시작: 오늘 10:00, 종료: 오늘 10:45
- "새벽 2시부터 2시간 작업" → 시작: 오늘 02:00, 종료: 오늘 04:00

**종일 일정:**
- "내일 회의" → 종일 일정: 내일 전체
- "오늘 휴가" → 종일 일정: 오늘 전체
- "다음주 화요일 종일 워크샵" → 종일 일정: 다음주 화요일 전체
- "내일 하루종일 출장" → 종일 일정: 내일 전체
    `;
    
    try {
        // OpenAI API 호출 로그는 응답 후에 출력
        
        const openai = getOpenAIClient();
    const response = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                {
                    role: "system",
                    content: "당신은 한국어 자연어를 정확한 일정 데이터로 변환하는 전문가입니다. 반드시 JSON 형식으로만 답변하세요."
                },
                {
                    role: "user",
                    content: prompt
                }
            ],
            temperature: 0.1,
            max_tokens: 300
        });
        
        const jsonText = response.choices[0].message.content.replace(/```json/g, '').replace(/```/g, '').trim();
        
        logOpenAICall('gpt-4o-mini', response.usage, '일정 파싱');
        
        const parsedEvent = JSON.parse(jsonText);
        console.log(`✅ 일정 파싱 완료: ${parsedEvent.summary || '제목 없음'}`);
        
        return parsedEvent;
    } catch (e) {
        console.error(`❌ 일정 파싱 실패:`, e.message);
        return null;
    }
}

/**
 * 기간 표현을 시작일과 종료일로 변환합니다.
 * @param {string} period - 기간 표현 (예: "오늘", "이번주")
 * @returns {Object|null} 시간 범위 정보
 */
async function getTimeRangeFromPeriod(period) {
    console.log(`🕐 시간 범위 파싱: "${period}"`);
    
    const now = new Date();
    const koreanTime = now.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
    const koreanDate = now.toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' });
    const koreanWeekday = now.toLocaleDateString('ko-KR', { weekday: 'long', timeZone: 'Asia/Seoul' });
    
    const prompt = `
당신은 한국어 기간 표현을 정확한 날짜 범위로 변환하는 전문가입니다.

현재 시간 정보:
- 현재 UTC 시간: ${now.toISOString()}
- 현재 한국 시간: ${koreanTime}
- 현재 한국 날짜: ${koreanDate}
- 현재 요일: ${koreanWeekday}

기간 표현: "${period}"

**중요한 주 계산 규칙 (월요일부터 일요일까지):**

1. **이번주**: 현재 날짜가 포함된 주의 월요일 00:00 ~ 일요일 23:59
   - 예: 현재가 9월 8일(일)이면 → 9월 2일(월) ~ 9월 8일(일)
   - 예: 현재가 9월 9일(월)이면 → 9월 9일(월) ~ 9월 15일(일)

2. **다음주**: 이번주 다음 주의 월요일 00:00 ~ 일요일 23:59
   - 예: 현재가 9월 8일(일)이면 → 9월 9일(월) ~ 9월 15일(일)
   - 예: 현재가 9월 9일(월)이면 → 9월 16일(월) ~ 9월 22일(일)

3. **지난주**: 이번주 이전 주의 월요일 00:00 ~ 일요일 23:59
   - 예: 현재가 9월 8일(일)이면 → 8월 26일(월) ~ 9월 1일(일)
   - 예: 현재가 9월 9일(월)이면 → 9월 2일(월) ~ 9월 8일(일)

**기타 기간 규칙:**
- "오늘" = 현재 날짜 00:00 ~ 23:59
- "내일" = 현재 날짜 + 1일 00:00 ~ 23:59
- "어제" = 현재 날짜 - 1일 00:00 ~ 23:59
- "이번달" = 현재 달 1일 00:00 ~ 마지막 날 23:59
- "다음달" = 다음 달 1일 00:00 ~ 마지막 날 23:59
- "지난달" = 지난 달 1일 00:00 ~ 마지막 날 23:59

**주 계산 단계별 예시:**
현재: 2025년 9월 8일 일요일
1. 이번주 월요일 찾기: 9월 8일(일) - 6일 = 9월 2일(월)
2. 이번주 일요일: 9월 8일(일) (현재)
3. 다음주 월요일: 9월 8일(일) + 1일 = 9월 9일(월)
4. 다음주 일요일: 9월 9일(월) + 6일 = 9월 15일(일)

시간대는 항상 'Asia/Seoul' (+09:00)을 사용하세요.

응답은 반드시 다음 JSON 형식으로만 답변해주세요:
{
  "start": "YYYY-MM-DDTHH:MM:SS+09:00",
  "end": "YYYY-MM-DDTHH:MM:SS+09:00",
  "description": "기간설명"
}
`;

    try {
        // OpenAI API 호출 로그는 응답 후에 출력
        
        const openai = getOpenAIClient();
    const response = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                {
                    role: "system",
                    content: "당신은 한국어 기간 표현을 정확한 날짜 범위로 변환하는 전문가입니다. 반드시 JSON 형식으로만 답변하세요."
                },
                {
                    role: "user",
                    content: prompt
                }
            ],
            temperature: 0.1,
            max_tokens: 200
        });
        
        const responseText = response.choices[0].message.content;
        
        logOpenAICall('gpt-4o-mini', response.usage, '시간 범위 파싱');
        
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            const timeRange = JSON.parse(jsonMatch[0]);
            
            // 계산된 날짜 범위 로그 출력
            const startDate = new Date(timeRange.start);
            const endDate = new Date(timeRange.end);
            console.log(`📅 ${timeRange.description}: ${startDate.toLocaleDateString('ko-KR')} ~ ${endDate.toLocaleDateString('ko-KR')}`);
            
            return timeRange;
        }
        
        console.log(`❌ JSON 매칭 실패`);
        return null;
    } catch (error) {
        console.error(`❌ 시간 범위 파싱 오류:`, error.message);
        return null;
    }
}

/**
 * 인터랙티브 일정 조회 (수정/삭제 버튼 포함)
 * @param {string} period - 조회할 기간
 * @param {string} userId - 사용자 ID
 * @returns {Object} 조회 결과
 */
async function getInteractiveSchedule(period = '오늘', userId = null) {
    console.log(`📋 일정 조회: "${period}"`);
    
    try {
        const auth = await authorize();
        
        const timeRange = await getTimeRangeFromPeriod(period);
        
        if (!timeRange) {
            console.log(`❌ 시간 범위 파싱 실패`);
            return {
                success: false,
                message: '기간을 이해하지 못했습니다. 다시 시도해주세요. (예: 오늘, 내일, 이번주, 지난주, 이번달)'
            };
        }

        const events = await listEvents(auth, timeRange.start, timeRange.end);
        console.log(`📊 조회된 이벤트: ${events ? events.length : 0}개`);
        
        if (!events || events.length === 0) {
            console.log(`ℹ️ 해당 기간에 일정 없음`);
            return {
                success: true,
                message: `**${timeRange.description}**에 예정된 일정이 없습니다.`
            };
        }
        
        // 세션 ID 생성
        const sessionId = `${userId || 'unknown'}_${Date.now()}`;
        
        // 일정 세션 저장 (수정/삭제용)
        saveScheduleSession(sessionId, {
            events: events,
            period: period,
            description: timeRange.description,
            userId: userId
        });
        
        console.log(`💾 일정 세션 저장: ${events.length}개`);
        
        // Discord 버튼 UI 생성 - 컴팩트한 투명 스타일 버튼
        const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
        
        const actionRows = [];
        
        // 모든 버튼을 한 줄에 배치 (최대 5개 버튼까지)
        const allButtons = [];
        
        events.forEach((event, index) => {
            // 수정 버튼 - 번호 + 이모티콘
            const editButton = new ButtonBuilder()
                .setCustomId(`edit_${sessionId}_${index}`)
                .setLabel(`${index + 1}.✏️`)
                .setStyle(ButtonStyle.Secondary);
            
            // 삭제 버튼 - 번호 + 이모티콘
            const deleteButton = new ButtonBuilder()
                .setCustomId(`quick_delete_${sessionId}_${index}`)
                .setLabel(`${index + 1}.🗑️`)
                .setStyle(ButtonStyle.Secondary);
            
            allButtons.push(editButton, deleteButton);
        });
        
        // Discord 한 줄당 최대 4개 버튼 제한으로 여러 줄로 나누기
        for (let i = 0; i < allButtons.length; i += 4) {
            const row = new ActionRowBuilder()
                .addComponents(allButtons.slice(i, i + 4));
            actionRows.push(row);
        }
        
        // 메시지 내용 생성 - 일정과 버튼 번호 매칭 (간결한 형식)
        const eventList = events.map((event, index) => {
            const startDate = new Date(event.start.dateTime || event.start.date);
            
            // 간결한 날짜 형식: "9/8(월)"
            const month = startDate.getMonth() + 1;
            const day = startDate.getDate();
            const weekday = startDate.toLocaleDateString('ko-KR', { weekday: 'short' });
            const dateStr = `${month}/${day}(${weekday})`;
            
            let timeStr;
            if (event.start.dateTime) {
                const hour = startDate.getHours();
                const minute = startDate.getMinutes();
                
                // 분이 있으면 "17:30", 없으면 "17시"
                if (minute === 0) {
                    timeStr = `${hour}시`;
                } else {
                    timeStr = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
                }
            } else {
                timeStr = '종일';
            }
            
            // 일정 제목 길이 제한
            const maxTitleLength = 30;
            const eventTitle = event.summary.length > maxTitleLength ? 
                event.summary.substring(0, maxTitleLength) + '...' : 
                event.summary;
            
            return `**${index + 1}.** \`${dateStr} ${timeStr}\` **${eventTitle}**`;
        }).join('\n');
        
        const message = `**${timeRange.description} 일정:**\n\n${eventList}\n\n🔧 **아래 버튼으로 수정/삭제하세요:**`;
        
        console.log(`✅ 일정 조회 완료 (${events.length}개)`);
        
        return {
            success: true,
            message: message,
            components: actionRows,
            isInteractive: true,
            sessionId: sessionId
        };
        
    } catch (error) {
        console.error(`❌ 일정 조회 오류:`, error.message);
        return {
            success: false,
            message: '일정 조회 중 오류가 발생했습니다.'
        };
    }
}

/**
 * 일정을 조회합니다.
 * @param {string} period - 조회할 기간
 * @returns {Object} 조회 결과
 */
async function getScheduleSummary(period = '오늘') {
    console.log(`[SCHEDULE DEBUG] 📋 일정 조회 시작 - 기간: "${period}"`);
    
    try {
        console.log(`[SCHEDULE DEBUG] 🔐 Google Calendar 인증 중...`);
        const auth = await authorize();
        console.log(`[SCHEDULE DEBUG] ✅ 인증 완료`);
        
        const timeRange = await getTimeRangeFromPeriod(period);
        
        if (!timeRange) {
            console.log(`[SCHEDULE DEBUG] ❌ 시간 범위 파싱 실패`);
            return {
                success: false,
                message: '기간을 이해하지 못했습니다. 다시 시도해주세요. (예: 오늘, 내일, 이번주, 지난주, 이번달)'
            };
        }

        console.log(`[SCHEDULE DEBUG] 📅 Google Calendar API 호출 - 범위: ${timeRange.start} ~ ${timeRange.end}`);
        const events = await listEvents(auth, timeRange.start, timeRange.end);
        console.log(`[SCHEDULE DEBUG] 📊 조회된 이벤트 수: ${events ? events.length : 0}`);
        
        if (!events || events.length === 0) {
            console.log(`[SCHEDULE DEBUG] ℹ️ 해당 기간에 일정 없음`);
            return {
                success: true,
                message: `${timeRange.description}에 예정된 일정이 없습니다.`
            };
        }
        
        console.log(`[SCHEDULE DEBUG] 📝 이벤트 목록 생성 중...`);
        
        // 일정이 많을 때 모바일 최적화
        const maxEventsToShow = 10;
        const eventsToShow = events.slice(0, maxEventsToShow);
        const hasMoreEvents = events.length > maxEventsToShow;
        
        const eventList = eventsToShow.map((event, index) => {
            const startDate = new Date(event.start.dateTime || event.start.date);
            
            // 모바일 친화적인 날짜/시간 포맷
            const dateStr = startDate.toLocaleDateString('ko-KR', {
                month: 'numeric',
                day: 'numeric',
                weekday: 'short'
            });
            
            const timeStr = event.start.dateTime ? 
                startDate.toLocaleTimeString('ko-KR', {
                    hour: 'numeric',
                    minute: '2-digit',
                    hour12: false
                }) : '종일';
            
            // 일정 제목 길이 제한 (모바일 고려)
            const maxTitleLength = 25;
            const title = event.summary.length > maxTitleLength ? 
                event.summary.substring(0, maxTitleLength) + '...' : 
                event.summary;
            
            console.log(`[SCHEDULE DEBUG] 📌 이벤트 ${index + 1}: ${title} (${dateStr} ${timeStr})`);
            
            // 모바일 친화적인 포맷: 한 줄로 간결하게
            return `• ${dateStr} ${timeStr} - ${title}`;
        }).join('\n');
        
        // 더 많은 일정이 있을 때 안내 메시지
        const moreEventsMessage = hasMoreEvents ? 
            `\n\n📋 **총 ${events.length}개 일정 중 ${maxEventsToShow}개만 표시**\n더 많은 일정을 보려면 Google Calendar를 확인하세요.` : '';
        
        console.log(`[SCHEDULE DEBUG] ✅ 일정 조회 완료 (${eventsToShow.length}/${events.length})`);
        return {
            success: true,
            message: `**${timeRange.description} 일정:**\n\n${eventList}${moreEventsMessage}`
        };
    } catch (error) {
        console.error(`[SCHEDULE DEBUG] ❌ 일정 조회 오류:`, error);
        return {
            success: false,
            message: '일정 조회 중 오류가 발생했습니다.'
        };
    }
}

/**
 * 문자열 유사도를 계산합니다 (Levenshtein Distance 기반)
 * @param {string} str1 - 첫 번째 문자열
 * @param {string} str2 - 두 번째 문자열
 * @returns {number} 유사도 (0~1, 1이 완전 일치)
 */
function calculateSimilarity(str1, str2) {
    const s1 = str1.toLowerCase().trim();
    const s2 = str2.toLowerCase().trim();
    
    if (s1 === s2) return 1.0;
    
    const longer = s1.length > s2.length ? s1 : s2;
    const shorter = s1.length > s2.length ? s2 : s1;
    
    if (longer.length === 0) return 1.0;
    
    const distance = levenshteinDistance(longer, shorter);
    return (longer.length - distance) / longer.length;
}

/**
 * Levenshtein Distance 계산
 * @param {string} str1 - 첫 번째 문자열
 * @param {string} str2 - 두 번째 문자열
 * @returns {number} 편집 거리
 */
function levenshteinDistance(str1, str2) {
    const matrix = [];
    
    for (let i = 0; i <= str2.length; i++) {
        matrix[i] = [i];
    }
    
    for (let j = 0; j <= str1.length; j++) {
        matrix[0][j] = j;
    }
    
    for (let i = 1; i <= str2.length; i++) {
        for (let j = 1; j <= str1.length; j++) {
            if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1,
                    matrix[i][j - 1] + 1,
                    matrix[i - 1][j] + 1
                );
            }
        }
    }
    
    return matrix[str2.length][str1.length];
}

/**
 * 자연어 삭제 요청을 파싱합니다.
 * @param {string} text - 삭제 요청 텍스트
 * @returns {Object|null} 파싱된 삭제 정보
 */
async function parseDeleteRequest(text) {
    console.log(`[DELETE DEBUG] 🗑️ 삭제 요청 파싱 시작 - 입력: "${text}"`);
    
    const now = new Date();
    const koreanTime = now.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
    const koreanDate = now.toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' });
    const koreanWeekday = now.toLocaleDateString('ko-KR', { weekday: 'long', timeZone: 'Asia/Seoul' });
    
    const prompt = `
당신은 한국어 일정 삭제 요청을 분석하는 전문가입니다.

현재 시간 정보:
- 현재 UTC 시간: ${now.toISOString()}
- 현재 한국 시간: ${koreanTime}
- 현재 한국 날짜: ${koreanDate}
- 현재 요일: ${koreanWeekday}
- 현재 년도: ${now.getFullYear()}년
- 현재 월: ${now.getMonth() + 1}월

자연어 시간 표현 해석 규칙:
- "오늘" = ${koreanDate} (하루 전체)
- "내일" = ${koreanDate}의 다음날 (하루 전체)
- "어제" = ${koreanDate}의 전날 (하루 전체)
- "이번주" = 현재 주 월요일~일요일 (전체 주간)
- "다음주" = 다음 주 월요일~일요일 (전체 주간)
- "다음주 일정중에" = 다음 주 전체에서 검색
- 시간이 명시되지 않으면 해당 기간 전체에서 검색

중요한 규칙:
- "다음주", "이번주", "다음주 일정중에" 등은 반드시 전체 주간으로 검색
- 특정 날짜가 명시되지 않은 경우 넓은 범위로 검색
- searchDate는 검색 시작일로 설정하되, 주간 검색시에는 월요일 날짜 사용

삭제 요청 분석:
1. 삭제할 일정의 키워드 추출 (가장 핵심적인 단어들만)
2. 검색할 날짜 범위 결정 (주간/일간 구분)
3. 정확한 시간이 없어도 날짜와 내용으로 매칭

입력 텍스트: "${text}"

응답 형식 (JSON만):
{
  "searchKeyword": "검색할 일정 키워드 (핵심 단어만, 예: 점심, 회의, 워크샵)",
  "searchDate": "YYYY-MM-DD (검색 시작일)",
  "searchTimeStart": "YYYY-MM-DDTHH:MM:SS+09:00",
  "searchTimeEnd": "YYYY-MM-DDTHH:MM:SS+09:00",
  "description": "검색 범위 설명"
}

예시:
- "오늘 회의 취소해줘" → searchKeyword: "회의", 오늘 00:00~23:59 검색
- "내일 저녁식사 삭제" → searchKeyword: "저녁식사", 내일 00:00~23:59 검색
- "이번주 워크샵 없애줘" → searchKeyword: "워크샵", 이번주 월요일~일요일 전체 검색
- "다음주 일정중에 점심 약속 삭제" → searchKeyword: "점심", 다음주 월요일~일요일 전체 검색
`;
    
    try {
        console.log(`[DELETE DEBUG] 🤖 OpenAI GPT-4o-mini API 호출 중...`);
        
        const openai = getOpenAIClient();
    const response = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                {
                    role: "system",
                    content: "당신은 한국어 일정 삭제 요청을 분석하는 전문가입니다. 반드시 JSON 형식으로만 답변하세요."
                },
                {
                    role: "user",
                    content: prompt
                }
            ],
            temperature: 0.1,
            max_tokens: 300
        });
        
        const jsonText = response.choices[0].message.content.replace(/```json/g, '').replace(/```/g, '').trim();
        
        console.log(`[DELETE DEBUG] 📝 OpenAI 응답: ${jsonText}`);
        
        const parsedRequest = JSON.parse(jsonText);
        console.log(`[DELETE DEBUG] ✅ 파싱 성공:`, parsedRequest);
        
        return parsedRequest;
    } catch (e) {
        console.error(`[DELETE DEBUG] ❌ 삭제 요청 파싱 실패:`, e);
        return null;
    }
}

// 삭제 대기 중인 세션 저장소
const deleteSessions = new Map();

// 일정 관리 세션 저장소 (수정/삭제용)
const scheduleSessions = new Map();

/**
 * 삭제 세션을 저장합니다.
 * @param {string} sessionId - 세션 ID
 * @param {Object} sessionData - 세션 데이터
 */
function saveDeleteSession(sessionId, sessionData) {
    deleteSessions.set(sessionId, {
        ...sessionData,
        timestamp: Date.now()
    });
    
    // 10분 후 자동 만료
    setTimeout(() => {
        deleteSessions.delete(sessionId);
    }, 10 * 60 * 1000);
}

/**
 * 삭제 세션을 가져옵니다.
 * @param {string} sessionId - 세션 ID
 * @returns {Object|null} 세션 데이터
 */
function getDeleteSession(sessionId) {
    return deleteSessions.get(sessionId) || null;
}

/**
 * 일정 세션을 저장합니다.
 * @param {string} sessionId - 세션 ID
 * @param {Object} sessionData - 세션 데이터
 */
function saveScheduleSession(sessionId, sessionData) {
    scheduleSessions.set(sessionId, {
        ...sessionData,
        timestamp: Date.now()
    });
    
    // 30분 후 자동 만료
    setTimeout(() => {
        scheduleSessions.delete(sessionId);
    }, 30 * 60 * 1000);
}

/**
 * 일정 세션을 가져옵니다.
 * @param {string} sessionId - 세션 ID
 * @returns {Object|null} 세션 데이터
 */
function getScheduleSession(sessionId) {
    return scheduleSessions.get(sessionId) || null;
}

/**
 * 일정을 삭제합니다.
 * @param {string} input - 일정 삭제 요청 텍스트
 * @param {string} userId - 사용자 ID
 * @returns {Object} 삭제 결과
 */
async function deleteScheduleEvent(input, userId = null) {
    console.log(`[DELETE DEBUG] 🗑️ 일정 삭제 시작 - 입력: "${input}"`);
    
    try {
        console.log(`[DELETE DEBUG] 🔐 Google Calendar 인증 중...`);
        const auth = await authorize();
        console.log(`[DELETE DEBUG] ✅ 인증 완료`);
        
        const deleteRequest = await parseDeleteRequest(input);
        
        if (!deleteRequest || !deleteRequest.searchKeyword) {
            console.log(`[DELETE DEBUG] ❌ 삭제 요청 파싱 실패`);
            return {
                success: false,
                message: '삭제할 일정을 이해하지 못했어요. 좀 더 명확하게 말씀해주시겠어요? (예: 오늘 회의 취소해줘, 내일 저녁식사 삭제)'
            };
        }

        console.log(`[DELETE DEBUG] 🔍 일정 검색 중 - 키워드: "${deleteRequest.searchKeyword}"`);
        console.log(`[DELETE DEBUG] 📅 검색 범위: ${deleteRequest.searchTimeStart} ~ ${deleteRequest.searchTimeEnd}`);
        
        // 해당 날짜 범위의 모든 일정 조회
        const events = await listEvents(auth, deleteRequest.searchTimeStart, deleteRequest.searchTimeEnd);
        console.log(`[DELETE DEBUG] 📊 조회된 이벤트 수: ${events ? events.length : 0}`);
        
        if (!events || events.length === 0) {
            console.log(`[DELETE DEBUG] ℹ️ 해당 기간에 일정 없음`);
            return {
                success: false,
                message: `${deleteRequest.description}에 일정이 없습니다.`
            };
        }
        
        // 모든 일정의 유사도 계산 및 정렬
        const allSimilarities = events.map(event => ({
            event: event,
            similarity: calculateMatchScore(deleteRequest.searchKeyword, event.summary || '')
        })).sort((a, b) => b.similarity - a.similarity);
        
        // 유사도가 30%보다 큰 항목만 필터링
        const relevantSimilarities = allSimilarities.filter(item => item.similarity > 0.3);
        
        console.log(`[DELETE DEBUG] 🔍 유사도 매칭 결과:`);
        relevantSimilarities.forEach((item, index) => {
            console.log(`[DELETE DEBUG] ${index + 1}. "${item.event.summary}" - ${(item.similarity * 100).toFixed(1)}% 유사`);
        });
        
        // 유사한 일정이 있는지 확인
        if (relevantSimilarities.length === 0) {
            console.log(`[DELETE DEBUG] ❌ 유사한 일정 없음`);
            return {
                success: false,
                message: `"${deleteRequest.searchKeyword}"와 유사한 일정을 찾을 수 없습니다.`
            };
        }

        // 80% 이상 유사도이고 후보가 1개만 있으면 자동 삭제
        const bestMatch = relevantSimilarities[0];
        if (bestMatch.similarity >= 0.8 && relevantSimilarities.length === 1) {
            console.log(`[DELETE DEBUG] 🎯 자동 삭제 조건 충족 - 유사도: ${(bestMatch.similarity * 100).toFixed(1)}%`);
            
            try {
                await deleteEvent(auth, bestMatch.event.id);
                console.log(`[DELETE DEBUG] ✅ 자동 삭제 완료: "${bestMatch.event.summary}"`);
                
                return {
                    success: true,
                    message: `🗑️ **자동 삭제 완료!**\n일정 **'${bestMatch.event.summary}'**을(를) 삭제했습니다. (유사도: ${Math.round(bestMatch.similarity * 100)}%)`
                };
            } catch (error) {
                console.error(`[DELETE DEBUG] ❌ 자동 삭제 실패:`, error);
                return {
                    success: false,
                    message: '일정 삭제 중 오류가 발생했습니다.'
                };
            }
        }
        
        // 세션 ID 생성 (사용자 ID + 타임스탬프)
        const sessionId = `${userId || 'unknown'}_${Date.now()}`;
        
        // 삭제 세션 저장 (유사도가 0%보다 큰 항목만, 최대 5개까지)
        const candidateEvents = relevantSimilarities.slice(0, 5);
        saveDeleteSession(sessionId, {
            events: candidateEvents,
            searchKeyword: deleteRequest.searchKeyword,
            description: deleteRequest.description,
            userId: userId
        });
        
        console.log(`[DELETE DEBUG] 💾 삭제 세션 저장: ${sessionId} (${candidateEvents.length}개 후보)`);
        
        // Discord 버튼 UI 생성
        const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
        
        const buttons = [];
        const actionRows = [];
        
        // 최대 5개 일정에 대한 버튼 생성
        candidateEvents.forEach((item, index) => {
            const event = item.event;
            const startDate = new Date(event.start.dateTime || event.start.date);
            
            const dateStr = startDate.toLocaleDateString('ko-KR', {
                month: 'numeric',
                day: 'numeric'
            });
            
            const timeStr = event.start.dateTime ? 
                startDate.toLocaleTimeString('ko-KR', {
                    hour: 'numeric',
                    minute: '2-digit',
                    hour12: false
                }) : '종일';
            
            // 버튼 라벨 길이 제한 (Discord 제한: 80자)
            const maxLabelLength = 60;
            const eventTitle = event.summary.length > maxLabelLength ? 
                event.summary.substring(0, maxLabelLength) + '...' : 
                event.summary;
            
            const button = new ButtonBuilder()
                .setCustomId(`delete_${sessionId}_${index}`)
                .setLabel(`${dateStr} ${timeStr} - ${eventTitle}`)
                .setStyle(ButtonStyle.Danger);
            
            buttons.push(button);
        });
        
        // 취소 버튼 추가
        const cancelButton = new ButtonBuilder()
            .setCustomId(`cancel_${sessionId}`)
            .setLabel('❌ 취소')
            .setStyle(ButtonStyle.Secondary);
        
        buttons.push(cancelButton);
        
        // 각 버튼을 별도의 줄에 배치 (1줄에 1개씩)
        buttons.forEach(button => {
            const row = new ActionRowBuilder()
                .addComponents(button);
            actionRows.push(row);
        });
        
        // 메시지 내용 생성
        const candidateList = candidateEvents.map((item, index) => {
            const event = item.event;
            const startDate = new Date(event.start.dateTime || event.start.date);
            
            const dateStr = startDate.toLocaleDateString('ko-KR', {
                month: 'numeric',
                day: 'numeric',
                weekday: 'short'
            });
            
            const timeStr = event.start.dateTime ? 
                startDate.toLocaleTimeString('ko-KR', {
                    hour: 'numeric',
                    minute: '2-digit',
                    hour12: false
                }) : '종일';
            
            const similarity = (item.similarity * 100).toFixed(1);
            
            return `${index + 1}. **${dateStr} ${timeStr}** - ${event.summary} *(${similarity}% 유사)*`;
        }).join('\n');
        
        const message = `🔍 **"${deleteRequest.searchKeyword}"** 검색 결과:\n\n${candidateList}\n\n❓ **삭제할 일정을 선택해주세요:**`;
        
        return {
            success: true,
            message: message,
            components: actionRows,
            isInteractive: true,
            sessionId: sessionId
        };
        
    } catch (error) {
        console.error(`[DELETE DEBUG] ❌ 일정 삭제 오류:`, error);
        return {
            success: false,
            message: '일정 삭제 중 오류가 발생했습니다.'
        };
    }
}

/**
 * 선택된 일정을 실제로 삭제합니다.
 * @param {string} sessionId - 세션 ID
 * @param {number} eventIndex - 선택된 이벤트 인덱스
 * @returns {Object} 삭제 결과
 */
async function executeScheduleDelete(sessionId, eventIndex) {
    console.log(`[DELETE DEBUG] 🎯 일정 삭제 실행 - 세션: ${sessionId}, 인덱스: ${eventIndex}`);
    
    try {
        // 세션 데이터 가져오기
        const sessionData = getDeleteSession(sessionId);
        if (!sessionData) {
            console.log(`[DELETE DEBUG] ❌ 세션 만료 또는 없음: ${sessionId}`);
            return {
                success: false,
                message: '⏰ 삭제 요청이 만료되었습니다. 다시 시도해주세요.'
            };
        }
        
        // 선택된 이벤트 확인
        if (eventIndex < 0 || eventIndex >= sessionData.events.length) {
            console.log(`[DELETE DEBUG] ❌ 잘못된 인덱스: ${eventIndex}`);
            return {
                success: false,
                message: '❌ 잘못된 선택입니다.'
            };
        }
        
        const selectedItem = sessionData.events[eventIndex];
        const eventToDelete = selectedItem.event;
        
        console.log(`[DELETE DEBUG] 🎯 삭제 대상: "${eventToDelete.summary}" (${(selectedItem.similarity * 100).toFixed(1)}% 유사)`);
        
        // Google Calendar 인증 및 삭제 실행
        console.log(`[DELETE DEBUG] 🔐 Google Calendar 인증 중...`);
        const auth = await authorize();
        console.log(`[DELETE DEBUG] ✅ 인증 완료`);
        
        console.log(`[DELETE DEBUG] 🗑️ Google Calendar에서 일정 삭제 중... ID: ${eventToDelete.id}`);
        await deleteEvent(auth, eventToDelete.id);
        
        // 세션 삭제 (사용 완료)
        deleteSessions.delete(sessionId);
        console.log(`[DELETE DEBUG] 🧹 세션 정리 완료: ${sessionId}`);
        
        // 삭제된 일정 정보 포맷팅
        const startDate = new Date(eventToDelete.start.dateTime || eventToDelete.start.date);
        const dateStr = startDate.toLocaleDateString('ko-KR', {
            month: 'numeric',
            day: 'numeric',
            weekday: 'short'
        });
        
        const timeStr = eventToDelete.start.dateTime ? 
            startDate.toLocaleTimeString('ko-KR', {
                hour: 'numeric',
                minute: '2-digit',
                hour12: false
            }) : '종일';
        
        const displayTitle = eventToDelete.summary.length > 50 ? 
            eventToDelete.summary.substring(0, 50) + '...' : 
            eventToDelete.summary;
        
        console.log(`[DELETE DEBUG] ✅ 일정 삭제 완료: ${displayTitle} (${dateStr} ${timeStr})`);
        
        return {
            success: true,
            message: `✅ **일정이 삭제되었습니다!**\n\n🗑️ **${dateStr} ${timeStr}** - ${displayTitle}\n*(${(selectedItem.similarity * 100).toFixed(1)}% 유사도로 매칭)*`
        };
        
    } catch (error) {
        console.error(`[DELETE DEBUG] ❌ 일정 삭제 실행 오류:`, error);
        return {
            success: false,
            message: '❌ 일정 삭제 중 오류가 발생했습니다.'
        };
    }
}

/**
 * 삭제 요청을 취소합니다.
 * @param {string} sessionId - 세션 ID
 * @returns {Object} 취소 결과
 */
function cancelScheduleDelete(sessionId) {
    console.log(`[DELETE DEBUG] ❌ 삭제 취소 - 세션: ${sessionId}`);
    
    const sessionData = getDeleteSession(sessionId);
    if (sessionData) {
        deleteSessions.delete(sessionId);
        console.log(`[DELETE DEBUG] 🧹 세션 정리 완료: ${sessionId}`);
    }
    
    return {
        success: true,
        message: '❌ **일정 삭제가 취소되었습니다.**'
    };
}

/**
 * 빠른 일정 삭제 (인터랙티브 UI에서)
 * @param {string} sessionId - 세션 ID
 * @param {number} eventIndex - 이벤트 인덱스
 * @returns {Object} 삭제 결과
 */
async function quickDeleteEvent(sessionId, eventIndex) {
    console.log(`🗑️ 일정 삭제 요청 (${eventIndex}번)`);
    
    try {
        const sessionData = getScheduleSession(sessionId);
        if (!sessionData) {
            return {
                success: false,
                message: '⏰ 세션이 만료되었습니다. 다시 시도해주세요.'
            };
        }
        
        if (eventIndex < 0 || eventIndex >= sessionData.events.length) {
            return {
                success: false,
                message: '❌ 잘못된 선택입니다.'
            };
        }
        
        const eventToDelete = sessionData.events[eventIndex];
        
        // Google Calendar 인증 및 삭제
        const auth = await authorize();
        await deleteEvent(auth, eventToDelete.id);
        
        // 세션에서 해당 이벤트 제거
        sessionData.events.splice(eventIndex, 1);
        saveScheduleSession(sessionId, sessionData);
        
        const startDate = new Date(eventToDelete.start.dateTime || eventToDelete.start.date);
        const dateStr = startDate.toLocaleDateString('ko-KR', {
            month: 'numeric',
            day: 'numeric',
            weekday: 'short'
        });
        
        const timeStr = eventToDelete.start.dateTime ? 
            startDate.toLocaleTimeString('ko-KR', {
                hour: 'numeric',
                minute: '2-digit',
                hour12: false
            }) : '종일';
        
        console.log(`✅ 일정 삭제 완료: ${eventToDelete.summary}`);
        
        return {
            success: true,
            message: `✅ **일정이 삭제되었습니다!**\n\n🗑️ **${dateStr} ${timeStr}** - ${eventToDelete.summary}`
        };
        
    } catch (error) {
        console.error(`❌ 일정 삭제 오류:`, error.message);
        return {
            success: false,
            message: '❌ 일정 삭제 중 오류가 발생했습니다.'
        };
    }
}

/**
 * 일정 수정을 위한 모달 생성
 * @param {string} sessionId - 세션 ID
 * @param {number} eventIndex - 이벤트 인덱스
 * @returns {Object} 모달 정보
 */
function createEditModal(sessionId, eventIndex) {
    console.log(`[EDIT DEBUG] ✏️ 수정 모달 생성 - 세션: ${sessionId}, 인덱스: ${eventIndex}`);
    
    const sessionData = getScheduleSession(sessionId);
    if (!sessionData) {
        return {
            success: false,
            message: '⏰ 세션이 만료되었습니다. 다시 시도해주세요.'
        };
    }
    
    if (eventIndex < 0 || eventIndex >= sessionData.events.length) {
        return {
            success: false,
            message: '❌ 잘못된 선택입니다.'
        };
    }
    
    const event = sessionData.events[eventIndex];
    const startDate = new Date(event.start.dateTime || event.start.date);
    const endDate = new Date(event.end.dateTime || event.end.date);
    
    // 현재 일정 정보 포맷팅
    const year = startDate.getFullYear();
    const month = String(startDate.getMonth() + 1).padStart(2, '0');
    const day = String(startDate.getDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`;
    
    const startTimeStr = event.start.dateTime ? 
        `${String(startDate.getHours()).padStart(2, '0')}:${String(startDate.getMinutes()).padStart(2, '0')}` : '';
    const endTimeStr = event.end.dateTime ? 
        `${String(endDate.getHours()).padStart(2, '0')}:${String(endDate.getMinutes()).padStart(2, '0')}` : '';
    
    const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
    
    const modal = new ModalBuilder()
        .setCustomId(`edit_modal_${sessionId}_${eventIndex}`)
        .setTitle('일정 수정');
    
    // 제목 입력
    const titleInput = new TextInputBuilder()
        .setCustomId('title')
        .setLabel('일정 제목')
        .setStyle(TextInputStyle.Short)
        .setValue(event.summary)
        .setRequired(true);
    
    // 날짜 입력
    const dateInput = new TextInputBuilder()
        .setCustomId('date')
        .setLabel('날짜 (YYYY-MM-DD)')
        .setStyle(TextInputStyle.Short)
        .setValue(dateStr)
        .setRequired(true);
    
    // 시작 시간 입력
    const startTimeInput = new TextInputBuilder()
        .setCustomId('start_time')
        .setLabel('시작 시간')
        .setStyle(TextInputStyle.Short)
        .setValue(startTimeStr)
        .setPlaceholder('09:30 또는 9시 30분 (종일일정은 비워두세요)')
        .setRequired(false);
    
    // 종료 시간 입력
    const endTimeInput = new TextInputBuilder()
        .setCustomId('end_time')
        .setLabel('종료 시간')
        .setStyle(TextInputStyle.Short)
        .setValue(endTimeStr)
        .setPlaceholder('10:30 또는 10시 30분 (종일일정은 비워두세요)')
        .setRequired(false);
    
    // 설명 입력
    const descriptionInput = new TextInputBuilder()
        .setCustomId('description')
        .setLabel('설명 (선택사항)')
        .setStyle(TextInputStyle.Paragraph)
        .setValue(event.description || '')
        .setRequired(false);
    
    // ActionRow에 입력 필드 추가
    const firstActionRow = new ActionRowBuilder().addComponents(titleInput);
    const secondActionRow = new ActionRowBuilder().addComponents(dateInput);
    const thirdActionRow = new ActionRowBuilder().addComponents(startTimeInput);
    const fourthActionRow = new ActionRowBuilder().addComponents(endTimeInput);
    const fifthActionRow = new ActionRowBuilder().addComponents(descriptionInput);
    
    modal.addComponents(firstActionRow, secondActionRow, thirdActionRow, fourthActionRow, fifthActionRow);
    
    console.log(`[EDIT DEBUG] ✅ 수정 모달 생성 완료: ${event.summary}`);
    
    return {
        success: true,
        modal: modal,
        eventData: event
    };
}

/**
 * 일정 수정 실행
 * @param {string} sessionId - 세션 ID
 * @param {number} eventIndex - 이벤트 인덱스
 * @param {Object} formData - 수정된 폼 데이터
 * @returns {Object} 수정 결과
 */
async function executeEventUpdate(sessionId, eventIndex, formData) {
    console.log(`[EDIT DEBUG] 💾 일정 수정 실행 - 세션: ${sessionId}, 인덱스: ${eventIndex}`);
    console.log(`[EDIT DEBUG] 📝 수정 데이터:`, formData);
    
    try {
        const sessionData = getScheduleSession(sessionId);
        if (!sessionData) {
            return {
                success: false,
                message: '⏰ 세션이 만료되었습니다. 다시 시도해주세요.'
            };
        }
        
        if (eventIndex < 0 || eventIndex >= sessionData.events.length) {
            return {
                success: false,
                message: '❌ 잘못된 선택입니다.'
            };
        }
        
        const originalEvent = sessionData.events[eventIndex];
        
        // 시간 형식 검증 및 정규화 함수
        function normalizeTime(timeStr) {
            if (!timeStr) return '';
            
            // 다양한 시간 형식을 HH:MM으로 변환
            let normalized = timeStr.trim();
            
            console.log(`[TIME DEBUG] 원본 입력: "${timeStr}" -> 정규화 시작: "${normalized}"`);
            
            // "9시 20분" -> "09:20"
            normalized = normalized.replace(/(\d{1,2})시\s*(\d{1,2})분?/g, (match, hour, minute) => {
                const result = `${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`;
                console.log(`[TIME DEBUG] "${match}" -> "${result}"`);
                return result;
            });
            
            // "9시 반" -> "09:30"
            normalized = normalized.replace(/(\d{1,2})시\s*반/g, (match, hour) => {
                const result = `${hour.padStart(2, '0')}:30`;
                console.log(`[TIME DEBUG] "${match}" -> "${result}"`);
                return result;
            });
            
            // "9시" -> "09:00"
            normalized = normalized.replace(/(\d{1,2})시$/g, (match, hour) => {
                const result = `${hour.padStart(2, '0')}:00`;
                console.log(`[TIME DEBUG] "${match}" -> "${result}"`);
                return result;
            });
            
            // "오전 9시", "오후 2시" 처리
            normalized = normalized.replace(/오전\s*(\d{1,2})시/g, (match, hour) => {
                const result = `${hour.padStart(2, '0')}:00`;
                console.log(`[TIME DEBUG] "${match}" -> "${result}"`);
                return result;
            });
            
            normalized = normalized.replace(/오후\s*(\d{1,2})시/g, (match, hour) => {
                const hourNum = parseInt(hour);
                const hour24 = hourNum === 12 ? 12 : hourNum + 12;
                const result = `${String(hour24).padStart(2, '0')}:00`;
                console.log(`[TIME DEBUG] "${match}" -> "${result}"`);
                return result;
            });
            
            // "9:20" -> "09:20" (시간이 한 자리인 경우)
            normalized = normalized.replace(/^(\d):(\d{1,2})$/, (match, hour, minute) => {
                const result = `0${hour}:${minute.padStart(2, '0')}`;
                console.log(`[TIME DEBUG] "${match}" -> "${result}"`);
                return result;
            });
            
            // "9.20" -> "09:20" (점으로 구분된 경우)
            normalized = normalized.replace(/^(\d{1,2})\.(\d{1,2})$/, (match, hour, minute) => {
                const result = `${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`;
                console.log(`[TIME DEBUG] "${match}" -> "${result}"`);
                return result;
            });
            
            // "930" -> "09:30" (4자리 숫자)
            if (/^\d{3,4}$/.test(normalized)) {
                const timeNum = normalized.padStart(4, '0');
                const hour = timeNum.substring(0, 2);
                const minute = timeNum.substring(2, 4);
                const result = `${hour}:${minute}`;
                console.log(`[TIME DEBUG] "${normalized}" -> "${result}"`);
                normalized = result;
            }
            
            // "9" -> "09:00" (숫자만 있는 경우)
            else if (/^\d{1,2}$/.test(normalized)) {
                const result = `${normalized.padStart(2, '0')}:00`;
                console.log(`[TIME DEBUG] "${normalized}" -> "${result}"`);
                normalized = result;
            }
            
            console.log(`[TIME DEBUG] 최종 결과: "${normalized}"`);
            return normalized;
        }
        
        // 날짜 형식 검증
        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
        if (!dateRegex.test(formData.date)) {
            return {
                success: false,
                message: '❌ 날짜 형식이 올바르지 않습니다. YYYY-MM-DD 형식으로 입력해주세요.'
            };
        }
        
        // 시간 정규화
        const normalizedStartTime = normalizeTime(formData.start_time);
        const normalizedEndTime = normalizeTime(formData.end_time);
        
        // 시간 형식 검증 (HH:MM)
        const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
        if (normalizedStartTime && !timeRegex.test(normalizedStartTime)) {
            return {
                success: false,
                message: '❌ 시작 시간 형식이 올바르지 않습니다. HH:MM 형식으로 입력해주세요.'
            };
        }
        
        if (normalizedEndTime && !timeRegex.test(normalizedEndTime)) {
            return {
                success: false,
                message: '❌ 종료 시간 형식이 올바르지 않습니다. HH:MM 형식으로 입력해주세요.'
            };
        }
        
        // 수정된 이벤트 데이터 구성
        const updatedEvent = {
            summary: formData.title,
            description: formData.description || ''
        };
        
        // 날짜/시간 처리
        if (normalizedStartTime && normalizedEndTime) {
            // 시간이 지정된 일정
            const startDateTime = `${formData.date}T${normalizedStartTime}:00+09:00`;
            const endDateTime = `${formData.date}T${normalizedEndTime}:00+09:00`;
            
            updatedEvent.start = {
                dateTime: startDateTime,
                timeZone: 'Asia/Seoul'
            };
            updatedEvent.end = {
                dateTime: endDateTime,
                timeZone: 'Asia/Seoul'
            };
        } else {
            // 종일 일정
            updatedEvent.start = {
                date: formData.date
            };
            updatedEvent.end = {
                date: formData.date
            };
        }
        
        // Google Calendar 업데이트
        const auth = await authorize();
        const result = await updateEvent(auth, originalEvent.id, updatedEvent);
        
        // 세션의 이벤트 정보도 업데이트
        sessionData.events[eventIndex] = result;
        saveScheduleSession(sessionId, sessionData);
        
        const startDate = new Date(result.start.dateTime || result.start.date);
        const dateStr = startDate.toLocaleDateString('ko-KR', {
            month: 'numeric',
            day: 'numeric',
            weekday: 'short'
        });
        
        const timeStr = result.start.dateTime ? 
            startDate.toLocaleTimeString('ko-KR', {
                hour: 'numeric',
                minute: '2-digit',
                hour12: false
            }) : '종일';
        
        console.log(`[EDIT DEBUG] ✅ 일정 수정 완료: ${result.summary}`);
        
        return {
            success: true,
            message: `✅ **일정이 수정되었습니다!**\n\n📝 **${dateStr} ${timeStr}** - ${result.summary}`
        };
        
    } catch (error) {
        console.error(`[EDIT DEBUG] ❌ 일정 수정 오류:`, error);
        return {
            success: false,
            message: '❌ 일정 수정 중 오류가 발생했습니다.'
        };
    }
}

/**
 * 일정을 추가합니다.
 * @param {string} input - 일정 추가 요청 텍스트
 * @returns {Object} 추가 결과
 */
async function addScheduleEvent(input) {
    console.log(`[SCHEDULE DEBUG] ➕ 일정 추가 시작 - 입력: "${input}"`);
    
    try {
        console.log(`[SCHEDULE DEBUG] 🔐 Google Calendar 인증 중...`);
        const auth = await authorize();
        console.log(`[SCHEDULE DEBUG] ✅ 인증 완료`);
        
        const eventData = await parseEventWithGemini(input);
        
        if (!eventData || !eventData.summary) {
            console.log(`[SCHEDULE DEBUG] ❌ 이벤트 데이터 파싱 실패`);
            return {
                success: false,
                message: '일정을 이해하지 못했어요. 좀 더 명확하게 말씀해주시겠어요? (예: 내일 오후 3시 팀 회의)'
            };
        }

        console.log(`[SCHEDULE DEBUG] 📅 Google Calendar에 이벤트 추가 중...`);
        console.log(`[SCHEDULE DEBUG] 📋 이벤트 데이터:`, eventData);
        
        const newEvent = await addEvent(auth, eventData);
        
        // 종일 일정과 시간 지정 일정 구분 처리
        let startDate, dateStr, timeStr;
        
        if (newEvent.start.dateTime) {
            // 시간 지정 일정
            startDate = new Date(newEvent.start.dateTime);
            dateStr = startDate.toLocaleDateString('ko-KR', {
                month: 'numeric',
                day: 'numeric',
                weekday: 'short'
            });
            timeStr = startDate.toLocaleTimeString('ko-KR', {
                hour: 'numeric',
                minute: '2-digit',
                hour12: false
            });
        } else if (newEvent.start.date) {
            // 종일 일정
            startDate = new Date(newEvent.start.date + 'T00:00:00');
            dateStr = startDate.toLocaleDateString('ko-KR', {
                month: 'numeric',
                day: 'numeric',
                weekday: 'short'
            });
            timeStr = '종일';
        } else {
            // 예외 처리
            dateStr = '날짜 미상';
            timeStr = '시간 미상';
        }
        
        // 일정 제목 길이 제한
        const maxTitleLength = 30;
        const displayTitle = newEvent.summary.length > maxTitleLength ? 
            newEvent.summary.substring(0, maxTitleLength) + '...' : 
            newEvent.summary;
        
        console.log(`[SCHEDULE DEBUG] ✅ 일정 추가 완료 - ID: ${newEvent.id}`);
        console.log(`[SCHEDULE DEBUG] 📌 추가된 일정: ${displayTitle} (${dateStr} ${timeStr})`);
        
        return {
            success: true,
            message: `✅ ${dateStr} ${timeStr} - ${displayTitle} 일정이 추가되었습니다.`
        };
    } catch (error) {
        console.error(`[SCHEDULE DEBUG] ❌ 일정 추가 오류:`, error);
        return {
            success: false,
            message: '일정 추가 중 오류가 발생했습니다.'
        };
    }
}

/**
 * 자연어로 일정을 처리합니다 (조회 또는 추가)
 * @param {string} text - 사용자 입력 텍스트
 * @param {Object} classification - 분류 결과 (LLM에서 추출한 정보 포함)
 * @returns {Object} 처리 결과
 */
async function processNaturalSchedule(text, classification) {
    console.log(`[SCHEDULE DEBUG] 🔄 자연어 일정 처리 시작 - 입력: "${text}"`);
    console.log(`[SCHEDULE DEBUG] 🧠 LLM 분류 정보:`, classification);
    
    try {
        // LLM이 추출한 일정 타입과 정보 사용
        const scheduleType = classification.extractedInfo?.scheduleType || 'query'; // 기본값: 조회
        const extractedInfo = classification.extractedInfo || {};
        
        console.log(`[SCHEDULE DEBUG] 📋 일정 타입: ${scheduleType}`);
        console.log(`[SCHEDULE DEBUG] 📊 추출된 정보:`, extractedInfo);
        
        if (scheduleType === 'query') {
            // 일정 조회 - 인터랙티브 UI 사용
            const period = extractedInfo.period || '오늘';
            console.log(`[SCHEDULE DEBUG] 📅 조회 기간: "${period}"`);
            console.log(`[SCHEDULE DEBUG] ➡️ 인터랙티브 일정 조회 모드로 진행`);
            
            // 사용자 ID 추출 (classification.sessionData에서)
            const userId = classification.sessionData?.userId;
            return await getInteractiveSchedule(period, userId);
        } else if (scheduleType === 'add') {
            // 일정 추가 - LLM이 모든 파라미터를 스마트하게 추출
            console.log(`[SCHEDULE DEBUG] 📝 원본 텍스트: "${text}"`);
            console.log(`[SCHEDULE DEBUG] 📝 GPT-4o 추출 내용: "${extractedInfo.content || '없음'}"`);
            console.log(`[SCHEDULE DEBUG] ➡️ 일정 추가 모드로 진행 (Gemini가 정확한 시간 파싱 수행)`);
            
            // 원본 텍스트를 직접 처리
            return await addScheduleEvent(text);
        } else if (scheduleType === 'delete') {
            // 일정 삭제
            console.log(`[SCHEDULE DEBUG] 🗑️ 일정 삭제 요청`);
            console.log(`[SCHEDULE DEBUG] 📝 원본 텍스트: "${text}"`);
            console.log(`[SCHEDULE DEBUG] ➡️ 일정 삭제 모드로 진행`);
            
            return await deleteScheduleEvent(text);
        } else {
            // 기본값: 일정 추가
            console.log(`[SCHEDULE DEBUG] ➡️ 기본 일정 추가 모드로 진행`);
            return await addScheduleEvent(text);
        }
        
    } catch (error) {
        console.error(`[SCHEDULE DEBUG] ❌ 자연어 일정 처리 오류:`, error);
        return {
            success: false,
            message: '일정 처리 중 오류가 발생했습니다. `/myschedule` 명령어를 사용해보세요.'
        };
    }
}

/**
 * 메시지 객체와 분류 결과를 기반으로 적절한 스케줄 관련 함수를 호출하는 메인 핸들러
 * @param {Message} message - Discord 메시지 객체
 * @param {Object} classification - 분류기에서 반환된 분류 정보
 * @returns {Promise<string|Object>} 처리 결과 메시지 또는 객체
 */
async function handleScheduleRequest(message, classification, userInput) {
    const { extractedInfo } = classification;
    const scheduleType = extractedInfo?.scheduleType || 'query';
    const textToProcess = userInput || message.content;

    console.log(`🚀 스케줄 요청 처리 시작`);
    console.log(`🎯 scheduleType: '${scheduleType}'`);

    try {
        let result;
        switch (scheduleType) {
            case 'query':
                const period = extractedInfo.period || '오늘';
                result = await getInteractiveSchedule(period, message.author.id);
                if (result.success) {
                    await message.reply({ content: result.message, components: result.components || [] });
                    return result.message;
                } else {
                    await message.reply(result.message);
                    return result.message;
                }
            case 'add':
                result = await addScheduleEvent(textToProcess);
                 await message.reply(result.message);
                return result.message;
            case 'delete':
                result = await deleteScheduleEvent(textToProcess, message.author.id);
                if (result.success) {
                    await message.reply({ content: result.message, components: result.components || [] });
                    return result.message;
                } else {
                    await message.reply(result.message);
                    return result.message;
                }
            default:
                // 혹시 모를 예외 처리: scheduleType이 없으면 Gemini 파싱 시도
                console.log(`⚠️ scheduleType 없음 - 자연어 처리 시도`);
                result = await addScheduleEvent(textToProcess);
                await message.reply(result.message);
                return result.message;
        }
    } catch (error) {
        console.error(`❌ 스케줄 처리 오류:`, error.message);
        await message.reply('죄송합니다. 일정 처리 중 오류가 발생했습니다.');
        return '일정 처리 오류';
    }
}


module.exports = {
    parseEventWithGemini,
    getTimeRangeFromPeriod,
    getScheduleSummary,
    getInteractiveSchedule,
    addScheduleEvent,
    deleteScheduleEvent,
    executeScheduleDelete,
    cancelScheduleDelete,
    quickDeleteEvent,
    createEditModal,
    executeEventUpdate,
    processNaturalSchedule,
    calculateSimilarity,
    parseDeleteRequest,
    saveDeleteSession,
    getDeleteSession,
    saveScheduleSession,
    getScheduleSession,
    handleScheduleRequest,
};
