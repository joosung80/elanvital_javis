/**
 * 날짜 계산 유틸리티 함수들
 * 상대적 날짜 표현을 정확한 날짜로 변환
 */

/**
 * 상대적 날짜 표현을 정확한 날짜로 변환
 * @param {string} period - "차주 5시", "다음주 월요일 3시" 등
 * @returns {Object} { date: Date, time: string, isAllDay: boolean }
 */
function parseRelativeDate(period) {
    console.log(`📅 상대적 날짜 파싱: "${period}"`);
    
    const now = new Date();
    const koreaTime = new Date(now.getTime() + (9 * 60 * 60 * 1000)); // UTC+9
    
    console.log(`📅 현재 한국 시간: ${koreaTime.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}`);
    console.log(`📅 현재 날짜: ${koreaTime.getFullYear()}년 ${koreaTime.getMonth() + 1}월 ${koreaTime.getDate()}일 (${getKoreanWeekday(koreaTime)})`);
    
    let targetDate = new Date(koreaTime);
    let timeString = null;
    let isAllDay = false;
    
    // 시간 정보 추출
    const timeMatch = period.match(/(오전|오후)?\s*(\d{1,2})시(\d{1,2}분)?/);
    if (timeMatch) {
        const meridiem = timeMatch[1]; // 오전/오후
        const hour = parseInt(timeMatch[2]);
        const minute = timeMatch[3] ? parseInt(timeMatch[3].replace('분', '')) : 0;
        
        let finalHour = hour;
        if (meridiem === '오전') {
            finalHour = hour === 12 ? 0 : hour;
        } else if (meridiem === '오후') {
            finalHour = hour === 12 ? 12 : hour + 12;
        } else {
            // 오전/오후 명시 안됨 - 일반적인 해석
            if (hour >= 1 && hour <= 7) {
                finalHour = hour + 12; // 오후로 해석
            } else {
                finalHour = hour;
            }
        }
        
        timeString = `${finalHour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
        console.log(`⏰ 추출된 시간: ${hour}시${minute > 0 ? minute + '분' : ''} → ${timeString} (${meridiem || '자동판단'})`);
    } else {
        isAllDay = true;
        console.log(`📅 시간 정보 없음 - 종일 일정으로 처리`);
    }
    
    // 날짜 계산
    if (period.includes('차차주')) {
        // 차차주 (2주 후) 계산
        const daysToAdd = 14;
        targetDate.setDate(targetDate.getDate() + daysToAdd);
        console.log(`📅 차차주: +${daysToAdd}일 → ${targetDate.getFullYear()}년 ${targetDate.getMonth() + 1}월 ${targetDate.getDate()}일 (${getKoreanWeekday(targetDate)})`);
        
        // 특정 요일 지정된 경우
        const weekdayMatch = period.match(/(월요일|화요일|수요일|목요일|금요일|토요일|일요일)/);
        if (weekdayMatch) {
            const targetWeekday = getWeekdayNumber(weekdayMatch[1]);
            const currentWeekday = targetDate.getDay();
            
            // 차차주의 해당 요일로 조정
            const targetWeekMonday = new Date(targetDate);
            targetWeekMonday.setDate(targetDate.getDate() - (currentWeekday === 0 ? 6 : currentWeekday - 1));
            targetWeekMonday.setDate(targetWeekMonday.getDate() + (targetWeekday === 0 ? 6 : targetWeekday - 1));
            
            targetDate = targetWeekMonday;
            console.log(`📅 차차주 ${weekdayMatch[1]} 지정 → ${targetDate.getFullYear()}년 ${targetDate.getMonth() + 1}월 ${targetDate.getDate()}일 (${getKoreanWeekday(targetDate)})`);
        }
    } else if (period.match(/(\d+)주\s*(후|뒤)/)) {
        // N주 후/뒤 계산
        const weeksMatch = period.match(/(\d+)주\s*(후|뒤)/);
        const weeksToAdd = parseInt(weeksMatch[1]);
        const daysToAdd = weeksToAdd * 7;
        targetDate.setDate(targetDate.getDate() + daysToAdd);
        console.log(`📅 ${weeksToAdd}주 후: +${daysToAdd}일 → ${targetDate.getFullYear()}년 ${targetDate.getMonth() + 1}월 ${targetDate.getDate()}일 (${getKoreanWeekday(targetDate)})`);
        
        // 특정 요일 지정된 경우
        const weekdayMatch = period.match(/(월요일|화요일|수요일|목요일|금요일|토요일|일요일)/);
        if (weekdayMatch) {
            const targetWeekday = getWeekdayNumber(weekdayMatch[1]);
            const currentWeekday = targetDate.getDay();
            
            // N주 후의 해당 요일로 조정
            const targetWeekMonday = new Date(targetDate);
            targetWeekMonday.setDate(targetDate.getDate() - (currentWeekday === 0 ? 6 : currentWeekday - 1));
            targetWeekMonday.setDate(targetWeekMonday.getDate() + (targetWeekday === 0 ? 6 : targetWeekday - 1));
            
            targetDate = targetWeekMonday;
            console.log(`📅 ${weeksToAdd}주 후 ${weekdayMatch[1]} 지정 → ${targetDate.getFullYear()}년 ${targetDate.getMonth() + 1}월 ${targetDate.getDate()}일 (${getKoreanWeekday(targetDate)})`);
        }
    } else if (period.includes('차주') || period.includes('다음주')) {
        // 다음주 계산
        const daysToAdd = 7;
        targetDate.setDate(targetDate.getDate() + daysToAdd);
        console.log(`📅 차주/다음주: +${daysToAdd}일 → ${targetDate.getFullYear()}년 ${targetDate.getMonth() + 1}월 ${targetDate.getDate()}일 (${getKoreanWeekday(targetDate)})`);
        
        // 특정 요일 지정된 경우
        const weekdayMatch = period.match(/(월요일|화요일|수요일|목요일|금요일|토요일|일요일)/);
        if (weekdayMatch) {
            const targetWeekday = getWeekdayNumber(weekdayMatch[1]);
            const currentWeekday = targetDate.getDay();
            const daysToWeekday = (targetWeekday - currentWeekday + 7) % 7;
            
            // 다음주의 해당 요일로 조정
            const nextWeekMonday = new Date(targetDate);
            nextWeekMonday.setDate(targetDate.getDate() - (currentWeekday === 0 ? 6 : currentWeekday - 1));
            nextWeekMonday.setDate(nextWeekMonday.getDate() + (targetWeekday === 0 ? 6 : targetWeekday - 1));
            
            targetDate = nextWeekMonday;
            console.log(`📅 ${weekdayMatch[1]} 지정 → ${targetDate.getFullYear()}년 ${targetDate.getMonth() + 1}월 ${targetDate.getDate()}일 (${getKoreanWeekday(targetDate)})`);
        }
    } else if (period.includes('이번주')) {
        // 이번주 계산
        const weekdayMatch = period.match(/(월요일|화요일|수요일|목요일|금요일|토요일|일요일)/);
        if (weekdayMatch) {
            const targetWeekday = getWeekdayNumber(weekdayMatch[1]);
            const currentWeekday = targetDate.getDay();
            
            // 이번주의 해당 요일로 조정
            const thisWeekTarget = new Date(targetDate);
            thisWeekTarget.setDate(targetDate.getDate() - (currentWeekday === 0 ? 6 : currentWeekday - 1));
            thisWeekTarget.setDate(thisWeekTarget.getDate() + (targetWeekday === 0 ? 6 : targetWeekday - 1));
            
            targetDate = thisWeekTarget;
            console.log(`📅 이번주 ${weekdayMatch[1]} → ${targetDate.getFullYear()}년 ${targetDate.getMonth() + 1}월 ${targetDate.getDate()}일 (${getKoreanWeekday(targetDate)})`);
        }
    } else if (period.includes('내일')) {
        targetDate.setDate(targetDate.getDate() + 1);
        console.log(`📅 내일 → ${targetDate.getFullYear()}년 ${targetDate.getMonth() + 1}월 ${targetDate.getDate()}일 (${getKoreanWeekday(targetDate)})`);
    } else if (period.includes('모레')) {
        targetDate.setDate(targetDate.getDate() + 2);
        console.log(`📅 모레 → ${targetDate.getFullYear()}년 ${targetDate.getMonth() + 1}월 ${targetDate.getDate()}일 (${getKoreanWeekday(targetDate)})`);
    } else if (period.includes('오늘')) {
        // 오늘 - 날짜 변경 없음
        console.log(`📅 오늘 → ${targetDate.getFullYear()}년 ${targetDate.getMonth() + 1}월 ${targetDate.getDate()}일 (${getKoreanWeekday(targetDate)})`);
    }
    
    // 월 경계 처리 확인
    if (targetDate.getMonth() !== koreaTime.getMonth()) {
        console.log(`🗓️ 월 경계 넘음: ${koreaTime.getMonth() + 1}월 → ${targetDate.getMonth() + 1}월`);
    }
    
    const result = {
        date: targetDate,
        time: timeString,
        isAllDay: isAllDay,
        originalPeriod: period
    };
    
    console.log(`✅ 파싱 완료:`, {
        date: `${targetDate.getFullYear()}-${(targetDate.getMonth() + 1).toString().padStart(2, '0')}-${targetDate.getDate().toString().padStart(2, '0')}`,
        time: timeString,
        isAllDay: isAllDay
    });
    
    return result;
}

/**
 * 한국어 요일을 숫자로 변환
 * @param {string} weekday - "월요일", "화요일" 등
 * @returns {number} 0=일요일, 1=월요일, ..., 6=토요일
 */
function getWeekdayNumber(weekday) {
    const weekdays = {
        '일요일': 0,
        '월요일': 1,
        '화요일': 2,
        '수요일': 3,
        '목요일': 4,
        '금요일': 5,
        '토요일': 6
    };
    return weekdays[weekday] || 0;
}

/**
 * Date 객체를 한국어 요일로 변환
 * @param {Date} date 
 * @returns {string} "월요일", "화요일" 등
 */
function getKoreanWeekday(date) {
    const weekdays = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];
    return weekdays[date.getDay()];
}

/**
 * 파싱된 날짜 정보를 Google Calendar 형식으로 변환
 * @param {Object} parsedDate - parseRelativeDate 결과
 * @returns {Object} Google Calendar 이벤트 객체
 */
function formatForGoogleCalendar(parsedDate, title) {
    const { date, time, isAllDay } = parsedDate;
    
    if (isAllDay) {
        // 종일 일정
        const startDate = new Date(date);
        const endDate = new Date(date);
        endDate.setDate(endDate.getDate() + 1);
        
        return {
            summary: title,
            start: {
                date: startDate.toISOString().split('T')[0]
            },
            end: {
                date: endDate.toISOString().split('T')[0]
            }
        };
    } else {
        // 시간 지정 일정
        const [hour, minute] = time.split(':').map(Number);
        const startDateTime = new Date(date);
        startDateTime.setHours(hour, minute, 0, 0);
        
        const endDateTime = new Date(startDateTime);
        endDateTime.setHours(hour + 1, minute, 0, 0); // 기본 1시간 일정
        
        return {
            summary: title,
            start: {
                dateTime: startDateTime.toISOString(),
                timeZone: 'Asia/Seoul'
            },
            end: {
                dateTime: endDateTime.toISOString(),
                timeZone: 'Asia/Seoul'
            }
        };
    }
}

/**
 * 현재 날짜 기준으로 테스트
 */
function testDateParsing() {
    const testCases = [
        '차주 5시 원고리뷰',
        '다음주 월요일 3시 회의',
        '이번주 금요일 오후 2시 발표',
        '내일 9시 미팅',
        '모레 오전 10시 검토'
    ];
    
    console.log('=== 날짜 파싱 테스트 ===');
    testCases.forEach((test, index) => {
        console.log(`\n${index + 1}. "${test}"`);
        const result = parseRelativeDate(test);
        const calendarEvent = formatForGoogleCalendar(result, test);
        console.log('Google Calendar 형식:', JSON.stringify(calendarEvent, null, 2));
    });
}

module.exports = {
    parseRelativeDate,
    formatForGoogleCalendar,
    getWeekdayNumber,
    getKoreanWeekday,
    testDateParsing
};
