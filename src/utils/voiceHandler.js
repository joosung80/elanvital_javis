const path = require('node:path');
const https = require('https');
const axios = require('axios');
const FormData = require('form-data');

async function transcribeAudio(audioUrl, filename) {
  console.log(`[VOICE DEBUG] 🎤 음성 변환 시작 - 파일: ${filename}`);
  try {
    const audioBuffer = await downloadFile(audioUrl);
    console.log(`[VOICE DEBUG] 📥 파일 다운로드 완료 - 크기: ${audioBuffer.length} bytes`);
    if (audioBuffer.length > 25 * 1024 * 1024) throw new Error('파일 크기가 25MB를 초과합니다.');
    if (audioBuffer.length < 100) throw new Error('파일 크기가 너무 작습니다.');
    
    const contentType = getContentType(filename);
    const formData = new FormData();
    formData.append('file', audioBuffer, { filename, contentType });
    formData.append('model', 'whisper-1');
    formData.append('language', 'ko');
    
    console.log(`[VOICE DEBUG] 📤 Whisper API 요청 전송 중...`);
    
    const response = await axios.post('https://api.openai.com/v1/audio/transcriptions', formData, {
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        ...formData.getHeaders()
      },
      maxContentLength: Infinity,
      maxBodyLength: Infinity
    });
    
    console.log(`[VOICE DEBUG] ✅ 음성 변환 완료: "${response.data.text}"`);
    return response.data.text;
  } catch (error) {
    console.error(`[VOICE DEBUG] ❌ 음성 변환 실패:`, error.response ? error.response.data : error.message);
    throw error;
  }
}

function downloadFile(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => resolve(Buffer.concat(chunks)));
      response.on('error', reject);
    }).on('error', reject);
  });
}

function getContentType(filename) {
  const ext = path.extname(filename).toLowerCase();
  switch (ext) {
    case '.ogg': return 'audio/ogg';
    case '.webm': return 'audio/webm';
    case '.mp3': return 'audio/mpeg';
    case '.wav': return 'audio/wav';
    case '.m4a': return 'audio/mp4';
    default: return 'audio/ogg';
  }
}

module.exports = { transcribeAudio, downloadFile, getContentType };
