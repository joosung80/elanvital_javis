// 테스트 환경 설정 로드
require('./test_env');

// 확장된 숏컷 파싱 테스트
console.log('=== 확장된 숏컷 파싱 테스트 ===\n');

const testCases = [
    // 기존 형태
    '일정:차주 5시 원고리뷰',
    '할일:보고서 작성',
    '문서:패스워드',
    
    // # 델리미터 사용
    '일정#추가#차주 5시 원고리뷰',
    '할일#완료#CJ강연',
    '문서#패스워드#넷플릭스',
    
    // 순서 바뀐 형태
    '할일#CJ강연#완료',
    '일정#차주 5시 원고리뷰#추가',
    '문서#넷플릭스#패스워드',
    
    // 다양한 액션
    '할일#조회',
    '일정#삭제#내일 회의',
    '할일#수정#프로젝트 계획'
];

testCases.forEach((test, index) => {
    console.log(`${index + 1}. "${test}"`);
    
    // 토큰 분할
    const delimiters = /[:\s,\t\-—#]/;
    const tokens = test.split(delimiters).map(token => token.trim()).filter(token => token.length > 0);
    
    console.log(`   토큰: [${tokens.join(', ')}]`);
    
    if (tokens.length >= 2) {
        const command = tokens[0].toLowerCase();
        const remainingTokens = tokens.slice(1);
        
        // 액션 키워드 찾기
        const actionKeywords = {
            '추가': ['추가', 'add', '등록', '생성', '만들기'],
            '완료': ['완료', 'complete', '끝', '완성', '체크'],
            '삭제': ['삭제', 'delete', '제거', '지우기'],
            '수정': ['수정', 'edit', '변경', '업데이트'],
            '조회': ['조회', 'query', '보기', '목록', '리스트']
        };
        
        let detectedAction = null;
        const contentTokens = [];
        
        for (const token of remainingTokens) {
            let isAction = false;
            for (const [action, synonyms] of Object.entries(actionKeywords)) {
                if (synonyms.some(synonym => token.toLowerCase().includes(synonym))) {
                    detectedAction = action;
                    isAction = true;
                    break;
                }
            }
            if (!isAction) {
                contentTokens.push(token);
            }
        }
        
        if (!detectedAction) {
            detectedAction = '추가';
        }
        
        const content = contentTokens.join(' ').trim();
        
        console.log(`   명령어: ${command}`);
        console.log(`   액션: ${detectedAction}`);
        console.log(`   내용: "${content}"`);
        
        // 결과 시뮬레이션
        if (command === '할일') {
            console.log(`   → TASK: taskType="${detectedAction === '추가' ? 'add' : detectedAction === '완료' ? 'complete' : detectedAction === '조회' ? 'query' : 'add'}", content="${content}"`);
        } else if (command === '일정') {
            console.log(`   → SCHEDULE: scheduleType="${detectedAction === '추가' ? 'add' : detectedAction === '삭제' ? 'delete' : detectedAction === '조회' ? 'query' : 'add'}", content="${content}"`);
        } else if (command === '문서') {
            const parts = contentTokens;
            if (parts.length >= 2) {
                console.log(`   → DRIVE: searchKeyword="${parts[0]}", inDocumentKeyword="${parts.slice(1).join(' ')}"`);
            } else {
                console.log(`   → DRIVE: searchKeyword="${content}"`);
            }
        }
    }
    
    console.log('');
});
