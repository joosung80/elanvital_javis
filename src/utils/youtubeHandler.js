/**
 * 유튜브 동영상 처리 핸들러
 * Gemini API를 사용하여 유튜브 동영상의 스크립트를 정리합니다.
 */

const { askGPT } = require('../services/gptService');

/**
 * 유튜브 동영상을 처리하여 스크립트를 정리합니다.
 * @param {string} youtubeUrl - 유튜브 동영상 URL
 * @param {string} videoId - 유튜브 동영상 ID
 * @returns {Promise<string>} 정리된 스크립트
 */
async function processYouTubeVideo(youtubeUrl, videoId) {
    console.log(`🎥 유튜브 동영상 처리 시작: ${youtubeUrl}`);
    
    try {
        // Gemini API를 사용하여 유튜브 동영상 처리
        const result = await processWithGemini(youtubeUrl);
        return result;
        
    } catch (error) {
        console.error('❌ 유튜브 처리 실패:', error);
        throw new Error('유튜브 동영상 처리에 실패했습니다.');
    }
}

/**
 * Gemini API를 사용하여 유튜브 동영상을 처리합니다.
 * @param {string} youtubeUrl - 유튜브 동영상 URL
 * @returns {Promise<string>} 처리 결과
 */
async function processWithGemini(youtubeUrl) {
    console.log(`🤖 Gemini API로 유튜브 처리: ${youtubeUrl}`);
    
    // 환경변수에서 Gemini API 키 확인
    if (!process.env.GEMINI_API_KEY) {
        throw new Error('GEMINI_API_KEY 환경변수가 설정되지 않았습니다.');
    }
    
    try {
        // Gemini API 직접 호출
        const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent', {
            method: 'POST',
            headers: {
                'x-goog-api-key': process.env.GEMINI_API_KEY,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                contents: [{
                    parts: [
                        {
                            text: `다음 유튜브 동영상의 전체 스크립트를 정리해주세요. 
                            
요구사항:
1. 오디오 내용을 정확히 전사(transcribe)해주세요
4. 전체적인 요약을 15줄이내로 단락과 불릿포인트로 해주세요

형식:

## 📋 제목 : 동영상 제목
## 📋 요약
(2줄 요약)
## 주요요점
### 요점1
- 요점1-1 내용
- 요점1-2 내용
### 요점2 
- 요즘2-1 내용
- 요즘2-2 내용
...


한국어로 응답해주세요.`
                        },
                        {
                            file_data: {
                                file_uri: youtubeUrl
                            }
                        }
                    ]
                }]
            })
        });
        
        if (!response.ok) {
            const errorData = await response.text();
            console.error('❌ Gemini API 오류:', errorData);
            throw new Error(`Gemini API 호출 실패: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (!data.candidates || !data.candidates[0] || !data.candidates[0].content) {
            throw new Error('Gemini API 응답 형식 오류');
        }
        
        const result = data.candidates[0].content.parts[0].text;
        console.log('✅ Gemini API 처리 완료');
        
        return result;
        
    } catch (error) {
        console.error('❌ Gemini API 호출 실패:', error);
        
        // 폴백: GPT를 사용한 일반적인 응답
        return await fallbackWithGPT(youtubeUrl);
    }
}

/**
 * Gemini API 실패 시 GPT를 사용한 폴백 처리
 * @param {string} youtubeUrl - 유튜브 동영상 URL
 * @returns {Promise<string>} 폴백 응답
 */
async function fallbackWithGPT(youtubeUrl) {
    console.log('🔄 GPT 폴백 처리');
    
    const systemPrompt = `당신은 유튜브 동영상 분석 전문가입니다. 
사용자가 제공한 유튜브 URL에 대해 도움을 제공하세요.`;
    
    const userPrompt = `다음 유튜브 동영상을 분석해달라고 요청받았습니다: ${youtubeUrl}

현재 Gemini API를 통한 직접 분석이 불가능한 상황입니다. 
다음과 같은 안내를 제공해주세요:

1. 유튜브 동영상 스크립트 정리 서비스에 대한 설명
2. 현재 기술적 제한사항 안내
3. 대안 방법 제안 (예: 동영상 제목이나 설명 기반 도움)
4. 향후 개선 계획

친근하고 도움이 되는 톤으로 한국어로 응답해주세요.`;
    
    try {
        const result = await askGPT('YOUTUBE_FALLBACK', systemPrompt, userPrompt, {
            temperature: 0.7,
            max_tokens: 1000,
            purpose: '유튜브 폴백 응답'
        });
        
        return `🎥 **유튜브 동영상 처리 안내**\n\n${result}`;
        
    } catch (error) {
        console.error('❌ 폴백 처리도 실패:', error);
        return `🎥 **유튜브 동영상 스크립트 정리**\n\n죄송합니다. 현재 유튜브 동영상 처리 서비스에 일시적인 문제가 발생했습니다.\n\n**요청하신 동영상:** ${youtubeUrl}\n\n잠시 후 다시 시도해주시거나, 관리자에게 문의해주세요.`;
    }
}

/**
 * 유튜브 URL에서 비디오 ID를 추출합니다.
 * @param {string} url - 유튜브 URL
 * @returns {string|null} 비디오 ID 또는 null
 */
function extractVideoId(url) {
    const patterns = [
        /(?:https?:\/\/)?(?:www\.)?youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})/,
        /(?:https?:\/\/)?(?:www\.)?youtu\.be\/([a-zA-Z0-9_-]{11})/,
        /(?:https?:\/\/)?(?:www\.)?youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
        /(?:https?:\/\/)?(?:www\.)?youtube\.com\/v\/([a-zA-Z0-9_-]{11})/
    ];
    
    for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match) {
            return match[1];
        }
    }
    
    return null;
}

/**
 * 유튜브 URL이 유효한지 확인합니다.
 * @param {string} url - 확인할 URL
 * @returns {boolean} 유효성 여부
 */
function isValidYouTubeUrl(url) {
    return extractVideoId(url) !== null;
}

/**
 * 유튜브 요청을 처리하는 메인 핸들러
 * @param {Object} message - Discord 메시지 객체
 * @param {Object} classification - 분류 결과
 */
async function handleYouTubeRequest(message, classification) {
    console.log('🎥 유튜브 요청 처리 시작:', classification);
    
    const { youtubeUrl, videoId, action } = classification.extractedInfo;
    
    if (!youtubeUrl) {
        await message.reply('❌ 유튜브 URL을 찾을 수 없습니다. 올바른 유튜브 링크를 제공해주세요.');
        return;
    }
    
    // 처리 중 메시지 표시
    const processingMessage = await message.reply('🔄 유튜브 동영상을 분석하고 있습니다... 잠시만 기다려주세요.');
    
    try {
        const result = await processYouTubeVideo(youtubeUrl, videoId);
        
        // 응답 길이 제한 (Discord 메시지 제한: 2000자)
        if (result.length > 1900) {
            // 긴 응답은 파일로 전송
            const { AttachmentBuilder } = require('discord.js');
            const attachment = new AttachmentBuilder(Buffer.from(result, 'utf-8'), {
                name: `youtube_transcript_${videoId}.txt`
            });
            
            await processingMessage.edit({
                content: '📝 **유튜브 동영상 스크립트 정리 완료**\n\n응답이 길어서 파일로 첨부했습니다.',
                files: [attachment]
            });
        } else {
            await processingMessage.edit({
                content: result
            });
        }
        
    } catch (error) {
        console.error('❌ 유튜브 처리 오류:', error);
        await processingMessage.edit({
            content: '❌ 유튜브 동영상 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.'
        });
    }
}

module.exports = {
    processYouTubeVideo,
    extractVideoId,
    isValidYouTubeUrl,
    handleYouTubeRequest
};
