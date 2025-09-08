Node.js에서 Google Drive API를 사용할 때 세션 만료 및 사용자 인증 문제를 해결하는 데 도움이 될 만한 몇 가지 방법과 코드 예제를 추천해 드립니다.

### **1. 문제의 원인**

Google Drive API는 **OAuth 2.0** 인증 방식을 사용합니다. 이 방식은 보안을 위해 액세스 토큰(Access Token)의 유효 기간을 짧게 설정합니다. 일반적으로 1시간 정도 유효하며, 이 시간이 지나면 토큰이 만료되어 API 호출 시 오류가 발생합니다.

이 문제를 해결하려면 \*\*리프레시 토큰(Refresh Token)\*\*을 사용하여 새로운 액세스 토큰을 발급받아야 합니다. 리프레시 토큰은 한 번 발급받으면 만료되지 않으며, 필요할 때마다 새로운 액세스 토큰을 얻는 데 사용됩니다.

### **2. 해결 방법: `googleapis` 라이브러리 활용**

Node.js 환경에서는 Google에서 공식적으로 지원하는 `googleapis` 라이브러리를 사용하는 것이 가장 편리합니다. 이 라이브러리는 리프레시 토큰을 자동으로 관리하여 세션 만료 문제를 해결해 줍니다.

**단계별 가이드:**

1.  **라이브러리 설치:**

    ```bash
    npm install googleapis
    ```

2.  **인증 정보 설정:**

      - [Google Cloud Console](https://console.cloud.google.com/)에서 프로젝트를 생성하고 Google Drive API를 활성화합니다.
      - '사용자 인증 정보' 메뉴에서 'OAuth 2.0 클라이언트 ID'를 생성하고, `credentials.json` 파일을 다운로드합니다. 이 파일에는 `client_id`, `client_secret`, `redirect_uris`와 같은 정보가 포함되어 있습니다.

3.  **인증 코드 예제:**
    다음은 `googleapis` 라이브러리를 사용하여 인증하고 API를 호출하는 기본적인 코드 예제입니다. 이 코드는 리프레시 토큰을 사용하여 자동으로 액세스 토큰을 갱신합니다.

    ```javascript
    const fs = require('fs').promises;
    const path = require('path');
    const process = require('process');
    const {authenticate} = require('@google-cloud/local-auth');
    const {google} = require('googleapis');

    // 스코프 설정 (수정 시 token.json 삭제)
    const SCOPES = ['https://www.googleapis.com/auth/drive.metadata.readonly'];
    // 토큰 저장 경로
    const TOKEN_PATH = path.join(process.cwd(), 'token.json');
    const CREDENTIALS_PATH = path.join(process.cwd(), 'credentials.json');

    /**
     * 저장된 인증 정보 불러오기
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
     * 인증 정보를 파일에 저장
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
     * 인증 절차 진행
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
     * 파일 목록 가져오기 (예제)
     */
    async function listFiles(authClient) {
      const drive = google.drive({version: 'v3', auth: authClient});
      const res = await drive.files.list({
        pageSize: 10,
        fields: 'nextPageToken, files(id, name)',
      });
      const files = res.data.files;
      if (files.length === 0) {
        console.log('No files found.');
        return;
      }
      console.log('Files:');
      files.map((file) => {
        console.log(`${file.name} (${file.id})`);
      });
    }

    authorize().then(listFiles).catch(console.error);
    ```

### **3. 코드 설명 및 주의사항**

  - **`credentials.json`**: Google Cloud Console에서 다운로드한 파일입니다.
  - **`token.json`**: 사용자가 처음 인증할 때 생성되는 파일로, 액세스 토큰과 **리프레시 토큰**이 저장됩니다. 이 파일이 있으면 다음 실행 시에는 별도의 인증 절차 없이 바로 API를 사용할 수 있습니다.
  - **스코프(`SCOPES`)**: API를 통해 접근할 권한 범위를 지정합니다. 필요한 권한에 맞게 설정해야 합니다.
  - **`authorize()` 함수**: `token.json` 파일이 있는지 확인하고, 파일이 있으면 저장된 인증 정보를 사용합니다. 파일이 없으면 새로운 인증 절차를 진행하여 `token.json` 파일을 생성합니다.

### **4. 추가 팁**

  - **리프레시 토큰 발급**: 리프레시 토큰은 사용자가 처음으로 애플리케이션에 로그인하고 동의할 때 한 번만 발급됩니다. 따라서 이 토큰을 안전하게 저장하고 관리하는 것이 중요합니다.
  - **서버 환경**: 웹 서버와 같이 여러 사용자를 동시에 처리해야 하는 환경에서는 각 사용자별로 리프레시 토큰을 데이터베이스에 저장하고 관리해야 합니다.
  - **공식 문서 참고**: 더 자세한 내용과 다양한 예제는 [Google Drive API Node.js Quickstart](https://developers.google.com/workspace/drive/api/quickstart/nodejs?hl=ko) 문서를 참고하시면 큰 도움이 될 것입니다.