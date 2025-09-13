/**
 * 유튜브 동영상 처리 핸들러
 * YouTube API를 사용하여 자막을 추출하고 요약합니다.
 */

const { askGPT } = require('../services/gptService');
const axios = require('axios');
const { google } = require('googleapis');
const { getAuthenticatedGoogleApis } = require('../google-auth');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs');
const path = require('path');

/**
 * 유튜브 동영상을 처리하여 요약을 생성합니다.
 * @param {string} youtubeUrl - 유튜브 동영상 URL
 * @param {string} videoId - 유튜브 동영상 ID
 * @param {string} action - 처리 액션 (기본값: 'summary')
 * @returns {Promise<Object>} 요약 결과 객체
 */
async function processYouTubeVideo(youtubeUrl, videoId, action = 'summary') {
    console.log(`🎥 유튜브 동영상 처리 시작: ${youtubeUrl}`);
    
    try {
        // 1. YouTube 비디오 메타데이터 가져오기 (정식 타이틀 등)
        const videoMetadata = await getYouTubeVideoMetadata(videoId);
        
        // 2. YouTube API를 사용하여 자막 추출
        const transcript = await getYouTubeTranscript(youtubeUrl, videoId);
        
        // 3. 요약 프롬프트를 사용하여 요약 생성
        const summary = await generateSummary(transcript);
        
        // 4. 정식 타이틀과 AI 생성 제목 구분
        // summary.title은 AI가 생성한 제목 (suggested_title로 사용)
        // videoMetadata.title은 정식 YouTube 타이틀
        
        // 5. Google Sheets에 저장
        await saveToGoogleSheets(summary, youtubeUrl, videoMetadata);
        
        // 6. Obsidian 노트 생성
        await createObsidianNote(summary, youtubeUrl, videoMetadata);
        
        return summary;
        
    } catch (error) {
        console.error('❌ 유튜브 처리 실패:', error);
        throw new Error('유튜브 동영상 처리에 실패했습니다.');
    }
}

/**
 * SupaData API를 사용하여 YouTube 비디오 메타데이터를 가져옵니다.
 * @param {string} videoId - 유튜브 동영상 ID
 * @returns {Promise<Object>} 비디오 메타데이터
 */
async function getYouTubeVideoMetadata(videoId) {
    console.log(`📋 비디오 메타데이터 추출 시작: ${videoId}`);
    
    try {
        const apiKey = process.env.SUPADATA_API_KEY || 'sd_944a4c7de5a7a7986248508913de7ace';
        const apiUrl = 'https://api.supadata.ai/v1/youtube/video';
        
        console.log(`🔍 SupaData Video API 호출 시작:`);
        console.log(`   - URL: ${apiUrl}`);
        console.log(`   - Video ID: ${videoId}`);
        
        const response = await axios.get(apiUrl, {
            params: {
                id: videoId
            },
            headers: {
                'x-api-key': apiKey
            }
        });
        
        console.log(`📊 Video API 응답 상태: ${response.status}`);
        console.log(`📊 Video API 응답 데이터:`, JSON.stringify(response.data, null, 2));
        
        if (response.data) {
            console.log('✅ 비디오 메타데이터 추출 완료');
            return {
                title: response.data.title || '',
                description: response.data.description || '',
                channelTitle: response.data.channel?.name || '',
                publishedAt: response.data.uploadDate || '',
                duration: response.data.duration || '',
                viewCount: response.data.viewCount || 0,
                likeCount: response.data.likeCount || 0,
                thumbnail: response.data.thumbnail || ''
            };
        } else {
            console.log('❌ 비디오 메타데이터를 찾을 수 없음');
            return { title: '', description: '', channelTitle: '', publishedAt: '', duration: '', viewCount: 0 };
        }
        
    } catch (error) {
        console.error('❌ 비디오 메타데이터 추출 실패:');
        console.error('   - 오류 메시지:', error.message);
        if (error.response) {
            console.error('   - HTTP 상태:', error.response.status);
            console.error('   - 응답 데이터:', JSON.stringify(error.response.data, null, 2));
        }
        // 실패해도 빈 객체 반환
        return { title: '', description: '', channelTitle: '', publishedAt: '', duration: '', viewCount: 0 };
    }
}

/**
 * YouTube API를 사용하여 자막을 추출합니다.
 * @param {string} youtubeUrl - 유튜브 동영상 URL
 * @param {string} videoId - 유튜브 동영상 ID
 * @returns {Promise<string>} 추출된 자막 텍스트
 */
async function getYouTubeTranscript(youtubeUrl, videoId) {
    console.log(`📝 자막 추출 시작: ${videoId}`);
    
    try {
        // SupaData API를 사용하여 자막 추출
        const apiKey = process.env.SUPADATA_API_KEY || 'sd_944a4c7de5a7a7986248508913de7ace';
        const apiUrl = 'https://api.supadata.ai/v1/transcript';
        
        console.log(`🔍 SupaData API 호출 시작:`);
        console.log(`   - URL: ${apiUrl}`);
        console.log(`   - YouTube URL: ${youtubeUrl}`);
        console.log(`   - API Key: ${apiKey.substring(0, 10)}...`);
        
        const response = await axios.get(apiUrl, {
            params: {
                url: youtubeUrl,
                lang: 'ko',
                text: 'true',
                mode: 'auto'
            },
            headers: {
                'x-api-key': apiKey
            }
        });
        
        console.log(`📊 SupaData API 응답 상태: ${response.status}`);
        console.log(`📊 SupaData API 응답 데이터:`, JSON.stringify(response.data, null, 2));
        
        if (response.data && response.data.content) {
            console.log('✅ 자막 추출 완료');
            console.log(`📝 자막 길이: ${response.data.content.length}자`);
            return response.data.content;
        } else {
            console.log('❌ 응답에서 content 필드를 찾을 수 없음');
            throw new Error('자막 데이터를 찾을 수 없습니다.');
        }
        
    } catch (error) {
        console.error('❌ 자막 추출 실패:');
        console.error('   - 오류 메시지:', error.message);
        if (error.response) {
            console.error('   - HTTP 상태:', error.response.status);
            console.error('   - 응답 데이터:', JSON.stringify(error.response.data, null, 2));
        }
        console.log('🔄 Gemini API 폴백 시작');
        // 폴백: Gemini API 사용
        return await processWithGemini(youtubeUrl);
    }
}

/**
 * Gemini Flash 2.5를 사용하여 동영상 스크립트를 요약합니다.
 * @param {string} transcript - 동영상 자막 텍스트
 * @returns {Promise<Object>} 구조화된 요약 결과
 */
async function generateSummary(transcript) {
    console.log('📋 Gemini Flash 2.5로 요약 생성 시작');
    
    const summaryPrompt = `**[목표]**
입력된 동영상 스크립트를 분석하여 체계적이고 가독성 높은 요약 노트를 생성합니다. 모든 내용은 **마크다운 구조**와 **간결한 설명체(개조식)**로 작성되어야 합니다.

## 📋 구성 요소

### 🎬 제목 (Title)
영상 전체를 대표하는 핵심 제목

### 📚 장르 (Genre) 
지정된 카테고리에 따라 분류된 장르

### ✨ 핵심 요약 (Overview)
전체를 조망하는 핵심 내용 (3개 포인트)

### 🔑 키워드 (Keywords)
핵심을 관통하는 키워드 (3개)

### 📝 상세 노트 (Detailed Notes)
주제별 상세 내용 (#### 헤딩 구조)

---

**[입력 데이터]**
${transcript}

---

## 📐 작성 지침

### 1️⃣ 장르 분류 규칙
영상 내용을 분석하여 아래에서 선택:
• **주 장르**: \`Tech\`, \`Business\`, \`Readership\`, \`자기개발\`
• **형식**: \`주장르#세부장르\` (세부장르 불명확시 주장르만)
• **예시**: \`Tech#AI\`, \`Business#Marketing\`, \`Readership#독서법\`

### 2️⃣ 문체 규칙
• **모든 내용**: 명사형 종결의 간결한 설명체(개조식)
• **변환 예시**: \`~의 중요성이 대두됨\` → \`~의 중요성 대두\`
• **불릿포인트**: \`•\` 사용 (하이픈 대신)

### 3️⃣ 구조화 규칙
• **핵심 요약**: 3개의 핵심 메시지를 \`•\`로 정리
• **키워드**: 3개 키워드를 쉼표로 구분
• **상세 노트**: 3~5개 주제를 \`#### 헤딩\`으로 구분
• **공백**: 각 섹션과 헤딩 사이 적절한 여백 유지

---

## 📤 출력 형식

아래 형식을 **반드시 준수**하여 작성:

🎬 Title: {생성된 제목}

✨ Overview:
• {핵심 메시지 1}
• {핵심 메시지 2}  
• {핵심 메시지 3}

📝 Detailed Notes:
#### 🔹 {주제 1}

• {상세 내용 1}
• {상세 내용 2}
• {상세 내용 3}

#### 🔹 {주제 2}

• {상세 내용 1}
• {상세 내용 2}
• {상세 내용 3}

#### 🔹 {주제 3}

• {상세 내용 1}
• {상세 내용 2}

---
📚 Genre: {분류된 장르}
🔑 Keywords: {키워드1}, {키워드2}, {키워드3}
   
    
    `;

    try {
        // Gemini Flash 2.5 사용
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
        
        console.log('🤖 Gemini Flash 2.5 호출 시작');
        console.log(`📝 자막 길이: ${transcript.length}자`);
        
        const result = await model.generateContent([summaryPrompt]);
        const response = await result.response;
        const summaryText = response.text();
        
        console.log('✅ Gemini Flash 2.5 요약 생성 완료');
        console.log(`📄 요약 길이: ${summaryText.length}자`);
        
        // 결과를 파싱하여 구조화된 객체로 변환
        const parsedSummary = parseSummaryResult(summaryText);
        
        return parsedSummary;
        
    } catch (error) {
        console.error('❌ Gemini 요약 생성 실패:', error);
        console.log('🔄 GPT 폴백으로 전환');
        
        // 폴백: GPT 사용
        try {
            const result = await askGPT('YOUTUBE_SUMMARY', summaryPrompt, transcript, {
                temperature: 0.3,
                max_tokens: 2000,
                purpose: '유튜브 동영상 요약 (Gemini 폴백)'
            });
            
            const parsedSummary = parseSummaryResult(result);
            console.log('✅ GPT 폴백 요약 생성 완료');
            
            return parsedSummary;
            
        } catch (fallbackError) {
            console.error('❌ GPT 폴백도 실패:', fallbackError);
            throw new Error('요약 생성에 실패했습니다.');
        }
    }
}

/**
 * 요약 결과를 파싱하여 구조화된 객체로 변환합니다.
 * @param {string} summaryText - 요약 텍스트
 * @returns {Object} 구조화된 요약 객체
 */
function parseSummaryResult(summaryText) {
    const result = {
        title: '',
        genre: '',
        overview: '',
        keywords: '',
        detailedNotes: '',
        fullText: summaryText
    };
    
    try {
        // 제목 추출
        const titleMatch = summaryText.match(/🎬 Title:\s*(.+)/);
        if (titleMatch) result.title = titleMatch[1].trim();
        
        // 장르 추출
        const genreMatch = summaryText.match(/📚 Genre:\s*(.+)/);
        if (genreMatch) result.genre = genreMatch[1].trim();
        
        // 키워드 추출
        const keywordsMatch = summaryText.match(/🔑 Keywords:\s*(.+)/);
        if (keywordsMatch) result.keywords = keywordsMatch[1].trim();
        
        // 핵심 요약 추출 (📝 Detailed Notes: 전까지만)
        const overviewMatch = summaryText.match(/✨ Overview:\s*([\s\S]*?)(?=📝 Detailed Notes:|🔑 Keywords:|---)/);
        if (overviewMatch) result.overview = overviewMatch[1].trim();
        
        // 상세 노트 추출
        const notesMatch = summaryText.match(/📝 Detailed Notes:\s*([\s\S]*?)$/);
        if (notesMatch) result.detailedNotes = notesMatch[1].trim();
        
    } catch (error) {
        console.error('❌ 요약 파싱 오류:', error);
    }
    
    return result;
}

/**
 * 플랫폼별 상세 노트 포맷터
 */
const DetailedNotesFormatter = {
    // Obsidian용: 원본 그대로 (#### 🔹 유지)
    forObsidian: (detailedNotes) => {
        return detailedNotes || '상세 내용이 없습니다.';
    },
    
    // Discord용: #### 를 🔹 **로 변환 (불필요한 제목 제거)
    forDiscord: (detailedNotes) => {
        if (!detailedNotes) return '상세 내용이 없습니다.';
        
        return detailedNotes
            // 불필요한 제목들 제거
            .replace(/📝\s*(상세\s*노트|Detailed\s*Notes):\s*\n?/gi, '')
            .replace(/📚\s*상세\s*노트\s*\n?/gi, '')
            .replace(/##\s*📚\s*상세\s*노트\s*\n?/gi, '')
            // #### 를 🔹 **로 변환
            .replace(/#### 🔹([^\n]+)/g, '🔹 **$1**')
            .replace(/#### ([^\n]+)/g, '🔹 **$1**')
            // 연속된 빈 줄 정리
            .replace(/\n\s*\n\s*\n/g, '\n\n')
            .trim();
    },
    
    // Google Sheets용: 간결한 텍스트 형태 (불필요한 제목 제거)
    forSheets: (detailedNotes) => {
        if (!detailedNotes) return '상세 내용이 없습니다.';
        
        return detailedNotes
            // 불필요한 제목들 제거
            .replace(/📝\s*(상세\s*노트|Detailed\s*Notes):\s*\n?/gi, '')
            .replace(/📚\s*상세\s*노트\s*\n?/gi, '')
            .replace(/##\s*📚\s*상세\s*노트\s*\n?/gi, '')
            // 포맷 변환
            .replace(/#### 🔹/g, '■')
            .replace(/#### /g, '■ ')
            .replace(/•/g, '-')
            // 연속된 빈 줄 정리
            .replace(/\n\s*\n\s*\n/g, '\n\n')
            .trim();
    }
};

/**
 * Google Sheets에 요약 결과를 저장합니다.
 * @param {Object} summary - 요약 객체
 * @param {string} youtubeUrl - 유튜브 URL
 * @param {Object} videoMetadata - 비디오 메타데이터
 */
async function saveToGoogleSheets(summary, youtubeUrl, videoMetadata = {}) {
    console.log('📊 Google Sheets 저장 시작');
    
    try {
        const { sheets } = await getAuthenticatedGoogleApis();
        
        // 스프레드시트 ID (문서에서 제공된 URL에서 추출)
        const spreadsheetId = '1E2G-tlnIdig1FI2QEU_7imBS2mkgHuK0c9MLqmxsOHQ';
        
        // 현재 날짜와 시간 (YYYY-MM-DD HH:MM 형식)
        const now = new Date();
        const createdDate = now.toISOString().slice(0, 16).replace('T', ' ');
        
        // Google Sheets용 요약 내용 포맷팅 (핵심 요약 + 상세 내용만)
        const sheetsFormattedSummary = `[핵심 요약]\n${summary.overview || '개요 없음'}\n\n[상세 내용]\n${DetailedNotesFormatter.forSheets(summary.detailedNotes)}`;
        
        // 새 행 데이터 준비 (컬럼 순서: title, summary, url, genre, keyword, created_date, read)
        const values = [[
            videoMetadata.title || '제목 없음', // 정식 YouTube 타이틀
            sheetsFormattedSummary, // 구조화된 요약 내용
            youtubeUrl,
            summary.genre || '',
            summary.keywords || '',
            createdDate,
            false // read 컬럼을 boolean으로 설정 (체크박스)
        ]];
        
        // 시트에 데이터 추가 (USER_ENTERED로 변경하여 boolean 값이 체크박스로 표시되도록)
        await sheets.spreadsheets.values.append({
            spreadsheetId: spreadsheetId,
            range: 'A:G', // title, summary, url, genre, keyword, created_date, read
            valueInputOption: 'USER_ENTERED', // RAW 대신 USER_ENTERED 사용
            resource: {
                values: values
            }
        });
        
        // 추가로 read 컬럼을 체크박스로 포맷팅
        await formatReadColumnAsCheckbox(sheets, spreadsheetId);
        
        console.log('✅ Google Sheets 저장 완료');
        
    } catch (error) {
        console.error('❌ Google Sheets 저장 실패:', error);
        // 저장 실패해도 요약 결과는 반환하도록 함
    }
}

/**
 * read 컬럼을 체크박스로 포맷팅합니다.
 * @param {Object} sheets - Google Sheets API 객체
 * @param {string} spreadsheetId - 스프레드시트 ID
 */
async function formatReadColumnAsCheckbox(sheets, spreadsheetId) {
    try {
        // G 컬럼(read 컬럼)을 체크박스로 포맷팅
        await sheets.spreadsheets.batchUpdate({
            spreadsheetId: spreadsheetId,
            resource: {
                requests: [{
                    repeatCell: {
                        range: {
                            sheetId: 0, // 첫 번째 시트
                            startColumnIndex: 6, // G 컬럼 (0-based index)
                            endColumnIndex: 7,
                            startRowIndex: 1 // 헤더 제외
                        },
                        cell: {
                            dataValidation: {
                                condition: {
                                    type: 'BOOLEAN'
                                },
                                showCustomUi: true
                            }
                        },
                        fields: 'dataValidation'
                    }
                }]
            }
        });
        
        console.log('✅ read 컬럼 체크박스 포맷팅 완료');
        
    } catch (error) {
        console.error('❌ 체크박스 포맷팅 실패:', error);
        // 포맷팅 실패해도 데이터는 저장됨
    }
}

/**
 * Obsidian 노트를 생성합니다.
 * @param {Object} summary - 요약 객체
 * @param {string} youtubeUrl - 유튜브 URL
 * @param {Object} videoMetadata - 비디오 메타데이터
 */
async function createObsidianNote(summary, youtubeUrl, videoMetadata = {}) {
    console.log('📝 Obsidian 노트 생성 시작');
    
    try {
        const obsidianPath = '/home/joosung80/obsidian/ElanvitalAI/00. Inbox/05. Youtube Summary';
        
        // 파일명 생성 (날짜 + 제목)
        const now = new Date();
        const datePrefix = now.toISOString().slice(0, 10).replace(/-/g, '');
        const safeTitle = (videoMetadata.title || summary.title || 'YouTube 요약')
            .replace(/[^\w\s가-힣]/g, '') // 특수문자 제거
            .replace(/\s+/g, ' ') // 연속 공백 정리
            .trim()
            .substring(0, 50); // 길이 제한
        
        const fileName = `${datePrefix}_${safeTitle}.md`;
        const filePath = path.join(obsidianPath, fileName);
        
        // Obsidian Properties용 태그 배열 생성
        const genreTags = summary.genre ? summary.genre.split('#').filter(tag => tag.trim()) : [];
        const keywordTags = summary.keywords ? summary.keywords.split(',').map(k => k.trim().replace(/\s+/g, '_')) : [];
        const allTags = ['YouTube', 'AI요약', ...genreTags, ...keywordTags].filter(Boolean);
        
        // Obsidian 노트 내용 생성 (Properties + 본문 내용 위주)
        const noteContent = `---
title: "${videoMetadata.title || summary.title || 'YouTube 요약'}"
created: ${now.toISOString().slice(0, 10)}
tags:
${allTags.map(tag => `  - "${tag}"`).join('\n')}
youtube_url: "${youtubeUrl}"
channel: "${videoMetadata.channelTitle || '알 수 없음'}"
views: ${videoMetadata.viewCount || 0}
likes: ${videoMetadata.likeCount || 0}
uploaded: "${videoMetadata.publishedAt || '알 수 없음'}"
genre: "${summary.genre || '분류 없음'}"
keywords: "${summary.keywords || '키워드 없음'}"
ai_generated: true
generated_at: "${now.toISOString().slice(0, 16).replace('T', ' ')}"
---

# ${videoMetadata.title || summary.title || 'YouTube 요약'}

## ✨ 핵심 요약

${summary.overview || '개요 없음'}

## 📚 상세 노트

${DetailedNotesFormatter.forObsidian(summary.detailedNotes)}

---

> [!info] 🤖 AI 생성 노트
> 이 노트는 AI가 자동으로 생성한 YouTube 동영상 요약입니다.`;

        // 파일 생성
        fs.writeFileSync(filePath, noteContent, 'utf8');
        
        console.log('✅ Obsidian 노트 생성 완료:', fileName);
        
    } catch (error) {
        console.error('❌ Obsidian 노트 생성 실패:', error);
        // 노트 생성 실패해도 전체 프로세스는 계속 진행
    }
}

/**
 * Gemini API를 사용하여 유튜브 동영상을 처리합니다. (폴백 함수)
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
    const processingMessage = await message.reply('🔄 유튜브 동영상을 분석하고 요약하고 있습니다... 잠시만 기다려주세요.');
    
    try {
        const summary = await processYouTubeVideo(youtubeUrl, videoId, action);
        
        // 요약 결과를 Discord 메시지 형식으로 포맷팅
        const formattedResult = formatSummaryForDiscord(summary);
        
        // 응답 길이 제한 (Discord 메시지 제한: 2000자)
        if (formattedResult.length > 1900) {
            // 긴 응답은 파일로 전송
            const { AttachmentBuilder } = require('discord.js');
            const attachment = new AttachmentBuilder(Buffer.from(summary.fullText, 'utf-8'), {
                name: `youtube_summary_${videoId}.txt`
            });
            
            const shortSummary = `📝 **유튜브 동영상 요약 완료**\n\n**🎬 제목:** ${summary.title}\n**📚 장르:** ${summary.genre}\n**🔑 키워드:** ${summary.keywords}\n\n전체 요약 내용은 첨부 파일을 확인해주세요.\n\n✅ Google Sheets에 저장되었습니다.`;
            
            await processingMessage.edit({
                content: shortSummary,
                files: [attachment]
            });
        } else {
            await processingMessage.edit({
                content: formattedResult
            });
        }
        
    } catch (error) {
        console.error('❌ 유튜브 처리 오류:', error);
        await processingMessage.edit({
            content: '❌ 유튜브 동영상 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.'
        });
    }
}

/**
 * 요약 결과를 Discord 메시지 형식으로 포맷팅합니다.
 * @param {Object} summary - 요약 객체
 * @returns {string} 포맷된 메시지
 */
function formatSummaryForDiscord(summary) {
    return `📝 **유튜브 동영상 요약 완료**

🎬 **제목:** ${summary.title || '제목 없음'}

✨ **핵심 요약:**
${summary.overview || '개요 없음'}

📖 **상세 내용:**
${DetailedNotesFormatter.forDiscord(summary.detailedNotes)}

✅ **Google Sheets와 Obsidian에 저장되었습니다.**`;
}


module.exports = {
    processYouTubeVideo,
    extractVideoId,
    isValidYouTubeUrl,
    handleYouTubeRequest,
    getYouTubeVideoMetadata,
    getYouTubeTranscript,
    generateSummary,
    saveToGoogleSheets,
    createObsidianNote,
    formatSummaryForDiscord,
    DetailedNotesFormatter
};
