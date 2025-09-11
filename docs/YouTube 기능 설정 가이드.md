# YouTube 동영상 스크립트 정리 기능 설정 가이드

## 개요
이 기능은 Gemini API를 사용하여 YouTube 동영상의 스크립트를 자동으로 정리해주는 기능입니다.

## 지원하는 입력 형식

### 1. 직접 URL 입력
```
https://www.youtube.com/watch?v=vuckM1d9Ez4
https://youtu.be/vuckM1d9Ez4
```

### 2. 텍스트 패턴
```
유튜브 링크 https://www.youtube.com/watch?v=vuckM1d9Ez4 요약해주세요
유튜브:https://www.youtube.com/watch?v=vuckM1d9Ez4
youtube:https://youtu.be/vuckM1d9Ez4
```

### 3. 슬래시 명령어
```
/youtube url:https://www.youtube.com/watch?v=vuckM1d9Ez4
```

## 환경변수 설정

### 필수 환경변수
`.env` 파일에 다음 환경변수를 추가해주세요:

```env
# Gemini API 키 (YouTube 동영상 처리용)
GEMINI_API_KEY=your_gemini_api_key_here
```

### Gemini API 키 발급 방법
1. [Google AI Studio](https://aistudio.google.com/) 접속
2. 로그인 후 "Get API Key" 클릭
3. 새 API 키 생성
4. 생성된 키를 `.env` 파일에 추가

## 기능 설명

### 처리 과정
1. 사용자가 YouTube URL을 입력
2. 봇이 URL 유효성 검사
3. Gemini API를 통해 동영상 분석
4. 스크립트 정리 및 요약 생성
5. 결과를 Discord 메시지 또는 파일로 전송

### 출력 형식
```
📝 전체 스크립트

### [00:00] 시작 부분
- 오디오: (음성 내용)
- 시각: (화면 설명)

### [MM:SS] 주요 내용
- 오디오: (음성 내용)
- 시각: (화면 설명)

📋 전체 요약
(3-5줄 요약)
```

## 제한사항

### YouTube 동영상 제한
- 공개 동영상만 처리 가능
- 비공개 또는 일부 공개 동영상은 처리 불가
- 무료 등급: 하루 8시간 이상의 동영상 업로드 불가
- 유료 등급: 동영상 길이 제한 없음

### Discord 메시지 제한
- 응답이 2000자를 초과하면 자동으로 텍스트 파일로 첨부
- 파일명: `youtube_transcript_{videoId}.txt`

## 오류 처리

### Gemini API 오류 시
- GPT를 사용한 폴백 응답 제공
- 서비스 안내 및 대안 방법 제안

### 일반적인 오류 메시지
- `❌ 올바른 유튜브 URL을 입력해주세요`
- `❌ 유튜브 동영상 처리 중 오류가 발생했습니다`
- `🔄 유튜브 동영상을 분석하고 있습니다... 잠시만 기다려주세요`

## 사용 예시

### 채팅창에서 사용
```
사용자: https://www.youtube.com/watch?v=vuckM1d9Ez4
봇: 🔄 유튜브 동영상을 분석하고 있습니다... 잠시만 기다려주세요.
봇: 📝 유튜브 동영상 스크립트 정리
     
     ### [00:00] 시작 부분
     - 오디오: 안녕하세요, 오늘은...
     - 시각: 화면에 제목이 표시됩니다...
```

### 슬래시 명령어로 사용
```
/youtube url:https://www.youtube.com/watch?v=vuckM1d9Ez4
```

## 문제 해결

### API 키 관련 문제
1. `.env` 파일에 `GEMINI_API_KEY`가 올바르게 설정되었는지 확인
2. API 키가 유효한지 Google AI Studio에서 확인
3. API 사용량 한도를 초과하지 않았는지 확인

### 동영상 처리 실패
1. 동영상이 공개 상태인지 확인
2. URL이 올바른 YouTube 형식인지 확인
3. 네트워크 연결 상태 확인

## 향후 개선 계획
- 더 다양한 YouTube URL 형식 지원
- 타임스탬프 기반 질문 답변 기능
- 동영상 요약 품질 개선
- 처리 속도 최적화
