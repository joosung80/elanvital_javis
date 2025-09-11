/**
 * YouTube 기능 테스트 스크립트
 */

const { classifyUserInput } = require('./src/classifier');
const { processYouTubeVideo, extractVideoId, isValidYouTubeUrl } = require('./src/utils/youtubeHandler');

// 테스트용 메시지 객체 생성
function createTestMessage(content) {
    return {
        content: content,
        author: { id: 'test-user' },
        attachments: new Map()
    };
}

// 테스트용 클라이언트 객체 생성
function createTestClient() {
    return {
        memory: {
            getUserMemory: () => ({ lastImageUrl: null, lastDocument: null }),
            getRecentConversations: () => new Map()
        }
    };
}

async function testYouTubeClassification() {
    console.log('🧪 YouTube 분류 테스트 시작\n');
    
    const testCases = [
        'https://www.youtube.com/watch?v=vuckM1d9Ez4',
        'https://youtu.be/vuckM1d9Ez4',
        '유튜브 링크 https://www.youtube.com/watch?v=vuckM1d9Ez4 요약해주세요',
        '유튜브:https://youtu.be/vuckM1d9Ez4',
        'youtube:https://www.youtube.com/watch?v=vuckM1d9Ez4',
        '@https://www.youtube.com/watch?v=vuckM1d9Ez4'
    ];
    
    for (const testCase of testCases) {
        console.log(`📝 테스트 케이스: "${testCase}"`);
        
        try {
            const message = createTestMessage(testCase);
            const client = createTestClient();
            const result = await classifyUserInput(message, client);
            
            console.log(`✅ 분류 결과:`, {
                category: result.category,
                youtubeUrl: result.extractedInfo?.youtubeUrl,
                videoId: result.extractedInfo?.videoId,
                action: result.extractedInfo?.action
            });
            
        } catch (error) {
            console.error(`❌ 분류 실패:`, error.message);
        }
        
        console.log('---');
    }
}

async function testYouTubeUtils() {
    console.log('\n🧪 YouTube 유틸리티 테스트 시작\n');
    
    const testUrls = [
        'https://www.youtube.com/watch?v=vuckM1d9Ez4',
        'https://youtu.be/vuckM1d9Ez4',
        'https://www.youtube.com/embed/vuckM1d9Ez4',
        'https://www.youtube.com/v/vuckM1d9Ez4',
        'invalid-url',
        'https://example.com/video'
    ];
    
    for (const url of testUrls) {
        console.log(`📝 URL 테스트: "${url}"`);
        
        const isValid = isValidYouTubeUrl(url);
        const videoId = extractVideoId(url);
        
        console.log(`✅ 유효성: ${isValid}, 비디오 ID: ${videoId || 'null'}`);
        console.log('---');
    }
}

async function testYouTubeProcessing() {
    console.log('\n🧪 YouTube 처리 테스트 시작\n');
    
    // 환경변수 확인
    if (!process.env.GEMINI_API_KEY) {
        console.log('⚠️  GEMINI_API_KEY 환경변수가 설정되지 않았습니다.');
        console.log('   실제 API 호출 테스트를 건너뜁니다.');
        return;
    }
    
    const testUrl = 'https://www.youtube.com/watch?v=vuckM1d9Ez4';
    const videoId = 'vuckM1d9Ez4';
    
    console.log(`📝 처리 테스트: ${testUrl}`);
    
    try {
        console.log('🔄 Gemini API 호출 중...');
        const result = await processYouTubeVideo(testUrl, videoId);
        
        console.log('✅ 처리 완료');
        console.log('📄 결과 길이:', result.length, '자');
        console.log('📄 결과 미리보기:', result.substring(0, 200) + '...');
        
    } catch (error) {
        console.error('❌ 처리 실패:', error.message);
    }
}

async function runAllTests() {
    console.log('🚀 YouTube 기능 전체 테스트 시작\n');
    
    await testYouTubeClassification();
    await testYouTubeUtils();
    await testYouTubeProcessing();
    
    console.log('\n✅ 모든 테스트 완료');
}

// 환경변수 로드
require('dotenv').config();

// 테스트 실행
if (require.main === module) {
    runAllTests().catch(console.error);
}

module.exports = {
    testYouTubeClassification,
    testYouTubeUtils,
    testYouTubeProcessing,
    runAllTests
};

