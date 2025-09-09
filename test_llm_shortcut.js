// 테스트 환경 설정 로드
require('./test_env');

const { parseShortcutCommand } = require('./src/classifier.js');

async function testLLMShortcutParsing() {
    console.log('=== LLM 기반 숏컷 파싱 테스트 ===\n');
    
    // 환경 변수 검증
    try {
        const { validateEnv, logEnvStatus } = require('./test_env');
        validateEnv();
        logEnvStatus();
    } catch (error) {
        console.error('❌ 환경 변수 오류:', error.message);
        return;
    }
    
    const testCases = [
        // 기본 케이스
        {
            input: '일정#다음주시#메일정리',
            description: '기본 일정 추가 (단독 시 포함)'
        },
        {
            input: '할일:프로젝트 완료:완료',
            description: '할일 완료 처리'
        },
        {
            input: '이미지:고양이가 산에서 노는 모습',
            description: '이미지 생성'
        },
        
        // 복잡한 케이스 (파라미터 순서 무관)
        {
            input: '일정#완료#차주 화요일 오후 3시 30분#클라이언트 미팅',
            description: '복잡한 일정 완료 (순서 무관)'
        },
        {
            input: '할일:중요:프로젝트 마무리:완료',
            description: '우선순위 포함 할일 완료'
        },
        {
            input: '일정:차주:추가:팀 회의:오후 2시',
            description: '일정 추가 (순서 무관)'
        },
        
        // 자연어 시간 표현
        {
            input: '일정#내일 새벽 2시#긴급 회의#추가',
            description: '자연어 시간 표현'
        },
        {
            input: '일정:다음주 월요일:조회',
            description: '일정 조회'
        },
        
        // 문서 검색
        {
            input: '문서:회의록#키워드 검색',
            description: '문서 검색'
        },
        {
            input: '문서#구글드라이브#프로젝트 문서#검색',
            description: '복잡한 문서 검색'
        }
    ];
    
    let successCount = 0;
    let totalCount = testCases.length;
    
    for (let i = 0; i < testCases.length; i++) {
        const testCase = testCases[i];
        console.log(`\n📝 테스트 ${i + 1}/${totalCount}: ${testCase.description}`);
        console.log(`   입력: "${testCase.input}"`);
        
        try {
            const result = await parseShortcutCommand(testCase.input);
            
            if (result) {
                console.log('✅ 파싱 성공:');
                console.log('   카테고리:', result.category);
                console.log('   추출 정보:', JSON.stringify(result.extractedInfo, null, 4));
                successCount++;
            } else {
                console.log('❌ 파싱 실패 - null 반환');
            }
        } catch (error) {
            console.log('❌ 에러:', error.message);
        }
        
        // 테스트 간 간격
        if (i < testCases.length - 1) {
            console.log('─'.repeat(50));
        }
    }
    
    // 결과 요약
    console.log(`\n\n🎯 테스트 결과 요약:`);
    console.log(`   성공: ${successCount}/${totalCount} (${Math.round(successCount/totalCount*100)}%)`);
    console.log(`   실패: ${totalCount - successCount}/${totalCount}`);
    
    if (successCount === totalCount) {
        console.log('🎉 모든 테스트 통과!');
    } else if (successCount > 0) {
        console.log('⚠️  일부 테스트 실패 - 폴백 시스템 동작 확인 필요');
    } else {
        console.log('💥 모든 테스트 실패 - 설정 문제 확인 필요');
    }
}

// 테스트 실행
testLLMShortcutParsing().catch(console.error);
