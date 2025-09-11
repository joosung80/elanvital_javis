# BACO - Discord Bot

Discord 기반의 다기능 봇으로 AI 채팅, 이미지 생성, 작업 관리, 일정 관리, YouTube 처리 등의 기능을 제공합니다.

## 기능

- 🤖 AI 채팅 (OpenAI GPT, Google Gemini)
- 🎨 이미지 생성 및 분석
- 📝 작업 관리 (Google Tasks 연동)
- 📅 일정 관리 (Google Calendar 연동)
- 🎥 YouTube 동영상 처리
- 💾 메모리 기능
- 🔍 Google Drive 검색

## 환경 변수 설정

프로젝트를 실행하기 전에 다음 환경 변수들을 설정해야 합니다. `.env_example` 파일을 `.env`로 복사한 후 각 키 값을 설정하세요.

```bash
cp .env_example .env
```

### 필수 환경 변수

| 환경 변수 | 설명 | 발급처 | 사용처 |
|-----------|------|--------|--------|
| `DISCORD_TOKEN` | Discord 봇 토큰 | [Discord Developer Portal](https://discord.com/developers/applications) | Discord 봇 로그인 및 인증 |
| `CLIENT_ID` | Discord 애플리케이션 클라이언트 ID | [Discord Developer Portal](https://discord.com/developers/applications) | 슬래시 커맨드 등록 |
| `GUILD_ID` | Discord 서버(길드) ID | Discord 서버 설정 | 특정 서버에 커맨드 등록 |
| `OPENAI_API_KEY` | OpenAI API 키 | [OpenAI Platform](https://platform.openai.com/api-keys) | GPT 모델을 이용한 AI 채팅, 이미지 생성, 음성 처리 |
| `GEMINI_API_KEY` | Google Gemini API 키 | [Google AI Studio](https://aistudio.google.com/app/apikey) | Gemini 모델을 이용한 이미지 분석, YouTube 처리 |

### 키 발급 방법

#### 1. Discord 설정
1. [Discord Developer Portal](https://discord.com/developers/applications)에 접속
2. "New Application" 클릭하여 새 애플리케이션 생성
3. **Bot** 탭에서 봇 생성 후 `DISCORD_TOKEN` 복사
4. **General Information** 탭에서 `CLIENT_ID` 복사
5. Discord 서버에서 서버 설정 → 고급 → 개발자 모드 활성화 후 서버 우클릭하여 `GUILD_ID` 복사

#### 2. OpenAI API 키
1. [OpenAI Platform](https://platform.openai.com/api-keys)에 로그인
2. "Create new secret key" 클릭
3. 생성된 키를 `OPENAI_API_KEY`에 설정

#### 3. Google Gemini API 키
1. [Google AI Studio](https://aistudio.google.com/app/apikey)에 접속
2. "Create API Key" 클릭
3. 생성된 키를 `GEMINI_API_KEY`에 설정

### Google 서비스 인증 (필수 - Google Drive, Calendar, Tasks 기능 사용시)

⚠️ **중요**: Google Drive 검색, 일정 관리, 작업 관리 기능을 사용하려면 반드시 `credentials.json` 파일이 필요합니다!

#### 1. Google Cloud Console 설정
1. [Google Cloud Console](https://console.cloud.google.com/)에 접속하여 새 프로젝트 생성
2. **API 및 서비스 > 라이브러리**에서 다음 API들을 활성화:
   - Google Drive API
   - Google Calendar API  
   - Google Tasks API
   - Google Docs API
   - Google Sheets API

#### 2. OAuth 2.0 클라이언트 ID 생성
1. **API 및 서비스 > 사용자 인증 정보**로 이동
2. **+ 사용자 인증 정보 만들기** → **OAuth 클라이언트 ID** 선택
3. 애플리케이션 유형: **데스크톱 애플리케이션** 선택
4. 이름 입력 후 **만들기** 클릭
5. 생성된 클라이언트 ID의 **JSON 다운로드** 버튼 클릭

#### 3. credentials.json 파일 배치
```bash
# 다운로드한 JSON 파일을 프로젝트 루트에 credentials.json으로 저장
cp ~/Downloads/client_secret_xxxxx.json ./credentials.json
```

**파일 구조 확인:**
```
baco/
├── credentials.json  ← 이 파일이 반드시 있어야 함!
├── .env
├── package.json
└── src/
```

❌ **credentials.json 파일이 없으면 발생하는 오류:**
- Google Drive 검색 실패
- 일정 관리 기능 오류  
- 작업 관리 기능 오류

## 설치 및 실행

### 1. 의존성 설치
```bash
npm install
```

### 2. 환경 변수 설정
```bash
cp .env_example .env
# .env 파일을 편집하여 각 키 값 설정
```

### 3. Google 인증 파일 확인 ⚠️
```bash
# credentials.json 파일이 프로젝트 루트에 있는지 확인
ls -la credentials.json

# 파일이 없다면 위의 "Google 서비스 인증" 섹션을 참고하여 설정
```

### 4. Discord 슬래시 커맨드 등록
```bash
node src/deploy-commands.js
```

### 5. 봇 실행
```bash
node src/index.js
```

### 🚨 실행 전 체크리스트
- [ ] `.env` 파일에 모든 필수 환경 변수 설정 완료
- [ ] `credentials.json` 파일이 프로젝트 루트에 존재
- [ ] Discord 봇이 서버에 초대되어 있음
- [ ] 필요한 Google API들이 활성화되어 있음

## 사용 가능한 커맨드

### 슬래시 커맨드
- `/help` - 도움말 보기
- `/image` - 이미지 생성 및 분석
- `/memory` - 메모리 관리
- `/myschedule` - 일정 관리
- `/task` - 작업 관리
- `/youtube` - YouTube 동영상 처리

### 숏컷 명령어
빠른 작업을 위한 간편한 숏컷 명령어를 지원합니다:

#### 드라이브 검색
- `드라이브#문서명` - Google Drive에서 문서 검색
- `문서#패스워드` - "패스워드" 키워드로 문서 검색
- `드라이브#패스워드#검색` - "패스워드" 문서에서 "검색" 키워드로 내용 검색

#### 일정 관리
- `일정#내일 3시 회의` - 내일 3시에 회의 일정 추가
- `일정#완료#오늘 점심약속` - 오늘 점심약속 일정 완료 처리
- `일정#이번주` - 이번주 일정 조회

#### 할일 관리
- `할일#보고서 작성` - "보고서 작성" 할일 추가
- `할일#완료#회의 준비` - "회의 준비" 할일 완료 처리
- `할일#조회` - 할일 목록 조회

#### 이미지 생성
- `이미지#고양이가 공원에서 노는 모습` - 이미지 생성

## 프로젝트 구조

```
src/
├── commands/          # Discord 슬래시 커맨드
├── config/           # 설정 파일
├── handlers/         # 이벤트 핸들러
├── services/         # 외부 서비스 연동
└── utils/            # 유틸리티 함수
```

## 라이선스

ISC
