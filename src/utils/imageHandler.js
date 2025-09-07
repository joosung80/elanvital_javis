const { GoogleGenAI } = require('@google/genai');
const { AttachmentBuilder, EmbedBuilder } = require('discord.js');
const fetch = require('node-fetch');
const { 
  getCurrentContext, 
  getRecentConversations 
} = require('./memoryHandler');
const { getOpenAIClient } = require('./openaiClient');

// Initialize APIs
const genAI = new GoogleGenAI(process.env.GEMINI_API_KEY);

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
    // 컨텍스트는 이미지를 새로 생성할 때만 사용하고, 이미지 수정 시에는 사용하지 않습니다.
    if (userId && !isImageEdit) {
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
            ? `You are an expert prompt engineer for an image editing AI. Your task is to convert a user's simple request into a detailed, specific, English prompt for the Gemini AI.

**CRITICAL RULES:**
1.  **PRESERVE THE SUBJECT:** You MUST maintain the primary subject of the original image. If the user provides an image of a cat, your prompt must be about modifying the cat or its environment. Do NOT change the subject unless the user explicitly asks (e.g., "change the cat to a dog").
2.  **FOCUS ON THE REQUEST:** Your primary goal is to translate the user's *current* request into a detailed prompt. Do not infer context from past conversations.
3.  **OUTPUT FORMAT:** The final prompt must be in English, start with "Modify the image to...", and be a single, concise instruction.

**EXAMPLE 1 (Background Change):**
- User Request: "change the background to the sea"
- Original Image: A cat.
- Your Output: "Modify the image to place the original cat on a beautiful ocean background, featuring clear blue water and a bright sky, while keeping the cat as the main subject."

**EXAMPLE 2 (Style Change):**
- User Request: "make it look like a cartoon"
- Original Image: A realistic photo of a car.
- Your Output: "Modify the image to transform the realistically photographed car into a cartoon style, with bold outlines, vibrant colors, and a playful aesthetic."

**Now, process the following request based on the rules provided.**`
            : `You are an expert prompt engineer for an image generation AI. Your task is to convert a user's simple request into a detailed, specific, English prompt for the Gemini AI to create a high-quality image.

**CRITICAL RULES:**
1.  **USE THE CONVERSATION CONTEXT:** Carefully analyze the 'Recent Conversation Context' provided. The user's request often builds upon the conversation. Your prompt MUST reflect the key topics and details from the context.
2.  **BE DESCRIPTIVE:** Add details about style (e.g., realistic, anime, digital art), mood, lighting, and composition.
3.  **OUTPUT FORMAT:** The final prompt must be in English and be a single, concise instruction for the AI. Include keywords like "high quality, detailed".

**EXAMPLE 1 (Simple Request):**
- User Request: "draw a cat"
- Your Output: "A cute and fluffy cat, realistic style, high quality, detailed fur texture, bright eyes, sitting pose, soft natural lighting, professional photography."

**EXAMPLE 2 (Contextual Request):**
- Recent Conversation Context:
    - User: "Tell me about the components of the sun."
    - Bot: "The sun is primarily made of Hydrogen and Helium, with a core where nuclear fusion occurs..."
- User Request: "draw an image based on that"
- Your Output: "An awe-inspiring illustration of the sun's core, showing the intense process of nuclear fusion where hydrogen atoms combine to form helium. Feature vibrant, fiery colors of orange and yellow, with dynamic waves of energy radiating outwards. High quality digital art, scientifically-inspired, detailed, cosmic background."

**Now, process the following request based on the rules and context provided.**${contextInfo}`;

        const openai = getOpenAIClient();
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
