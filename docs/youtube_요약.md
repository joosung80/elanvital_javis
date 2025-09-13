
### 유튜브 요약 디스코드기능 추가 건  
- 트리거 조건
    - youtube url만 입력
    - {유튜브url} 요약해줘
    - 유튜브:{유튜브url}
- 액션
    - youtube api 를 활용하여 자막 관련된 정보를 가져온다 
    - summary prompt 활용하여 요약 결과물을 만들어낸다
    - 해당 결과물을 구글 sheet에 저장한다 
- 기존의 gemini 통한 youtube 요약 서비스는 진행하지 않음
- 추후 확장
    - 옵션으로 full or summary mode, default는 summary  

### 주요 리소스
#### 구글 sheet 
- 주소 : https://docs.google.com/spreadsheets/d/1E2G-tlnIdig1FI2QEU_7imBS2mkgHuK0c9MLqmxsOHQ/edit?gid=0#gid=0
- 컬럼 : title, summary, url, genre, keyword, created_date, read 


#### 유튜브 api 
```
### YouTube 동영상 transcript 조회
@youtubeurl = https://www.youtube.com/watch?v=Dt6u-yFEpsk
@lang = ko
@text = true
@mode = auto
@apikey = sd_944a4c7de5a7a7986248508913de7ace

### YouTube 동영상 transcript 조회 (여러 파라미터)
GET https://api.supadata.ai/v1/transcript?url={{youtubeurl}}&lang={{lang}}&text={{text}}&mode={{mode}}
x-api-key: {{apikey}}
```

#### 요약 프롬프트
```
**[목표]**
입력된 동영상 스크립트 [데이터]를 분석하여, 보고서에 최적화된 아래의 위계질서와 **간결한 설명체(개조식)** 문장으로 요약 노트를 생성합니다. 최종 결과물은 지정된 [출력 형식]에 따라 기계가 파싱하기 쉬운 형태로 생성되어야 합니다.

1.  **제목 (Title)**: 영상 전체를 대표하는 핵심 제목
2.  **장르 (Genre)**: 지정된 카테고리에 따라 분류된 장르
3.  **핵심 요약 (Overview)**: 전체를 조망하는 핵심 내용 (설명체)
4.  **키워드 (Keywords)**: 핵심을 관통하는 키워드
5.  **상세 노트 (Detailed Notes)**: 주제별 상세 내용 (설명체)

**[데이터]**
{여기에 동영상 스크립트, 자막(JSON) 등 분석할 데이터를 입력하세요}

**[세부 지시사항]**

1.  **장르 분류**: 영상 내용을 분석하여 아래 리스트에서 가장 적합한 **주 장르**와 **세부 장르**를 선택하여 `주장르#세부장르` 형식으로 생성합니다. 세부장르가 명확하지 않으면 주장르만 기입합니다.
    * **주 장르 리스트**: `Tech`, `Business`, `Readership`, `자기개발`
    * **(예시)**: `Tech#AI`, `Tech#LLM`, `Business#Marketing`, `Readership#독서법`

2.  **문체 (Writing Style)**: `핵심 요약`과 `상세 노트`의 모든 내용은 명사형으로 종결되는 간결한 설명체(개조식)로 작성합니다.
    * (예: `~의 중요성이 대두됨` → `~의 중요성 대두`)

3.  **결과물 구성**:
    * `✨ 핵심 요약`: 영상의 가장 중요한 결론이나 메시지를 3개의 불릿포인트(-)로 요약합니다.
    * `🔑 키워드`: 영상 전체를 대표하는 핵심 키워드 3개를 쉼표(,)로 구분하여 제시합니다.
    * `📝 상세 노트`: 영상의 핵심 주제를 3~5개로 나누고, 각 주제의 내용을 📌 이모티콘과 굵은 글씨로 시작하여 불릿포인트(-)로 정리합니다.

4.  **전체 출력 형식**: 각 항목을 명확히 구분하기 위해 아래 형식을 **반드시 준수**합니다.

    `🎬 Title:` {생성된 제목}
    `📚 Genre:` {분류된 장르}
    `✨ Overview:`
    - {요약 1}
    - {요약 2}
    - {요약 3}
    `🔑 Keywords:` {키워드 1}, {키워드 2}, {키워드 3}
    `---`
    `📝 Detailed Notes:`
    `📌` **{주제 1}**
    - {상세 내용 1}
    - {상세 내용 2}
    `📌` **{주제 2}**
    - {상세 내용 1}
    - {상세 내용 2}
```