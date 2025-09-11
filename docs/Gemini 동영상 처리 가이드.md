---
title: "동영상 이해  |  Gemini API"
created: 2025-09-10
tags:
  - "clippings"
  - "ChatGPT"
  - "VideoProcessing"
  - "GeminiAPI"
  - "FilesAPI"
  - "InlineVideo"
  - "YouTubeSupport"
  - "VideoMetadata"
  - "FrameRate"
  - "Timestamps"
  - "Transcription"
  - "VisualDescription"
  - "Multimodal"
  - "SupportedFormats"
  - "Tokenization"
  - "SafetyGuidance"
  - "UploadBestPractices"
CMDS:
  - "[[📚 66 Prompts]]"
  - "[[📚 671 ChatGPT]]"
source: "[[ChatGPT]]"
source_url: "https://ai.google.dev/gemini-api/docs/video-understanding?hl=ko"
---
> [!summary]+ 3줄 요약
> - 비디오 입력 방법: Files API 업로드(>20MB·재사용), 인라인 데이터(<20MB), 또는 YouTube URL 포함.
> - 생성 가능한 응답: 동영상 요약·분류·정보추출, 질문 응답, 특정 타임스탬프 참조 및 오디오·시각적 스크립트화.
> - 처리·맞춤 옵션: 클리핑(start/end), 프레임 속도(fps) 조정(기본 1FPS), 지원 형식 및 토큰 비용(초당 약 300토큰(기본 해상도)).

## Recommended Follow-up Questions
- 비디오 크기와 재사용 계획을 확인하세요: >20MB이거나 여러 요청에서 재사용할 경우 Files API 사용을 권장합니다.
- 응답에 타임스탬프가 필요하면 MM:SS 형식(예: 01:15)으로 프롬프트에 명시하세요.
- 빠른 장면 세부가 필요하면 videoMetadata로 fps를 높여 샘플링을 늘리세요(기본 1FPS는 세부 손실 가능).
- 하나의 요청에 여러 동영상을 넣을 필요가 있나요? 가능하지만 권장사항은 요청당 하나의 동영상 사용입니다.
- 비용과 토큰을 고려하세요: 동영상 길이에 따라 토큰 소모량이 큽니다(초당 약 100–300토큰).
- 테스트 단계: 짧은 클립으로 인라인 업로드 후 결과 확인 → 필요하면 Files API로 전환해 전체 워크플로우 구현.
- 다음 질문 예시: "동영상 크기와 길이는 얼마인가요?", "타임스탬프 기반 Q&A가 필요한가요?", "특정 프레임률(fps) 설정을 원하시나요?"

# ChatGPT's Last Words
Gemini 모델은 동영상을 처리할 수 있으므로 과거에 도메인별 모델이 필요했던 많은 최첨단 개발자 사용 사례를 지원합니다. Gemini의 시각 기능에는 다음이 포함됩니다.

- 동영상 설명, 분류, 정보 추출
- 동영상 콘텐츠에 관한 질문에 답변
- 동영상 내 특정 타임스탬프 참조

Gemini는 처음부터 멀티모달로 빌드되었으며, Google은 가능한 영역의 한계를 계속해서 확장하고 있습니다. 이 가이드에서는 Gemini API를 사용하여 동영상 입력을 기반으로 텍스트 응답을 생성하는 방법을 보여줍니다.

## 비디오 입력 장치

다음과 같은 방법으로 동영상을 Gemini에 입력으로 제공할 수 있습니다.

- `generateContent` 에 요청하기 전에 File API를 사용하여 [동영상 파일을 업로드](https://ai.google.dev/gemini-api/docs/?hl=ko#upload-video) 합니다. 20MB보다 큰 파일, 약 1분보다 긴 동영상 또는 여러 요청에서 파일을 재사용하려는 경우 이 메서드를 사용하세요.
- `generateContent` 요청과 함께 [인라인 동영상 데이터 전달](https://ai.google.dev/gemini-api/docs/?hl=ko#inline-video) 이 방법은 작은 파일 (<20MB)과 짧은 기간에 사용하세요.
- 프롬프트에 YouTube URL을 바로 [포함](https://ai.google.dev/gemini-api/docs/?hl=ko#youtube) 합니다.

### 동영상 파일 업로드

[Files API](https://ai.google.dev/gemini-api/docs/files?hl=ko) 를 사용하여 동영상 파일을 업로드할 수 있습니다. 파일, 텍스트 프롬프트, 시스템 지침 등을 포함한 총 요청 크기가 20MB보다 크거나, 동영상 재생 시간이 길거나, 여러 프롬프트에서 동일한 동영상을 사용하려는 경우 항상 Files API를 사용하세요. File API는 동영상 파일 형식을 직접 허용합니다.

다음 코드는 샘플 동영상을 다운로드하고, File API를 사용하여 업로드하고, 처리될 때까지 기다린 다음, `generateContent` 요청에서 파일 참조를 사용합니다.

```
from google import genai

client = genai.Client()

myfile = client.files.upload(file="path/to/sample.mp4")

response = client.models.generate_content(
    model="gemini-2.5-flash", contents=[myfile, "Summarize this video. Then create a quiz with an answer key based on the information in this video."]
)

print(response.text)
```
```
import {
  GoogleGenAI,
  createUserContent,
  createPartFromUri,
} from "@google/genai";

const ai = new GoogleGenAI({});

async function main() {
  const myfile = await ai.files.upload({
    file: "path/to/sample.mp4",
    config: { mimeType: "video/mp4" },
  });

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: createUserContent([
      createPartFromUri(myfile.uri, myfile.mimeType),
      "Summarize this video. Then create a quiz with an answer key based on the information in this video.",
    ]),
  });
  console.log(response.text);
}

await main();
```
```
uploadedFile, _ := client.Files.UploadFromPath(ctx, "path/to/sample.mp4", nil)

parts := []*genai.Part{
    genai.NewPartFromText("Summarize this video. Then create a quiz with an answer key based on the information in this video."),
    genai.NewPartFromURI(uploadedFile.URI, uploadedFile.MIMEType),
}

contents := []*genai.Content{
    genai.NewContentFromParts(parts, genai.RoleUser),
}

result, _ := client.Models.GenerateContent(
    ctx,
    "gemini-2.5-flash",
    contents,
    nil,
)

fmt.Println(result.Text())
```
```
VIDEO_PATH="path/to/sample.mp4"
MIME_TYPE=$(file -b --mime-type "${VIDEO_PATH}")
NUM_BYTES=$(wc -c < "${VIDEO_PATH}")
DISPLAY_NAME=VIDEO

tmp_header_file=upload-header.tmp

echo "Starting file upload..."
curl "https://generativelanguage.googleapis.com/upload/v1beta/files" \
  -H "x-goog-api-key: $GEMINI_API_KEY" \
  -D ${tmp_header_file} \
  -H "X-Goog-Upload-Protocol: resumable" \
  -H "X-Goog-Upload-Command: start" \
  -H "X-Goog-Upload-Header-Content-Length: ${NUM_BYTES}" \
  -H "X-Goog-Upload-Header-Content-Type: ${MIME_TYPE}" \
  -H "Content-Type: application/json" \
  -d "{'file': {'display_name': '${DISPLAY_NAME}'}}" 2> /dev/null

upload_url=$(grep -i "x-goog-upload-url: " "${tmp_header_file}" | cut -d" " -f2 | tr -d "\r")
rm "${tmp_header_file}"

echo "Uploading video data..."
curl "${upload_url}" \
  -H "Content-Length: ${NUM_BYTES}" \
  -H "X-Goog-Upload-Offset: 0" \
  -H "X-Goog-Upload-Command: upload, finalize" \
  --data-binary "@${VIDEO_PATH}" 2> /dev/null > file_info.json

file_uri=$(jq -r ".file.uri" file_info.json)
echo file_uri=$file_uri

echo "File uploaded successfully. File URI: ${file_uri}"

# --- 3. Generate content using the uploaded video file ---
echo "Generating content from video..."
curl "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent" \
    -H "x-goog-api-key: $GEMINI_API_KEY" \
    -H 'Content-Type: application/json' \
    -X POST \
    -d '{
      "contents": [{
        "parts":[
          {"file_data":{"mime_type": "'"${MIME_TYPE}"'", "file_uri": "'"${file_uri}"'"}},
          {"text": "Summarize this video. Then create a quiz with an answer key based on the information in this video."}]
        }]
      }' 2> /dev/null > response.json

jq -r ".candidates[].content.parts[].text" response.json
```

미디어 파일 작업에 대해 자세히 알아보려면 [Files API](https://ai.google.dev/gemini-api/docs/files?hl=ko) 를 참고하세요.

### 동영상 데이터를 인라인으로 전달

File API를 사용하여 동영상 파일을 업로드하는 대신 `generateContent` 요청에 더 작은 동영상을 직접 전달할 수 있습니다. 총 요청 크기가 20MB 미만인 짧은 동영상에 적합합니다.

다음은 인라인 동영상 데이터를 제공하는 예입니다.

```
# Only for videos of size <20Mb
video_file_name = "/path/to/your/video.mp4"
video_bytes = open(video_file_name, 'rb').read()

response = client.models.generate_content(
    model='models/gemini-2.5-flash',
    contents=types.Content(
        parts=[
            types.Part(
                inline_data=types.Blob(data=video_bytes, mime_type='video/mp4')
            ),
            types.Part(text='Please summarize the video in 3 sentences.')
        ]
    )
)
```
```
import { GoogleGenAI } from "@google/genai";
import * as fs from "node:fs";

const ai = new GoogleGenAI({});
const base64VideoFile = fs.readFileSync("path/to/small-sample.mp4", {
  encoding: "base64",
});

const contents = [
  {
    inlineData: {
      mimeType: "video/mp4",
      data: base64VideoFile,
    },
  },
  { text: "Please summarize the video in 3 sentences." }
];

const response = await ai.models.generateContent({
  model: "gemini-2.5-flash",
  contents: contents,
});
console.log(response.text);
```
```
VIDEO_PATH=/path/to/your/video.mp4

if [[ "$(base64 --version 2>&1)" = *"FreeBSD"* ]]; then
  B64FLAGS="--input"
else
  B64FLAGS="-w0"
fi

curl "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent" \
    -H "x-goog-api-key: $GEMINI_API_KEY" \
    -H 'Content-Type: application/json' \
    -X POST \
    -d '{
      "contents": [{
        "parts":[
            {
              "inline_data": {
                "mime_type":"video/mp4",
                "data": "'$(base64 $B64FLAGS $VIDEO_PATH)'"
              }
            },
            {"text": "Please summarize the video in 3 sentences."}
        ]
      }]
    }' 2> /dev/null
```

### YouTube URL 포함

Gemini API 및 AI Studio는 YouTube URL을 파일 데이터 `Part` 로 지원합니다. 모델에 동영상 콘텐츠를 요약하거나, 번역하거나, 그 밖의 방식으로 상호작용하도록 요청하는 프롬프트에 YouTube URL을 포함할 수 있습니다.

**제한사항:**

- 무료 등급의 경우 하루에 8시간 이상의 YouTube 동영상을 업로드할 수 없습니다.
- 유료 등급의 경우 동영상 길이에 따른 제한이 없습니다.
- 2.5 이전 모델의 경우 요청당 동영상 1개만 업로드할 수 있습니다. 2.5 이후 모델의 경우 요청당 최대 10개의 동영상을 업로드할 수 있습니다.
- 공개 동영상만 업로드할 수 있습니다 (비공개 또는 일부 공개 동영상은 업로드할 수 없음).

다음 예는 프롬프트와 함께 YouTube URL을 포함하는 방법을 보여줍니다.

```
response = client.models.generate_content(
    model='models/gemini-2.5-flash',
    contents=types.Content(
        parts=[
            types.Part(
                file_data=types.FileData(file_uri='https://www.youtube.com/watch?v=9hE5-98ZeCg')
            ),
            types.Part(text='Please summarize the video in 3 sentences.')
        ]
    )
)
```
```
import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });
const result = await model.generateContent([
  "Please summarize the video in 3 sentences.",
  {
    fileData: {
      fileUri: "https://www.youtube.com/watch?v=9hE5-98ZeCg",
    },
  },
]);
console.log(result.response.text());
```
```
package main

import (
  "context"
  "fmt"
  "os"
  "google.golang.org/genai"
)

func main() {
  ctx := context.Background()
  client, err := genai.NewClient(ctx, nil)
  if err != nil {
      log.Fatal(err)
  }

  parts := []*genai.Part{
      genai.NewPartFromText("Please summarize the video in 3 sentences."),
      genai.NewPartFromURI("https://www.youtube.com/watch?v=9hE5-98ZeCg","video/mp4"),
  }

  contents := []*genai.Content{
      genai.NewContentFromParts(parts, genai.RoleUser),
  }

  result, _ := client.Models.GenerateContent(
      ctx,
      "gemini-2.5-flash",
      contents,
      nil,
  )

  fmt.Println(result.Text())
}
```
```
curl "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent" \
    -H "x-goog-api-key: $GEMINI_API_KEY" \
    -H 'Content-Type: application/json' \
    -X POST \
    -d '{
      "contents": [{
        "parts":[
            {"text": "Please summarize the video in 3 sentences."},
            {
              "file_data": {
                "file_uri": "https://www.youtube.com/watch?v=9hE5-98ZeCg"
              }
            }
        ]
      }]
    }' 2> /dev/null
```

`MM:SS` 형식의 타임스탬프를 사용하여 동영상 내 특정 시점에 관해 질문할 수 있습니다.

```
prompt = "What are the examples given at 00:05 and 00:10 supposed to show us?" # Adjusted timestamps for the NASA video
```
```
const prompt = "What are the examples given at 00:05 and 00:10 supposed to show us?";
```
```
prompt := []*genai.Part{
        genai.NewPartFromURI(currentVideoFile.URI, currentVideoFile.MIMEType),
         // Adjusted timestamps for the NASA video
        genai.NewPartFromText("What are the examples given at 00:05 and " +
            "00:10 supposed to show us?"),
    }
```
```
PROMPT="What are the examples given at 00:05 and 00:10 supposed to show us?"
```

## 동영상 스크립트 작성 및 시각적 설명 제공

Gemini 모델은 오디오 트랙과 시각적 프레임을 모두 처리하여 동영상 콘텐츠를 스크립트로 작성하고 시각적 설명을 제공할 수 있습니다. 시각적 설명의 경우 모델은 **초당 1프레임** 의 속도로 동영상을 샘플링합니다. 이 샘플링 비율은 특히 시각적 요소가 빠르게 변하는 동영상의 경우 설명의 세부정보 수준에 영향을 미칠 수 있습니다.

```
prompt = "Transcribe the audio from this video, giving timestamps for salient events in the video. Also provide visual descriptions."
```
```
const prompt = "Transcribe the audio from this video, giving timestamps for salient events in the video. Also provide visual descriptions.";
```
```
prompt := []*genai.Part{
        genai.NewPartFromURI(currentVideoFile.URI, currentVideoFile.MIMEType),
        genai.NewPartFromText("Transcribe the audio from this video, giving timestamps for salient events in the video. Also " +
            "provide visual descriptions."),
    }
```
```
PROMPT="Transcribe the audio from this video, giving timestamps for salient events in the video. Also provide visual descriptions."
```

## 동영상 처리 맞춤설정

클리핑 간격을 설정하거나 맞춤 프레임 속도 샘플링을 제공하여 Gemini API에서 동영상 처리를 맞춤설정할 수 있습니다.

### 클리핑 간격 설정

시작 및 종료 오프셋으로 `videoMetadata` 를 지정하여 동영상을 클립할 수 있습니다.

```
response = client.models.generate_content(
    model='models/gemini-2.5-flash',
    contents=types.Content(
        parts=[
            types.Part(
                file_data=types.FileData(file_uri='https://www.youtube.com/watch?v=XEzRZ35urlk'),
                video_metadata=types.VideoMetadata(
                    start_offset='1250s',
                    end_offset='1570s'
                )
            ),
            types.Part(text='Please summarize the video in 3 sentences.')
        ]
    )
)
```

### 커스텀 프레임 속도 설정

`fps` 인수를 `videoMetadata` 에 전달하여 커스텀 프레임 속도 샘플링을 설정할 수 있습니다.

```
# Only for videos of size <20Mb
video_file_name = "/path/to/your/video.mp4"
video_bytes = open(video_file_name, 'rb').read()

response = client.models.generate_content(
    model='models/gemini-2.5-flash',
    contents=types.Content(
        parts=[
            types.Part(
                inline_data=types.Blob(
                    data=video_bytes,
                    mime_type='video/mp4'),
                video_metadata=types.VideoMetadata(fps=5)
            ),
            types.Part(text='Please summarize the video in 3 sentences.')
        ]
    )
)
```

기본적으로 동영상에서 초당 1프레임(FPS)이 샘플링됩니다. 긴 동영상의 경우 낮은 FPS (< 1)를 설정하는 것이 좋습니다. 이는 대부분 정적 동영상(예: 강의)에 특히 유용합니다. 빠르게 변화하는 영상에서 더 많은 세부정보를 캡처하려면 FPS 값을 더 높게 설정하는 것이 좋습니다.

## 지원되는 동영상 형식

Gemini는 다음과 같은 동영상 형식 MIME 유형을 지원합니다.

- `video/mp4`
- `video/mpeg`
- `video/mov`
- `video/avi`
- `video/x-flv`
- `video/mpg`
- `video/webm`
- `video/wmv`
- `video/3gpp`

## 동영상에 관한 기술 세부정보

- **지원되는 모델 및 컨텍스트**: 모든 Gemini 2.0 및 2.5 모델은 동영상 데이터를 처리할 수 있습니다.
	- 2M 컨텍스트 윈도우 모델은 기본 미디어 해상도에서 최대 2시간 또는 낮은 미디어 해상도에서 최대 6시간 길이의 동영상을 처리할 수 있으며, 1M 컨텍스트 윈도우 모델은 기본 미디어 해상도에서 최대 1시간 또는 낮은 미디어 해상도에서 최대 3시간 길이의 동영상을 처리할 수 있습니다.
- **File API 처리**: File API를 사용하면 동영상이 1FPS (초당 프레임 수)로 저장되고 오디오는 1Kbps (단일 채널)로 처리됩니다. 타임스탬프는 매초마다 추가됩니다.
	- 이러한 비율은 추론 개선을 위해 향후 변경될 수 있습니다.
	- [맞춤 프레임 속도를 설정](https://ai.google.dev/gemini-api/docs/?hl=ko#custom-frame-rate) 하여 1FPS 샘플링 속도를 재정의할 수 있습니다.
- **토큰 계산**: 동영상의 각 초는 다음과 같이 토큰화됩니다.
	- 개별 프레임 (1FPS로 샘플링됨):
		- [`mediaResolution`](https://ai.google.dev/api/generate-content?hl=ko#MediaResolution) 이 낮음으로 설정되면 프레임이 프레임당 66개 토큰으로 토큰화됩니다.
		- 그렇지 않으면 프레임이 프레임당 258개의 토큰으로 토큰화됩니다.
	- 오디오: 초당 토큰 32개
	- 메타데이터도 포함됩니다.
	- 총계: 기본 미디어 해상도 동영상에서 초당 약 300개 토큰 또는 낮은 미디어 해상도 동영상에서 초당 100개 토큰
- **타임스탬프 형식**: 프롬프트 내에서 동영상의 특정 순간을 언급할 때는 `MM:SS` 형식을 사용하세요 (예: 1분 15초 동안 `01:15`).
- **권장사항**:
	- 최적의 결과를 얻으려면 프롬프트 요청당 하나의 동영상만 사용하세요.
	- 텍스트와 단일 동영상을 결합하는 경우 `contents` 배열에서 동영상 부분 *뒤에* 텍스트 프롬프트를 배치합니다.
	- 빠른 동작 시퀀스는 1FPS 샘플링 레이트로 인해 세부정보가 손실될 수 있습니다. 필요한 경우 이러한 클립의 속도를 늦추는 것이 좋습니다.

## 다음 단계

이 가이드에서는 동영상 파일을 업로드하고 동영상 입력에서 텍스트 출력을 생성하는 방법을 보여줍니다. 자세한 내용은 다음 리소스를 참고하세요.

- [시스템 안내](https://ai.google.dev/gemini-api/docs/text-generation?hl=ko#system-instructions): 시스템 안내를 사용하면 특정 요구사항 및 사용 사례에 따라 모델의 동작을 조정할 수 있습니다.
- [Files API](https://ai.google.dev/gemini-api/docs/files?hl=ko): Gemini에서 사용할 파일을 업로드하고 관리하는 방법을 자세히 알아보세요.
- [파일 프롬프트 전략](https://ai.google.dev/gemini-api/docs/files?hl=ko#prompt-guide): Gemini API는 텍스트, 이미지, 오디오, 동영상 데이터로 프롬프트를 지정하는 것을 지원하며, 이를 멀티모달 프롬프트라고도 합니다.
- [안전 가이드](https://ai.google.dev/gemini-api/docs/safety-guidance?hl=ko): 생성형 AI 모델은 부정확하거나, 편향되거나, 불쾌감을 주는 등 예기치 않은 출력을 생성할 수 있습니다. 이러한 출력으로 인한 피해 위험을 제한하려면 후처리 및 사람의 평가가 필수적입니다.

달리 명시되지 않는 한 이 페이지의 콘텐츠에는 [Creative Commons Attribution 4.0 라이선스](https://creativecommons.org/licenses/by/4.0/) 에 따라 라이선스가 부여되며, 코드 샘플에는 [Apache 2.0 라이선스](https://www.apache.org/licenses/LICENSE-2.0) 에 따라 라이선스가 부여됩니다. 자세한 내용은 [Google Developers 사이트 정책](https://developers.google.com/site-policies?hl=ko) 을 참조하세요. 자바는 Oracle 및/또는 Oracle 계열사의 등록 상표입니다.

최종 업데이트: 2025-08-22(UTC)

# References
- 