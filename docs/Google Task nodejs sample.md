
구글 태스크(Google Tasks) API를 Node.js로 사용하여 신규 태스크를 추가하는 예제를 아래에 제공합니다. 이전 예제에 태스크 추가 기능을 포함하여 업데이트된 버전입니다.

### 샘플 코드
```javascript
const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

// OAuth 2.0 설정
const SCOPES = ['https://www.googleapis.com/auth/tasks'];
const CREDENTIALS_PATH = path.join(__dirname, 'credentials.json');
const TOKEN_PATH = path.join(__dirname, 'token.json');

const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH));

// OAuth2 클라이언트 생성
const { client_secret, client_id, redirect_uris } = credentials.installed;
const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

// 토큰 로드 또는 인증 URL 생성
async function authorize() {
  let token;
  try {
    token = fs.readFileSync(TOKEN_PATH);
    oAuth2Client.setCredentials(JSON.parse(token));
  } catch (err) {
    const authUrl = oAuth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: SCOPES,
    });
    console.log('인증 URL:', authUrl);
    // 사용자가 authUrl을 열고 코드를 얻은 후 아래 코드를 수정해 코드를 입력
    // const code = '사용자 입력 코드';
    // const { tokens } = await oAuth2Client.getToken(code);
    // oAuth2Client.setCredentials(tokens);
    // fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens));
    // console.log('토큰 저장 완료');
  }
  return oAuth2Client;
}

// 태스크 목록 가져오기
async function listTasks(auth) {
  const tasks = google.tasks({ version: 'v1', auth });
  const res = await tasks.tasklists.list();
  const taskLists = res.data.items;
  if (taskLists && taskLists.length) {
    console.log('태스크 목록:');
    for (const list of taskLists) {
      const tasksRes = await tasks.tasks.list({ tasklist: list.id });
      console.log(`- ${list.title}:`, tasksRes.data.items || '작업 없음');
    }
  } else {
    console.log('태스크 목록이 없습니다.');
  }
}

// 신규 태스크 추가
async function addTask(auth) {
  const tasks = google.tasks({ version: 'v1', auth });
  const res = await tasks.tasklists.list();
  const taskLists = res.data.items;

  if (taskLists && taskLists.length) {
    const tasklistId = taskLists[0].id; // 기본 태스크 리스트 사용
    const task = {
      title: '새로운 작업 - ' + new Date().toLocaleString(), // 현재 시간 포함
      notes: '추가 메모',
      due: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0] + 'T23:59:00.000Z', // 내일 마감
    };

    const response = await tasks.tasks.insert({
      tasklist: tasklistId,
      requestBody: task,
    });
    console.log('새로운 태스크 추가됨:', response.data.title);
  } else {
    console.log('태스크 리스트가 없습니다.');
  }
}

// 실행
authorize().then(async (auth) => {
  await listTasks(auth);
  await addTask(auth);
}).catch(console.error);
```

### 설치 및 실행
1. **의존성 설치**:
   ```bash
   npm init -y
   npm install googleapis
   ```
2. **credentials.json 파일 준비**:
   - Google Cloud Console에서 다운로드한 JSON 파일을 프로젝트 루트에 `credentials.json`로 저장.
3. **인증 과정**:
   - 코드를 실행하면 인증 URL이 출력됩니다. URL을 열어 Google 계정으로 로그인하고 권한을 승인한 후, 얻은 코드를 수동으로 코드에 삽입해야 합니다(위 코드의 주석 부분을 수정).
   - 이후 토큰이 `token.json`에 저장되어 재인증이 필요 없습니다.
4. **실행**:
   ```bash
   node script.js
   ```

### 추가 고려사항
- **태스크 리스트 선택**: 현재는 첫 번째 태스크 리스트에 추가되도록 설정되어 있습니다. 특정 리스트를 사용하려면 `tasklistId`를 원하는 리스트 ID로 변경하세요.
- **마감일 설정**: `due` 필드는 ISO 형식으로 설정되었으며, 필요에 따라 조정 가능합니다.
- **에러 처리**: 네트워크 오류나 API 제한을 고려해 try-catch 블록을 추가하세요.
- **보안**: `credentials.json`과 `token.json`은 Git에 올리지 않도록 `.gitignore`에 추가하세요.

이 코드는 태스크를 나열하고 새로운 작업을 추가하는 기본 기능을 제공하며, 필요에 따라 확장할 수 있습니다. 더 많은 기능이 필요하면 구글 개발자 문서를 참고하거나 실시간 웹 검색으로 최신 정보를 얻을 수 있습니다.