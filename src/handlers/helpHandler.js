async function handleHelpRequest(message, classification) {
  console.log(`[HELP DEBUG] 🆘 도움말 요청 처리 시작`);
  console.log(`[HELP DEBUG] 👤 사용자: ${message.author.tag}`);
  console.log(`[HELP DEBUG] 💬 메시지: "${message.content}"`);
  console.log(`[HELP DEBUG] 🎲 분류 신뢰도: ${classification.confidence}`);
  
  try {
    const helpMessage = `🤖 **Elanvital Agent 기능 안내**

저는 다음과 같은 기능들을 제공합니다:

📅 **일정 관리 (Schedule)**
• 일정 추가: "내일 오후 3시에 팀 회의 추가해줘"
• 일정 조회: "오늘 일정 알려줘", "다음주 스케줄"
• 일정 삭제: "오늘 회의 취소해줘"
• 인터랙티브 UI로 수정/삭제 가능

🎨 **이미지 생성 (Image)**
• 이미지 생성: "고양이 그림 그려줘"
• 이미지 수정: 이미지 업로드 후 "이걸 수정해줘"
• 인포그래픽 생성: "태양계 인포그래픽 만들어줘"
• ChatGPT 프롬프트 보강으로 고품질 이미지 생성

📄 **문서 분석 (Document)**
• PDF/Word 문서 분석: 파일 업로드 후 자동 분석
• 문서 요약: "문서 요약해줘"
• 문서 질문: "이 문서에서 핵심 내용은?"
• Markdown 형태로 구조화 저장

🧠 **메모리 관리 (Memory)**
• 대화 기록 저장 및 활용
• 이미지 기억 후 재활용
• 문서 내용 기억
• 메모리 정리: "메모리 정리해줘", "새 대화"

💬 **일반 질문 (General)**
• 모든 종류의 질문 답변
• 최근 문서 내용 활용한 답변
• 자연스러운 대화

🎤 **음성 인식 (Voice)**
• 모바일 음성 메시지 자동 변환
• OpenAI Whisper 기반 STT

✨ **특별 기능**
• 자연어 처리로 직관적 사용
• 메모리 기반 컨텍스트 유지
• 인터랙티브 UI (버튼, 모달)
• 모바일 친화적 메시지 분할

궁금한 점이 있으시면 언제든 말씀해주세요! 😊`;

    await message.reply(helpMessage);
    console.log(`[HELP DEBUG] ✅ 도움말 메시지 전송 완료`);
    return `도움말 제공 완료`;
    
  } catch (error) {
    console.error(`[HELP DEBUG] ❌ 도움말 처리 오류:`, error);
    await message.reply('도움말을 제공하는 중 오류가 발생했습니다.');
    return `도움말 처리 오류: ${error.message}`;
  }
}

module.exports = { handleHelpRequest };
