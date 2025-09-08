const { GoogleGenAI } = require('@google/genai');
const { AttachmentBuilder, EmbedBuilder } = require('discord.js');
const fetch = require('node-fetch');
// 메모리 관련 함수들은 client.memory를 통해 접근
const { logGeminiCall } = require('./openaiClient');
const { askGPT } = require('../services/gptService');
const { getGeminiModel } = require('../config/models');

// Initialize APIs (lazy loading)
let genAI = null;

function getGoogleGenAI() {
    if (!genAI) {
        if (!process.env.GEMINI_API_KEY) {
            throw new Error('GEMINI_API_KEY가 설정되지 않았습니다. .env 파일을 확인해주세요.');
        }
        genAI = new GoogleGenAI(process.env.GEMINI_API_KEY);
        console.log('[GEMINI] ✅ Google GenAI 클라이언트 초기화 완료');
    }
    return genAI;
}

// Function to convert image URL to a format the API understands
async function urlToGenerativePart(url, mimeType) {
    console.log(`🔄 이미지 변환 중...`);
    
    try {
        const response = await fetch(url);
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const buffer = await response.buffer();
        const base64Data = buffer.toString("base64");
        
        const result = {
            inlineData: {
                data: base64Data,
                mimeType
            },
        };
        
        console.log(`✅ 이미지 변환 완료`);
        return result;
        
    } catch (error) {
        console.error(`❌ 이미지 변환 실패:`, error.message);
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
async function enhancePromptWithChatGPT(originalPrompt, isImageEdit = false, userId = null, client = null) {
    console.log(`🚀 프롬프트 보강 시작`);
    console.log(`📝 원본 (${originalPrompt.length}자): "${originalPrompt}"`);
    
    // 컨텍스트 정보 가져오기
    let contextInfo = '';
    // 컨텍스트는 이미지를 새로 생성할 때만 사용하고, 이미지 수정 시에는 사용하지 않습니다.
    if (userId && !isImageEdit && client) {
        const recentConversations = client.memory.getRecentConversations(userId, 3);
        if (recentConversations.length > 0) {
            console.log(`[PROMPT] 🧠 최근 대화 ${recentConversations.length}개 컨텍스트 활용`);
            contextInfo = '\n\n최근 대화 컨텍스트:\n' + 
                recentConversations.map((conv, i) => {
                    const userMsg = conv.userMessage || conv.user || '';
                    const botMsg = conv.botResponse || conv.bot || '';
                    const truncatedBot = botMsg.length > 200 ? botMsg.substring(0, 200) + '...' : botMsg;
                    return `${i+1}. 사용자: "${userMsg}"\n   봇: "${truncatedBot}"`;
                }).join('\n');
        } else {
            console.log(`[PROMPT] 🧠 컨텍스트 없음 (새 이미지 생성)`);
        }
    } else if (isImageEdit) {
        console.log(`[PROMPT] 🔄 이미지 수정 모드 (컨텍스트 미사용)`);
    }
    
    try {
        const systemPrompt = isImageEdit 
            ? `You are an expert prompt engineer for an image editing AI. Your task is to convert a user's simple request into a detailed, specific, English prompt for the Gemini AI.

**CRITICAL RULES:**
1.  **PRESERVE THE ORIGINAL SUBJECT:** You MUST keep the main subject/animal/object from the original image unchanged. If the original image shows a cat, the modified image must still feature the same cat. Only modify the environment, background, or style as requested.
2.  **EXTRACT KEY ACTIONS AND CONTEXT:** Pay close attention to specific actions, emotions, or situations mentioned in the user's request. If they say "강아지와 노는 모습" (playing with a dog), include BOTH the action "playing" AND the interaction partner "dog" in your output.
3.  **HANDLE ADDITIONAL SUBJECTS:** When the user mentions other animals/objects (like "강아지" - dog), ADD them to the scene while keeping the original subject. For "강아지와 노는 모습", show the original cat playing WITH a dog, not just the cat playing alone.
4.  **INTERPRET USER INTENT:** Adapt the request to work with the existing subject while preserving ALL mentioned elements (actions, objects, other animals, environments).
5.  **OUTPUT FORMAT:** The final prompt must be in English, start with "Modify the image to...", and be a single, concise instruction.

**EXAMPLE 1 (Background Change):**
- User Request: "change the background to the sea"
- Original Image: A cat.
- Your Output: "Modify the image to place the original cat on a beautiful ocean background, featuring clear blue water and a bright sky, while keeping the cat as the main subject."

**EXAMPLE 2 (Adding Interaction Partner):**
- User Request: "강아지와 노는 모습" (playing with a dog)
- Original Image: A cat with a toy.
- Your Output: "Modify the image to show the original cat actively playing and interacting with a friendly dog, both animals engaged in joyful play together, capturing the playful interaction between the cat and dog as described in the request."

**EXAMPLE 3 (Environment + Interaction):**
- User Request: "강아지와 해변에서 뛰어노는 모습 그려주세요" (Draw a dog playing on the beach)
- Original Image: A cat sitting indoors.
- Your Output: "Modify the image to show the original cat joyfully playing and running with a friendly dog on a sandy beach with waves in the background, both animals engaged in playful interaction while capturing the beach environment from the user's request."

**EXAMPLE 4 (Style Change):**
- User Request: "make it look like a cartoon"
- Original Image: A realistic photo of a car.
- Your Output: "Modify the image to transform the realistically photographed car into a cartoon style, with bold outlines, vibrant colors, and a playful aesthetic."

**Now, process the following request based on the rules provided.**`
            : `You are an expert prompt engineer for an image generation AI. Your task is to convert a user's simple request into a detailed, specific, English prompt for the Gemini AI to create a high-quality REALISTIC image.

**CRITICAL RULES:**
1.  **ABSOLUTELY NO QUESTIONS:** Your one and only job is to generate a descriptive English image prompt. You must NEVER, under any circumstances, ask the user for clarification, more details, or ask questions of any kind. You must infer the user's intent from the provided context and generate a complete, detailed prompt ready for an image AI.
2.  **REALISTIC PHOTOGRAPHY STYLE:** Unless the user explicitly requests cartoon, anime, or artistic styles, ALWAYS generate prompts for photorealistic images. Use photography terms like "professional photography", "DSLR camera", "natural lighting", "realistic", "photorealistic", "lifelike".
3.  **USE THE CONVERSATION CONTEXT INTELLIGENTLY:** The user's request often builds upon the conversation. Analyze the 'Recent Conversation Context' to understand the MAIN TOPIC being discussed. If the context is about "solar system", don't just focus on one element like the sun - consider the entire system. If it's about "animals in the forest", include multiple animals and forest elements, not just one animal.
4.  **BE CREATIVE & DESCRIPTIVE:** If the user's request is vague (e.g., "draw that"), it is your job to be creative. Based on the context, invent a beautiful and detailed realistic scene. Add details about realistic lighting, camera angles, depth of field, and photographic composition.
5.  **OUTPUT FORMAT:** The final prompt must be in English and be a single, concise instruction for the AI. ALWAYS include realistic photography keywords.

**EXAMPLE 1 (Simple Request):**
- User Request: "draw a cat"
- Your Output: "A cute and fluffy cat, photorealistic style, professional photography, DSLR camera, detailed fur texture, bright natural eyes, sitting pose, soft natural lighting, shallow depth of field, high resolution, lifelike."

**EXAMPLE 2 (Contextual Request):**
- Recent Conversation Context:
    - User: "Tell me about the solar system."
    - Bot: "The solar system consists of the Sun and eight planets: Mercury, Venus, Earth, Mars, Jupiter, Saturn, Uranus, and Neptune..."
- User Request: "draw an image based on that"
- Your Output: "A breathtaking realistic view of the solar system showing all planets in their orbital arrangement around the Sun, captured with professional space photography techniques, detailed planetary surfaces and atmospheres, accurate relative sizes and distances, deep space background with stars, high resolution, photorealistic, astronomical photography quality."

**EXAMPLE 3 (Context Analysis):**
- Recent Conversation Context:
    - User: "What animals live in the Amazon rainforest?"
    - Bot: "The Amazon rainforest is home to jaguars, toucans, sloths, poison dart frogs, and many other species..."
- User Request: "draw that"
- Your Output: "A vibrant Amazon rainforest scene featuring multiple wildlife species including a jaguar, colorful toucans, a sloth hanging from branches, and poison dart frogs, lush green vegetation, misty atmosphere, natural lighting filtering through the canopy, professional wildlife photography, DSLR camera, photorealistic, high resolution."

**EXAMPLE 4 (People/Portrait Request):**
- User Request: "draw a person reading a book"
- Your Output: "A photorealistic portrait of a person reading a book in a cozy library, natural lighting from a window, professional photography, DSLR camera, shallow depth of field, detailed facial features, realistic skin texture, warm ambient lighting, high resolution, lifelike."

**Now, process the following request based on the rules and context provided. Remember to make it PHOTOREALISTIC unless explicitly told otherwise.**${contextInfo}`;

        const enhancedPrompt = await askGPT('IMAGE_PROMPT_ENHANCEMENT', systemPrompt, originalPrompt, {
            max_tokens: 150,
            temperature: 0.7,
            purpose: '이미지 프롬프트 개선'
        });
        console.log(`✅ 프롬프트 보강 완료 (${enhancedPrompt.length}자)`);
        console.log(`📄 "${enhancedPrompt}"`);
        
        return enhancedPrompt;
        
    } catch (error) {
        console.error(`❌ 프롬프트 보강 실패:`, error.message);
        console.log(`🔄 원본 프롬프트 사용`);
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
async function handleImageRequest(message, promptContent) {
    const prompt = promptContent || message.content;
    const attachments = Array.from(message.attachments.values());
    const imageAttachments = attachments.filter(att => att.contentType && att.contentType.startsWith('image/'));
    const userId = message.author.id;
    const memory = message.client.memory.getUserMemory(userId);

    let imageUrl = imageAttachments.length > 0 ? imageAttachments[0].url : memory.lastImageUrl;
    let imageMimeType = imageAttachments.length > 0 ? imageAttachments[0].contentType : memory.lastImageMimeType;

    // 새 이미지가 업로드되면 메모리에 저장
    if (imageAttachments.length > 0) {
        console.log(`[IMAGE] 💾 새 이미지를 메모리에 저장 (${imageMimeType})`);
        message.client.memory.saveImageContext(userId, imageUrl, imageMimeType);
    } else if (memory.lastImageUrl) {
        console.log(`[IMAGE] 🔄 메모리에서 이전 이미지 사용`);
    }

    const requesterTag = message.author.tag;
    const requesterAvatarURL = message.author.displayAvatarURL();

    console.log(`[IMAGE] 🎨 "${prompt}" ${imageUrl ? '(이미지 수정)' : '(새 이미지)'}`);
    
    try {
        if (!prompt || prompt.trim() === '') {
            await message.reply("프롬프트를 입력해주세요.");
            return "프롬프트를 입력해주세요.";
        }

        // Discord 피드백 전송 헬퍼 함수
        const sendFeedback = async (content) => {
            try {
                await message.channel.send(content);
            } catch (error) {
                console.error(`[IMAGE HANDLER] ❌ Discord 피드백 전송 실패:`, error);
            }
        };
        
        // 1단계: 프롬프트 보강
        const isImageEdit = !!(imageUrl && imageMimeType);
        
        // Discord 피드백: 프롬프트 보강 시작
        try {
            const initialMessage = '🔧 **프롬프트를 보강하고 있습니다...** ChatGPT가 더 나은 결과를 위해 프롬프트를 개선중입니다.';
            await message.reply(initialMessage);
        } catch (error) {
            console.error(`[IMAGE HANDLER] ❌ Discord 피드백 전송 실패:`, error);
        }
        
        const enhancedPrompt = await enhancePromptWithChatGPT(prompt, isImageEdit, userId, message.client);
        
        // Discord 피드백: 보강된 프롬프트 표시
        const truncatedOriginal = prompt.length > 300 ? prompt.substring(0, 300) + '...' : prompt;
        const truncatedEnhanced = enhancedPrompt.length > 800 ? enhancedPrompt.substring(0, 800) + '...' : enhancedPrompt;
        
        const promptMessage = `✨ **프롬프트 보강 완료!**\n\n` +
            `**📝 원본 프롬프트:**\n> ${truncatedOriginal}\n\n` +
            `**🚀 보강된 프롬프트:**\n> ${truncatedEnhanced}`;
        await sendFeedback(promptMessage);

        let contents;
        
        if (imageUrl && imageMimeType) {
            // 이미지 + 텍스트 처리
            console.log(`[IMAGE] 🔄 이미지 수정 모드`);
            try {
                const imagePart = await urlToGenerativePart(imageUrl, imageMimeType);
                
                contents = [
                    { text: enhancedPrompt },
                    imagePart,
                ];
            } catch (imageError) {
                console.error(`[IMAGE HANDLER] ❌ 이미지 처리 오류:`, imageError);
                await message.reply("이미지를 처리할 수 없습니다. 다른 이미지를 시도해보세요.");
                return "이미지를 처리할 수 없습니다. 다른 이미지를 시도해보세요.";
            }
        } else {
            // 텍스트만으로 이미지 생성
            console.log(`[IMAGE] 🆕 이미지 생성 모드`);
            contents = [{ text: enhancedPrompt }];
        }

        // 2단계: Gemini API 호출
        console.log(`[IMAGE] 🚀 Gemini API 호출 중...`);
        
        // Discord 피드백: API 요청 시작
        const apiMessage = isImageEdit 
            ? '🎨 **Gemini AI에 이미지 수정 요청을 보냈습니다!** 잠시만 기다려주세요...'
            : '🎨 **Gemini AI에 이미지 생성 요청을 보냈습니다!** 잠시만 기다려주세요...';
        await sendFeedback(apiMessage);
        
        const genAI = getGoogleGenAI();
        const startTime = Date.now();
        const model = getGeminiModel('IMAGE_GENERATION');
        const result = await genAI.models.generateContent({
            model: model,
            contents,
        });
        const endTime = Date.now();
        const duration = endTime - startTime;

        // 토큰 정보 추출
        const usageMetadata = result.response?.usageMetadata || result.usageMetadata || result.candidates?.[0]?.usageMetadata;
        
        const purpose = isImageEdit ? '이미지 편집' : '이미지 생성';
        logGeminiCall(model, duration, purpose, usageMetadata);
        
        console.log(`✅ ${purpose} 완료`);

        const firstCandidate = result.candidates?.[0];
        
        if (firstCandidate && firstCandidate.content && firstCandidate.content.parts) {
            
            let resultSent = false;
            for (const part of firstCandidate.content.parts) {
                if (part.inlineData && part.inlineData.data) {
                    const imageBuffer = Buffer.from(part.inlineData.data, 'base64');
                    const fileName = imageUrl ? 'edited-image.png' : 'generated-image.png';
                    
                    console.log(`[IMAGE] 💾 이미지 저장 완료`);
                    const imageAttachment = new AttachmentBuilder(imageBuffer, { name: fileName });


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

                    
                    await message.reply({ embeds: [embed], files: [imageAttachment] });
                    resultSent = true;
                    
                    // 이미지 생성 성공 시, 원본 프롬프트와 보강된 프롬프트를 함께 반환하여 대화 기록
                    return `Original Prompt: "${prompt}"\nEnhanced Prompt: "${enhancedPrompt}"`;
                }
            }
        }

        // 이미지가 생성되지 않은 경우 텍스트 응답 반환
        console.log(`[IMAGE] ⚠️ 이미지 생성 실패`);
        
        let textResponse = '';
        if (firstCandidate && firstCandidate.content && firstCandidate.content.parts) {
            textResponse = firstCandidate.content.parts
                .filter(p => p.text)
                .map(p => p.text)
                .join('\n');
        }

        const fallbackResponse = textResponse || "죄송합니다, 이미지를 생성할 수 없습니다.";
        await message.reply(fallbackResponse);
        return fallbackResponse;

    } catch (error) {
        console.error(`[IMAGE HANDLER] 💥 예외 발생:`, error);
        console.error(`[IMAGE HANDLER] 💥 스택 트레이스:`, error.stack);
        
        // 오류 응답 전송
        await message.reply("이미지 처리 중 오류가 발생했습니다.");

        return "이미지 처리 중 오류가 발생했습니다.";
    }
}

module.exports = {
    handleImageRequest,
    urlToGenerativePart,
    enhancePromptWithChatGPT
};
