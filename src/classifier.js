const { getOpenAIClient } = require('./utils/openaiClient');

async function classifyUserInput(message, client) {
    const userId = message.author.id;
    const userInput = message.content;

    const context = client.memory.getUserMemory(userId);
    const recentConversations = client.memory.getRecentConversations(userId);

    const formattedConversations = Array.from(recentConversations.values())
        .map(conv => `User: ${conv.user}\nBot: ${conv.bot}`)
        .join('\n\n');

    const lastDocument = context.lastDocument;
    const documentContext = lastDocument 
        ? `The user is currently interacting with a document titled "${lastDocument.title}". Document content snippet:\n${lastDocument.content.substring(0, 200)}...`
        : "The user is not interacting with any specific document right now.";
    
    const imageContext = context.lastImageUrl ? `The user has recently uploaded or interacted with an image.` : `There is no image context.`;

    const openai = getOpenAIClient();
    const systemPrompt = `You are a message classification expert for a Discord bot. Your task is to analyze the user's message and current context, then classify it into one of the following categories and extract relevant information. Your response MUST be a JSON object.

[CONTEXT]
- Recent Conversations:
${formattedConversations}
- Document Context: ${documentContext}
- Image Context: ${imageContext}

[CATEGORIES]
{
    "HELP": "User is asking for help about the bot's capabilities or commands. (e.g., '도와줘', '뭐 할 수 있어?', '명령어 알려줘').",
    "SCHEDULE": "User is asking to query, add, delete, or update a schedule. MUST extract 'scheduleType' ('query', 'add', 'delete', 'update') and 'period'. For 'add' and 'update', also extract 'content'.",
    "IMAGE": "User is asking to generate or edit an image. (e.g., '고양이 그리기', '이 이미지 수정하기').",
    "DRIVE": "User is asking to search, read, or summarize documents in Google Drive. This can also be a combined request to find a document AND search for a keyword inside it. Keywords: '드라이브', '독스', '시트', '문서', '파일', '자료'. MUST extract 'searchKeyword'. If the user wants to search for a keyword inside the document, ALSO extract 'inDocumentKeyword'.",
    "MEMORY": "User is asking the bot to remember or recall something. (e.g., '이거 기억해', '아까 뭐라고 했지?').",
    "TASK": "User is asking to manage a to-do list. (e.g., '할 일 목록 보여줘', '할 일 추가'). MUST extract 'taskType' ('query', 'add', 'complete').",
    "GENERAL": "A general conversation or a topic that doesn't fit into other categories."
}

[EXTRACTION RULES]
- For DRIVE, if the user says '해커스 문서 찾아줘', 'searchKeyword' MUST be '해커스', excluding '문서'.
- For DRIVE, if the user says '패스워드 문서에서 넷플릭스 검색', 'searchKeyword' MUST be '패스워드', and 'inDocumentKeyword' MUST be '넷플릭스'.
- For SCHEDULE, if the user says '다음 주 수요일 3시에 회의 추가해줘', 'period' is '다음 주 수요일 3시' and 'content' is '회의'.

[RESPONSE FORMAT]
{
  "category": "CATEGORY_NAME",
  "extractedInfo": {
    "scheduleType": "...",
    "period": "...",
    "content": "...",
    "searchKeyword": "...",
    "taskType": "..."
  }
}
`;

    try {
        const completion = await openai.chat.completions.create({
            model: "gpt-4-turbo",
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userInput }
            ],
            response_format: { type: "json_object" },
        });

        const result = JSON.parse(completion.choices[0].message.content);
        return result;

    } catch (error) {
        console.error('Error classifying user input:', error);
        return { category: 'GENERAL', extractedInfo: {} }; // Fallback to GENERAL
    }
}

module.exports = { classifyUserInput };
