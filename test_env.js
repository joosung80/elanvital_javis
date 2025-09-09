/**
 * 테스트 환경 설정 파일
 * 모든 테스트 파일에서 이 파일을 먼저 require하여 환경 변수를 로드
 */

// dotenv 로드
require('dotenv').config();

console.log('🔧 테스트 환경 설정 완료');
console.log('📋 환경 변수 상태:');
console.log('  - OPENAI_API_KEY:', process.env.OPENAI_API_KEY ? '✅ 설정됨' : '❌ 없음');
console.log('  - GEMINI_API_KEY:', process.env.GEMINI_API_KEY ? '✅ 설정됨' : '❌ 없음');
console.log('  - DISCORD_TOKEN:', process.env.DISCORD_TOKEN ? '✅ 설정됨' : '❌ 없음');

module.exports = {
    // 환경 변수 검증 함수
    validateEnv: () => {
        const required = ['OPENAI_API_KEY', 'GEMINI_API_KEY', 'DISCORD_TOKEN'];
        const missing = required.filter(key => !process.env[key]);
        
        if (missing.length > 0) {
            throw new Error(`필수 환경 변수가 설정되지 않았습니다: ${missing.join(', ')}`);
        }
        
        return true;
    },
    
    // 테스트용 환경 변수 출력
    logEnvStatus: () => {
        console.log('\n=== 환경 변수 상태 ===');
        console.log('OPENAI_API_KEY:', process.env.OPENAI_API_KEY ? `${process.env.OPENAI_API_KEY.substring(0, 20)}...` : 'NOT SET');
        console.log('GEMINI_API_KEY:', process.env.GEMINI_API_KEY ? `${process.env.GEMINI_API_KEY.substring(0, 20)}...` : 'NOT SET');
        console.log('DISCORD_TOKEN:', process.env.DISCORD_TOKEN ? `${process.env.DISCORD_TOKEN.substring(0, 20)}...` : 'NOT SET');
        console.log('========================\n');
    }
};
