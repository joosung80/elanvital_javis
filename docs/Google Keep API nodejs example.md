
## Google Keep API와 Node.js 연동 예제

현재 Google Keep은 일반 소비자가 사용할 수 있는 공개 API를 공식적으로 제공하지 않습니다. 주로 Google Workspace 구독을 사용하는 기업 환경 내에서 관리자가 노트를 관리(생성, 나열, 삭제 등)할 수 있도록 제한적인 [REST API](https://developers.google.com/workspace/keep/api/guides?hl=ko)를 제공합니다.

하지만 **Google의 공식 Node.js 클라이언트 라이브러리인 `googleapis`**를 사용하면, 필요한 인증 절차를 거쳐 Google Keep API를 호출하는 코드를 작성할 수 있습니다. 아래에서는 OAuth 2.0 인증을 통해 Node.js 환경에서 Google Keep에 새로운 노트를 생성하는 예제를 단계별로 설명합니다.

---

### 1단계: 프로젝트 설정 및 API 활성화

Google API를 사용하려면 먼저 Google Cloud Platform(GCP)에서 프로젝트를 설정하고 필요한 API를 활성화해야 합니다.

1. **GCP 프로젝트 생성**: [Google Cloud Console](https://console.cloud.google.com/)에 접속하여 새 프로젝트를 생성합니다.
    
2. **Google Keep API 활성화**: 생성한 프로젝트의 'API 및 서비스' 대시보드로 이동하여 'API 및 서비스 사용 설정'을 클릭한 후 "Google Keep API"를 검색하여 활성화합니다.
    
3. **OAuth 동의 화면 구성**: 'OAuth 동의 화면' 메뉴에서 애플리케이션 유형, 이름, 지원 이메일 등 필요한 정보를 입력합니다. 테스트 목적으로는 '사용자 유형'을 '외부'로 선택하고 테스트 사용자를 추가할 수 있습니다.
    
4. **사용자 인증 정보 생성**:
    
    - '사용자 인증 정보' 메뉴에서 '+ 사용자 인증 정보 만들기'를 클릭하고 'OAuth 클라이언트 ID'를 선택합니다.
        
    - 애플리케이션 유형으로 '데스크톱 앱' 또는 '웹 애플리케이션'을 선택합니다. 이 예제에서는 '데스크톱 앱'을 기준으로 설명합니다.
        
    - 생성된 클라이언트 ID와 클라이언트 보안 비밀이 포함된 JSON 파일을 다운로드하여 프로젝트 폴더에 `credentials.json`이라는 이름으로 저장합니다.
        

---

### 2단계: Node.js 프로젝트 초기화 및 라이브러리 설치

다음으로, Node.js 프로젝트를 설정하고 필요한 라이브러리를 설치합니다.

Bash

```
# 프로젝트 폴더 생성 및 이동
mkdir google-keep-example
cd google-keep-example

# npm 프로젝트 초기화
npm init -y

# 필요한 라이브러리 설치
npm install googleapis @google-cloud/local-auth
```

- **`googleapis`**: Google API에 접근하기 위한 공식 Node.js 클라이언트 라이브러리입니다.
    
- **`@google-cloud/local-auth`**: 로컬 환경에서 간단하게 OAuth 2.0 인증 흐름을 처리해주는 라이브러리입니다.
    

---

### 3단계: 인증 및 API 호출 코드 작성

이제 실제 Node.js 코드를 작성하여 인증을 수행하고 Google Keep에 노트를 생성합니다. `index.js` 파일을 생성하고 아래 코드를 붙여넣으세요.

JavaScript

```
const path = require('path');
const process = require('process');
const {authenticate} = require('@google-cloud/local-auth');
const {google} = require('googleapis');

// 필요한 권한 범위(Scope) 설정
// 노트를 읽고 쓰기 위한 전체 권한을 요청합니다.
const SCOPES = ['https://www.googleapis.com/auth/keep'];

// 인증 정보 파일과 토큰 파일의 경로 설정
const CREDENTIALS_PATH = path.join(process.cwd(), 'credentials.json');
const TOKEN_PATH = path.join(process.cwd(), 'token.json');

/**
 * сохраненные/кэшированные учетные данные пользователя.
 * @return {Promise<OAuth2Client|null>}
 */
async function loadSavedCredentialsIfExist() {
  try {
    const content = await fs.readFile(TOKEN_PATH);
    const credentials = JSON.parse(content);
    return google.auth.fromJSON(credentials);
  } catch (err) {
    return null;
  }
}

/**
 * учетные данные пользователя, затем сохраняет их для последующих выполнений.
 * @return {Promise<OAuth2Client>}
 */
async function saveCredentials(client) {
  const content = await fs.readFile(CREDENTIALS_PATH);
  const keys = JSON.parse(content);
  const key = keys.installed || keys.web;
  const payload = JSON.stringify({
    type: 'authorized_user',
    client_id: key.client_id,
    client_secret: key.client_secret,
    refresh_token: client.credentials.refresh_token,
  });
  await fs.writeFile(TOKEN_PATH, payload);
}


/**
 * OAuth2 클라이언트를 로드하거나 새로 인증합니다.
 * @return {Promise<OAuth2Client>}
 */
async function authorize() {
  let client = await loadSavedCredentialsIfExist();
  if (client) {
    return client;
  }
  client = await authenticate({
    scopes: SCOPES,
    keyfilePath: CREDENTIALS_PATH,
  });
  if (client.credentials) {
    await saveCredentials(client);
  }
  return client;
}


/**
 * Google Keep에 새로운 텍스트 노트를 생성합니다.
 * @param {OAuth2Client} authClient 인증된 OAuth2 클라이언트
 */
async function createNote(authClient) {
  const keep = google.keep({version: 'v1', auth: authClient});

  const newNote = {
    title: 'Node.js에서 보낸 노트',
    body: {
      type: 'TEXT',
      textContent: {
        text: '이 노트는 googleapis 라이브러리를 통해 생성되었습니다. 📝'
      }
    }
  };

  try {
    const res = await keep.notes.create({
      requestBody: newNote,
    });
    console.log('노트가 성공적으로 생성되었습니다:');
    console.log(res.data);
  } catch (error) {
    console.error('노트 생성 중 오류가 발생했습니다:', error.message);
  }
}

// 메인 함수 실행
authorize().then(createNote).catch(console.error);
```

### 4단계: 스크립트 실행

터미널에서 아래 명령어를 실행합니다.

Bash

```
node index.js
```

스크립트를 처음 실행하면, 브라우저가 자동으로 열리면서 Google 계정으로 로그인하고 권한을 부여하라는 메시지가 표시됩니다. **"이 앱은 Google에서 확인하지 않았습니다."** 와 같은 경고가 표시될 수 있는데, 이는 직접 만든 테스트용 앱이기 때문입니다. '고급' 옵션을 클릭하여 진행하고, 요청하는 권한(Google Keep 노트 보기 및 관리)을 허용하면 됩니다.

인증이 성공적으로 완료되면, 터미널에 "노트가 성공적으로 생성되었습니다"라는 메시지와 함께 생성된 노트의 정보가 출력됩니다. 인증 정보는 프로젝트 폴더의 `token.json` 파일에 저장되어, 다음 실행부터는 브라우저 인증 절차를 다시 거치지 않습니다.

이제 실제 Google Keep 웹사이트나 앱을 열어보면 "Node.js에서 보낸 노트"라는 제목의 새 노트가 생성된 것을 확인할 수 있습니다.