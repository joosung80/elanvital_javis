const { GoogleGenAI } = require('@google/genai');
const { AttachmentBuilder, EmbedBuilder } = require('discord.js');
const fetch = require('node-fetch');
const OpenAI = require('openai');
const { 
  getCurrentContext, 
  getRecentConversations 
} = require('./memoryHandler');

// Initialize APIs
const genAI = new GoogleGenAI(process.env.GEMINI_API_KEY);
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

// Function to convert image URL to a format the API understands
async function urlToGenerativePart(url, mimeType) {
    console.log(`[URL_TO_PART] 🔗 이미지 URL 변환 시작: ${url}`);
    console.log(`[URL_TO_PART] 🎯 MIME 타입: ${mimeType}`);
    
    try {
        const response = await fetch(url);
        console.log(`[URL_TO_PART] 📡 HTTP 응답 상태: ${response.status} ${response.statusText}`);
        console.log(`[URL_TO_PART] 📏 Content-Length: ${response.headers.get('content-length') || 'unknown'}`);
        console.log(`[URL_TO_PART] 🎭 Content-Type: ${response.headers.get('content-type') || 'unknown'}`);
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const buffer = await response.buffer();
        console.log(`[URL_TO_PART] 💾 버퍼 크기: ${buffer.length} bytes`);
        
        const base64Data = buffer.toString("base64");
        console.log(`[URL_TO_PART] 🔤 Base64 길이: ${base64Data.length} characters`);
        
        const result = {
            inlineData: {
                data: base64Data,
                mimeType
            },
        };
        
        console.log(`[URL_TO_PART] ✅ 이미지 변환 완료`);
        return result;
        
    } catch (error) {
        console.error(`[URL_TO_PART] ❌ 이미지 변환 실패:`, error);
        throw error;
    }
}

/**
 * ChatGPT를 사용하여 Gemini용 이미지 프롬프트를 보강합니다.
 * @param {string} originalPrompt - 원본 프롬프트
 * @param {boolean} isImageEdit - 이미지 수정 모드인지 여부
 * @param {string} userId - 사용자 ID (컨텍스트용)
 * @returns {string} 보강된 프롬프트
 */
async function enhancePromptWithChatGPT(originalPrompt, isImageEdit = false, userId = null) {
    console.log(`[PROMPT ENHANCE] 🚀 프롬프트 보강 시작`);
    console.log(`[PROMPT ENHANCE] 📝 원본 프롬프트: "${originalPrompt}"`);
    console.log(`[PROMPT ENHANCE] 🔄 이미지 수정 모드: ${isImageEdit}`);
    console.log(`[PROMPT ENHANCE] 👤 사용자 ID: ${userId || 'null'}`);
    
    // 컨텍스트 정보 가져오기
    let contextInfo = '';
    if (userId) {
        const recentConversations = getRecentConversations(userId, 3);
        if (recentConversations.length > 0) {
            console.log(`[PROMPT ENHANCE] 🧠 최근 대화 ${recentConversations.length}개 활용`);
            contextInfo = '\n\n최근 대화 컨텍스트:\n' + 
                recentConversations.map((conv, i) => 
                    `${i+1}. 사용자: "${conv.userMessage}"\n   봇: "${conv.botResponse.substring(0, 200)}${conv.botResponse.length > 200 ? '...' : ''}"`
                ).join('\n');
        }
    }
    
    try {
        const systemPrompt = isImageEdit 
            ? `당신은 이미지 수정을 위한 프롬프트 전문가입니다. 사용자의 간단한 이미지 수정 요청을 Gemini AI가 이해하기 쉬운 상세하고 구체적인 프롬프트로 변환해주세요.

**매우 중요한 규칙:**
1.  **원본 이미지의 핵심 주제(subject)를 반드시 유지하세요.** (예: 고양이 이미지를 "바다 배경으로 바꿔줘"라고 하면, '바다에 있는 고양이' 프롬프트를 생성해야 합니다. '바다'만 생성하면 안됩니다.)
2.  사용자가 명시적으로 주제를 바꾸라고 하지 않는 한(예: "고양이를 강아지로 바꿔줘"), 절대 주제를 변경하거나 삭제하지 마세요.
3.  최종 프롬프트는 영어로 작성하고 "Modify the image to..." 형태로 시작하세요.
4.  스타일, 색상, 분위기 등 세부사항을 추가하여 풍부한 프롬프트를 만드세요.

예시:
입력 (고양이 이미지 첨부): "배경을 바다로 바꿔줘"  
출력: "Modify the image to place the original cat on a beautiful ocean background, featuring clear blue water and a bright sky, while keeping the cat as the main subject."`
            : `당신은 이미지 생성을 위한 프롬프트 전문가입니다. 사용자의 간단한 이미지 생성 요청을 Gemini AI가 고품질 이미지를 생성할 수 있도록 상세하고 구체적인 프롬프트로 변환해주세요.

규칙:
1. 구체적인 스타일과 분위기 명시 (예: realistic, anime, watercolor, digital art)
2. 색상, 조명, 구도 등 세부사항 추가
3. 영어로 작성 (Gemini는 영어 프롬프트에 더 잘 반응)
4. 200자 이내로 간결하게
5. 고품질을 위한 키워드 포함 (high quality, detailed, professional)
6. 컨텍스트가 있다면 이전 대화 내용을 참고하여 관련된 이미지를 생성

예시:
입력: "고양이 그려줘"
출력: "A cute and fluffy cat, realistic style, high quality, detailed fur texture, bright eyes, sitting pose, soft natural lighting, professional photography"

입력: "미래도시 풍경"
출력: "Futuristic cityscape with tall skyscrapers, neon lights, flying cars, cyberpunk style, night scene, vibrant colors, high quality digital art, detailed architecture"

컨텍스트 기반 예시:
이전 대화: "태양계 구성요소 설명"
입력: "위 대화를 바탕으로 그림을 그려주세요"
출력: "Solar system illustration showing the sun at center with 8 planets orbiting around it, including Mercury, Venus, Earth, Mars, Jupiter, Saturn, Uranus, Neptune, asteroid belt, realistic space scene, high quality digital art, detailed planetary surfaces, cosmic background with stars"${contextInfo}`;

        const response = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: originalPrompt }
            ],
            max_tokens: 150,
            temperature: 0.7
        });

        const enhancedPrompt = response.choices[0].message.content.trim();
        console.log(`[PROMPT ENHANCE] ✅ 프롬프트 보강 완료`);
        console.log(`[PROMPT ENHANCE] 🎯 보강된 프롬프트: "${enhancedPrompt}"`);
        
        return enhancedPrompt;
        
    } catch (error) {
        console.error(`[PROMPT ENHANCE] ❌ 프롬프트 보강 실패:`, error);
        console.log(`[PROMPT ENHANCE] 🔄 원본 프롬프트 사용`);
        return originalPrompt;
    }
}

/**
 * 이미지와 텍스트를 함께 처리하여 이미지를 생성/수정합니다.
 * @param {string} prompt - 텍스트 프롬프트
 * @param {string} imageUrl - 이미지 URL (선택사항)
 * @param {string} imageMimeType - 이미지 MIME 타입 (선택사항)
 * @param {string} requesterTag - 요청자 태그
 * @param {string} requesterAvatarURL - 요청자 아바타 URL
 * @param {Object} discordMessage - Discord 메시지 객체 (피드백용)
 * @param {string} userId - 사용자 ID (컨텍스트용)
 * @returns {Object} 결과 객체 { success, embed?, files?, textResponse? }
 */
async function processImageGeneration(prompt, imageUrl = null, imageMimeType = null, requesterTag, requesterAvatarURL, source = null, userId = null) {
    console.log(`[IMAGE HANDLER] 🎨 이미지 처리 핸들러 시작`);
    console.log(`[IMAGE HANDLER] 📝 프롬프트: "${prompt}"`);
    console.log(`[IMAGE HANDLER] 🖼️ 이미지 URL: ${imageUrl || 'null'}`);
    console.log(`[IMAGE HANDLER] 🎯 MIME 타입: ${imageMimeType || 'null'}`);
    console.log(`[IMAGE HANDLER] 👤 요청자: ${requesterTag}`);
    
    try {
        if (!prompt || prompt.trim() === '') {
            console.log(`[IMAGE HANDLER] ❌ 빈 프롬프트 감지`);
            return {
                success: false,
                textResponse: "프롬프트를 입력해주세요."
            };
        }

        // Discord 피드백 전송 헬퍼 함수
        const sendFeedback = async (content) => {
            if (!source) return;
            try {
                // isCommandInteraction() 또는 유사한 메서드로 인터랙션인지 확인
                if (source.isCommand && source.isCommand()) {
                    await source.followUp(content);
                } else {
                    await source.channel.send(content);
                }
            } catch (error) {
                console.error(`[IMAGE HANDLER] ❌ Discord 피드백 전송 실패:`, error);
            }
        };
        
        // 1단계: 프롬프트 보강
        const isImageEdit = !!(imageUrl && imageMimeType);
        
        // Discord 피드백: 프롬프트 보강 시작
        if (source) {
            try {
                const initialMessage = '🔧 **프롬프트를 보강하고 있습니다...** ChatGPT가 더 나은 결과를 위해 프롬프트를 개선중입니다.';
                if (source.isCommand && source.isCommand()) {
                    // deferReply에 대한 첫 응답은 editReply로 해야 합니다.
                    await source.editReply(initialMessage);
                } else {
                    await source.reply(initialMessage);
                }
            } catch (error) {
                console.error(`[IMAGE HANDLER] ❌ Discord 피드백 전송 실패:`, error);
            }
        }
        
        const enhancedPrompt = await enhancePromptWithChatGPT(prompt, isImageEdit, userId);
        
        // Discord 피드백: 보강된 프롬프트 표시
        const promptMessage = `✨ **프롬프트 보강 완료!**\n\n` +
            `**원본:** "${prompt}"\n` +
            `**보강됨:** "${enhancedPrompt}"`;
        await sendFeedback(promptMessage);

        let contents;
        
        if (imageUrl && imageMimeType) {
            // 이미지 + 텍스트 처리
            console.log(`[IMAGE HANDLER] 🔄 이미지 수정 모드`);
            try {
                console.log(`[IMAGE HANDLER] 📥 이미지 다운로드 시작: ${imageUrl}`);
                const imagePart = await urlToGenerativePart(imageUrl, imageMimeType);
                console.log(`[IMAGE HANDLER] ✅ 이미지 변환 완료 (Base64 길이: ${imagePart.inlineData.data.length})`);
                
                contents = [
                    { text: enhancedPrompt },
                    imagePart,
                ];
            } catch (imageError) {
                console.error(`[IMAGE HANDLER] ❌ 이미지 처리 오류:`, imageError);
                return {
                    success: false,
                    textResponse: "이미지를 처리할 수 없습니다. 다른 이미지를 시도해보세요."
                };
            }
        } else {
            // 텍스트만으로 이미지 생성
            console.log(`[IMAGE HANDLER] 🆕 이미지 생성 모드`);
            contents = [{ text: enhancedPrompt }];
        }

        // 2단계: Gemini API 호출
        console.log(`[IMAGE HANDLER] 🚀 Gemini API 호출 시작`);
        console.log(`[IMAGE HANDLER] 🤖 모델: gemini-2.5-flash-image-preview`);
        console.log(`[IMAGE HANDLER] 📊 컨텐츠 수: ${contents.length}`);
        
        // Discord 피드백: API 요청 시작
        const apiMessage = isImageEdit 
            ? '🎨 **Gemini AI에 이미지 수정 요청을 보냈습니다!** 잠시만 기다려주세요...'
            : '🎨 **Gemini AI에 이미지 생성 요청을 보냈습니다!** 잠시만 기다려주세요...';
        await sendFeedback(apiMessage);
        
        const result = await genAI.models.generateContent({
            model: "gemini-2.5-flash-image-preview",
            contents,
        });

        console.log(`[IMAGE HANDLER] ✅ Gemini API 응답 받음`);
        console.log(`[IMAGE HANDLER] 📋 후보 수: ${result.candidates?.length || 0}`);

        const firstCandidate = result.candidates?.[0];
        
        if (firstCandidate && firstCandidate.content && firstCandidate.content.parts) {
            console.log(`[IMAGE HANDLER] 🔍 응답 파트 수: ${firstCandidate.content.parts.length}`);
            
            for (const part of firstCandidate.content.parts) {
                if (part.inlineData && part.inlineData.data) {
                    console.log(`[IMAGE HANDLER] 🖼️ 이미지 데이터 발견! (Base64 길이: ${part.inlineData.data.length})`);
                    
                    const imageBuffer = Buffer.from(part.inlineData.data, 'base64');
                    const fileName = imageUrl ? 'edited-image.png' : 'generated-image.png';
                    const imageAttachment = new AttachmentBuilder(imageBuffer, { name: fileName });

                    console.log(`[IMAGE HANDLER] 📎 첨부파일 생성: ${fileName} (${imageBuffer.length} bytes)`);

                    const embed = new EmbedBuilder()
                        .setTitle(imageUrl ? "이미지 수정 완료 ✨" : "이미지 생성 완료 ✨")
                        .setColor(0x0099FF)
                        .setImage(`attachment://${fileName}`)
                        .setTimestamp()
                        .setFooter({ text: `Requested by ${requesterTag}`, iconURL: requesterAvatarURL });

                    // 원본 이미지가 있는 경우 썸네일로 추가하여 비교를 용이하게 함
                    if (imageUrl) {
                        embed.setThumbnail(imageUrl);
                    }

                    console.log(`[IMAGE HANDLER] 🎉 이미지 처리 성공!`);
                    return {
                        success: true,
                        embed,
                        files: [imageAttachment]
                    };
                } else if (part.text) {
                    console.log(`[IMAGE HANDLER] 📝 텍스트 파트 발견: "${part.text.substring(0, 100)}..."`);
                }
            }
        }

        // 이미지가 생성되지 않은 경우 텍스트 응답 반환
        console.log(`[IMAGE HANDLER] ⚠️ 이미지 데이터를 찾을 수 없음`);
        
        let textResponse = '';
        if (firstCandidate && firstCandidate.content && firstCandidate.content.parts) {
            textResponse = firstCandidate.content.parts
                .filter(p => p.text)
                .map(p => p.text)
                .join('\n');
            console.log(`[IMAGE HANDLER] 📝 대체 텍스트 응답: "${textResponse.substring(0, 100)}..."`);
        }

        console.log(`[IMAGE HANDLER] ❌ 이미지 생성 실패`);
        return {
            success: false,
            textResponse: textResponse || "이미지를 생성할 수 없습니다."
        };

    } catch (error) {
        console.error(`[IMAGE HANDLER] 💥 예외 발생:`, error);
        console.error(`[IMAGE HANDLER] 💥 스택 트레이스:`, error.stack);
        return {
            success: false,
            error: error.message,
            textResponse: "이미지 처리 중 오류가 발생했습니다."
        };
    }
}

module.exports = {
    processImageGeneration,
    urlToGenerativePart,
    enhancePromptWithChatGPT
};
