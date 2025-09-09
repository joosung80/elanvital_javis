const { google } = require('googleapis');
const { authorize, getAuthenticatedGoogleApis } = require('../google-auth');
const { v4: uuidv4 } = require('uuid');
const { calculateMatchScore } = require('./similarityUtils');

// A simple in-memory cache for task sessions
const taskSessions = new Map();


/**
 * Lists the user's incomplete tasks.
 * @returns {Promise<Array<Object>>} A list of incomplete tasks.
 */
async function listTasks() {
    const auth = await authorize();
    const service = google.tasks({ version: 'v1', auth });
    
    console.log('[GOOGLE API] Tasks.tasklists.list() 호출');
    const taskLists = await service.tasklists.list({
        maxResults: 10,
    });
    console.log(`[GOOGLE API] ✅ 태스크 리스트 조회 완료: ${taskLists.data.items?.length || 0}개`);

    if (!taskLists.data.items || taskLists.data.items.length === 0) {
        console.log('No task lists found.');
        return [];
    }

    let allTasks = [];
    for (const tasklist of taskLists.data.items) {
        console.log(`[GOOGLE API] Tasks.tasks.list(${tasklist.id}) 호출`);
        const tasks = await service.tasks.list({
            tasklist: tasklist.id,
            showCompleted: false // Fetch only incomplete tasks
        });
        console.log(`[GOOGLE API] ✅ 태스크 조회 완료: ${tasks.data.items?.length || 0}개`);
        
        if (tasks.data.items) {
            allTasks = allTasks.concat(tasks.data.items.map(task => ({...task, tasklistId: tasklist.id, tasklistTitle: tasklist.title})));
        }
    }
    return allTasks;
}

/**
 * Searches for tasks matching keywords with smart completion logic.
 * @param {string} searchKeyword The keyword to search for in task titles.
 * @returns {Promise<{sessionId: string|null, matchedTasks: Array<Object>, autoCompleted: boolean, completedTask: Object|null}>}
 */
async function searchAndCacheTasks(searchKeyword) {
    const allTasks = await listTasks();
    
    if (allTasks.length === 0) {
        return { sessionId: null, matchedTasks: [], autoCompleted: false, completedTask: null };
    }

    // Calculate similarity scores for all tasks
    const tasksWithScores = allTasks.map(task => ({
        ...task,
        similarity: calculateMatchScore(searchKeyword, task.title)
    }));

    // Sort by similarity score (highest first)
    tasksWithScores.sort((a, b) => b.similarity - a.similarity);

    // Filter tasks with reasonable similarity (> 0.3)
    const reasonableMatches = tasksWithScores.filter(task => task.similarity > 0.3);

    if (reasonableMatches.length === 0) {
        return { sessionId: null, matchedTasks: [], autoCompleted: false, completedTask: null };
    }

    // 80% 이상 유사도이고 후보가 1개만 있으면 자동 완료
    const bestMatch = reasonableMatches[0];
    if (bestMatch.similarity >= 0.8 && reasonableMatches.length === 1) {
        try {
            const completedTask = await completeTask(bestMatch.id, bestMatch.tasklistId);
            return { 
                sessionId: null, 
                matchedTasks: [], 
                autoCompleted: true, 
                completedTask: { ...completedTask, similarity: bestMatch.similarity }
            };
        } catch (error) {
            console.error('Auto completion failed:', error);
            // Fall back to manual selection
        }
    }

    // Otherwise, cache for manual selection
    const sessionId = cacheTasksForCompletion(reasonableMatches);
    return { sessionId, matchedTasks: reasonableMatches, autoCompleted: false, completedTask: null };
}


/**
 * Caches a list of tasks for interactive completion.
 * @param {Array<Object>} tasks The list of tasks to cache.
 * @returns {string} The session ID for the cached tasks.
 */
function cacheTasksForCompletion(tasks) {
    const sessionId = uuidv4();
    taskSessions.set(sessionId, tasks);
    // Set a timeout to clear the session after a while (e.g., 5 minutes)
    setTimeout(() => taskSessions.delete(sessionId), 300000);
    return sessionId;
}

/**
 * Completes a task from a cached session.
 * @param {string} sessionId The session ID.
 * @param {number} taskIndex The index of the task to complete.
 * @returns {Promise<{success: boolean, message: string, task: object}>}
 */
async function executeTaskComplete(sessionId, taskIndex) {
    const tasks = taskSessions.get(sessionId);
    if (!tasks) {
        return { success: false, message: '세션이 만료되었거나 유효하지 않습니다. 다시 목록을 조회해주세요.' };
    }

    if (taskIndex < 0 || taskIndex >= tasks.length) {
        return { success: false, message: '잘못된 번호를 선택했습니다.' };
    }

    const taskToComplete = tasks[taskIndex];
    try {
        const completed = await completeTask(taskToComplete.id, taskToComplete.tasklistId);
        taskSessions.delete(sessionId); // Clear session after successful completion
        return { success: true, message: `✅ **'${taskToComplete.title}'** 할 일을 완료처리 했습니다.`, task: completed };
    } catch (error) {
        console.error('Error executing task completion:', error);
        return { success: false, message: '❌ 할 일 완료 처리에 실패했습니다.' };
    }
}


/**
 * Marks a task as complete.
 * @param {string} taskId The ID of the task to complete.
 * @param {string} tasklistId The ID of the tasklist the task belongs to.
 * @returns {Promise<Object>} The updated task.
 */
async function completeTask(taskId, tasklistId) {
    const auth = await authorize();
    const service = google.tasks({ version: 'v1', auth });

    console.log(`[GOOGLE API] Tasks.tasks.patch(${taskId}) 호출 - 완료 처리`);
    const response = await service.tasks.patch({
        tasklist: tasklistId,
        task: taskId,
        requestBody: {
            status: 'completed'
        }
    });
    console.log(`[GOOGLE API] ✅ 태스크 완료 처리 완료: "${response.data.title}"`);

    return response.data;
}


/**
 * Parses multiple tasks from various list formats.
 * @param {string} content The content containing multiple tasks.
 * @returns {Array<string>} Array of task titles.
 */
function parseMultipleTasks(content) {
    // Remove common prefixes and clean up the content
    const cleanContent = content.trim();
    
    // Comprehensive bullet point pattern - includes various Unicode bullet characters
    const bulletPattern = /^[\s]*[-*•○●◦‣▪▫⁃◾◽▸▹►▻⦿⦾⚫⚪🔸🔹🔺🔻]\s*(.+)$/gm;
    // Numbered list pattern
    const numberedPattern = /^[\s]*\d+[\.\)]\s*(.+)$/gm;
    
    let tasks = [];
    
    // Try numbered lists first
    const numberedMatches = [...cleanContent.matchAll(numberedPattern)];
    if (numberedMatches.length > 1) {
        tasks = numberedMatches.map(match => match[1].trim()).filter(task => task.length > 0);
        return tasks;
    }
    
    // Try bullet points with comprehensive pattern
    const bulletMatches = [...cleanContent.matchAll(bulletPattern)];
    if (bulletMatches.length >= 1) {
        tasks = bulletMatches.map(match => match[1].trim()).filter(task => task.length > 0);
        if (tasks.length > 0) {
            return tasks;
        }
    }
    
    // Try newline separated (only if multiple lines and no single long sentence)
    const lines = cleanContent.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    
    // Filter out header lines that contain command words
    const commandWords = ['추가해주세요', '추가해줘', '등록해주세요', '등록해줘', '만들어주세요', '만들어줘', '할일', '목록', '리스트'];
    const filteredLines = lines.filter(line => {
        // Skip lines that are primarily command/header text
        const isCommandLine = commandWords.some(word => line.includes(word)) && 
                             !line.match(bulletPattern) && // Not a bullet point
                             !line.match(numberedPattern); // Not a numbered item
        return !isCommandLine;
    });
    
    // If we have multiple lines after filtering, or bullet/numbered items, treat as multiple tasks
    if (filteredLines.length > 1 || 
        filteredLines.some(line => line.match(bulletPattern) || line.match(numberedPattern))) {
        
        // Extract content from bullet points and numbered lists
        const extractedTasks = filteredLines.map(line => {
            // Remove comprehensive bullet points
            let cleaned = line.replace(/^[\s]*[-*•○●◦‣▪▫⁃◾◽▸▹►▻⦿⦾⚫⚪🔸🔹🔺🔻]\s*/, '');
            // Remove numbers with dots or parentheses
            cleaned = cleaned.replace(/^[\s]*\d+[\.\)]\s*/, '');
            return cleaned.trim();
        }).filter(task => task.length > 0 && task.length < 100); // Avoid splitting long paragraphs
        
        if (extractedTasks.length > 0) {
            return extractedTasks;
        }
    }
    
    // If no pattern matches, return as single task
    return [cleanContent];
}

/**
 * Creates multiple tasks.
 * @param {Array<string>} taskTitles Array of task titles.
 * @returns {Promise<Array<Object>>} Array of created tasks.
 */
async function addMultipleTasks(taskTitles) {
    const auth = await authorize();
    const service = google.tasks({ version: 'v1', auth });
    
    console.log('[GOOGLE API] Tasks.tasklists.list() 호출 - 태스크 리스트 조회');
    const res = await service.tasklists.list();
    const taskLists = res.data.items;
    console.log(`[GOOGLE API] ✅ 태스크 리스트 조회 완료: ${taskLists?.length || 0}개`);

    if (!taskLists || taskLists.length === 0) {
        throw new Error('No task lists found. Please create a task list in Google Tasks first.');
    }
    
    const tasklistId = taskLists[0].id; // Use the default task list
    const createdTasks = [];
    const errors = [];

    // Create tasks one by one (Google Tasks API doesn't support batch creation)
    for (const title of taskTitles) {
        try {
            const task = {
                title: title.trim(),
            };

            console.log(`[GOOGLE API] Tasks.tasks.insert() 호출 - "${title}" 추가`);
            const response = await service.tasks.insert({
                tasklist: tasklistId,
                requestBody: task,
            });
            console.log(`[GOOGLE API] ✅ 태스크 생성 완료: "${response.data.title}"`);

            createdTasks.push(response.data);
        } catch (error) {
            console.error(`[GOOGLE API] ❌ 태스크 생성 실패 "${title}":`, error);
            errors.push({ title, error: error.message });
        }
    }

    return { createdTasks, errors };
}

/**
 * Creates a new task.
 * @param {string} title The title of the task.
 * @returns {Promise<Object>} The created task.
 */
async function addTask(title) {
    const auth = await authorize();
    const service = google.tasks({ version: 'v1', auth });
    
    // Get the first task list
    const res = await service.tasklists.list();
    const taskLists = res.data.items;

    if (!taskLists || taskLists.length === 0) {
        throw new Error('No task lists found. Please create a task list in Google Tasks first.');
    }
    
    const tasklistId = taskLists[0].id; // Use the default task list
    const task = {
        title: title,
    };

    const response = await service.tasks.insert({
        tasklist: tasklistId,
        requestBody: task,
    });

    console.log('New task created:', response.data.title);
    return response.data;
}

async function handleTaskRequest(message, classification, taskSessions, actualContent = null) {
    const taskType = classification.extractedInfo?.taskType;
    console.log(`[TASK] ${taskType} 요청 처리`);
    
    switch (taskType) {
        case 'add':
            try {
                let content = classification.extractedInfo.content;
                
                if (!content || content.trim() === '') {
                    // content가 없으면 원본 메시지에서 할일 내용을 추출해보기
                    const userInput = actualContent || message.content;
                    const taskKeywords = ['할일', '할 일', '추가해줘', '추가해주세요', '추가하기', '등록해줘', '등록해주세요'];
                    let extractedContent = userInput;
                    
                    // 할일 관련 키워드 제거하여 실제 할일 내용만 추출
                    taskKeywords.forEach(keyword => {
                        extractedContent = extractedContent.replace(new RegExp(keyword, 'gi'), '').trim();
                    });
                    
                    if (extractedContent && extractedContent.length > 0) {
                        content = extractedContent; // 추출된 내용을 content로 설정
                    } else {
                        await message.reply("추가할 할 일 내용이 없습니다. 다시 시도해주세요.");
                        return "할 일 내용 없음";
                    }
                }

                console.log(`[TASK] 추가 요청: "${content}"`);

                // 단일/복수 할 일을 모두 처리할 수 있는 파서 사용
                const tasksToAdd = parseMultipleTasks(content);
                
                if (tasksToAdd.length === 0) {
                    await message.reply("추가할 할 일을 찾지 못했습니다. `할일:` 다음이나 줄바꿈을 사용하여 할 일을 입력해주세요.");
                    return "추가할 할 일 없음";
                }

                const { createdTasks, errors } = await addMultipleTasks(tasksToAdd);

                let reply = "";
                if (createdTasks.length > 0) {
                    reply += `✅ **${createdTasks.length}개**의 할 일을 성공적으로 추가했습니다:\n`;
                    createdTasks.forEach(task => {
                        reply += `- ${task.title}\n`;
                    });
                }
                if (errors.length > 0) {
                    reply += `\n❌ **${errors.length}개**의 할 일 추가에 실패했습니다.`;
                }

                await message.reply(reply);
                return reply;

            } catch (error) {
                console.error('Google Tasks 할 일 추가 오류:', error);
                await message.reply("Google Tasks에 할 일을 추가하는 중 오류가 발생했습니다.");
                return "Google Tasks API 오류";
            }
        case 'query':
            return await executeTaskList(message);
        case 'complete':
            try {
                let content = classification.extractedInfo.content;
                
                if (!content || content.trim() === '') {
                    // content가 없으면 원본 메시지에서 할일 내용을 추출해보기
                    const userInput = actualContent || message.content;
                    const taskKeywords = ['할일', '할 일', '완료해줘', '완료해주세요', '완료하기'];
                    let extractedContent = userInput;
                    
                    // 할일 관련 키워드 제거하여 실제 할일 내용만 추출
                    taskKeywords.forEach(keyword => {
                        extractedContent = extractedContent.replace(new RegExp(keyword, 'gi'), '').trim();
                    });
                    
                    if (extractedContent && extractedContent.length > 0) {
                        content = extractedContent; // 추출된 내용을 content로 설정
                    } else {
                        await message.reply("완료할 할 일 내용이 없습니다. 다시 시도해주세요.");
                        return "할 일 내용 없음";
                    }
                }

                console.log(`[TASK] 완료 요청: "${content}"`);
                
                // 할일 검색 및 완료 처리
                const result = await searchAndCacheTasks(content);
                
                if (result.autoCompleted && result.completedTask) {
                    // 자동 완료된 경우
                    const reply = `✅ **'${result.completedTask.title}'** 할 일을 완료처리 했습니다.\n` +
                                `🎯 유사도: ${(result.completedTask.similarity * 100).toFixed(1)}%`;
                    await message.reply(reply);
                    return reply;
                } else if (result.matchedTasks && result.matchedTasks.length > 0) {
                    // 여러 후보가 있는 경우 선택 UI 제공
                    let reply = `🔍 **"${content}"**와 유사한 할 일을 찾았습니다:\n\n`;
                    
                    const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
                    const buttons = [];
                    const maxButtons = Math.min(result.matchedTasks.length, 5); // 최대 5개
                    
                    result.matchedTasks.slice(0, maxButtons).forEach((task, index) => {
                        reply += `${index + 1}. ${task.title} (${(task.similarity * 100).toFixed(1)}% 유사)\n`;
                        
                        const button = new ButtonBuilder()
                            .setCustomId(`complete_task_${result.sessionId}_${index}`)
                            .setLabel(`${index + 1}번 완료`)
                            .setStyle(ButtonStyle.Success);
                        buttons.push(button);
                    });
                    
                    reply += "\n💡 **완료할 할일을 선택해주세요:**";
                    
                    // 버튼을 5개씩 행으로 나누기
                    const rows = [];
                    for (let i = 0; i < buttons.length; i += 5) {
                        const row = new ActionRowBuilder()
                            .addComponents(buttons.slice(i, i + 5));
                        rows.push(row);
                    }
                    
                    await message.reply({
                        content: reply,
                        components: rows
                    });
                    
                    return reply;
                } else {
                    // 일치하는 할일이 없는 경우
                    const reply = `❌ **"${content}"**와 일치하는 할 일을 찾을 수 없습니다.\n\n` +
                                `💡 할일 목록을 확인하려면 "할일 목록"이라고 말해보세요.`;
                    await message.reply(reply);
                    return reply;
                }

            } catch (error) {
                console.error('Google Tasks 할 일 완료 오류:', error);
                await message.reply("Google Tasks에서 할 일을 완료하는 중 오류가 발생했습니다.");
                return "Google Tasks API 오류";
            }
        default:
            return "알 수 없는 할 일 요청입니다.";
    }
}


/**
 * Google Tasks API를 사용하여 할 일 목록을 가져와 Discord에 표시
 * @param {object} message - Discord 메시지 객체
 */
async function executeTaskList(message) {
    const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
    
    try {
        const { tasks } = await getAuthenticatedGoogleApis();
        const taskLists = await tasks.tasklists.list({ maxResults: 10 });

        if (!taskLists.data.items || taskLists.data.items.length === 0) {
            await message.reply("해당 Google 계정에 할 일 목록이 없습니다.");
            return;
        }

        const taskListId = taskLists.data.items[0].id;
        const result = await tasks.tasks.list({
            tasklist: taskListId,
            maxResults: 20,
            showCompleted: false,
        });

        const taskItems = result.data.items;
        if (!taskItems || taskItems.length === 0) {
            await message.reply("현재 활성 할 일이 없습니다. 모든 일을 마치셨군요! 🎉");
            return "현재 활성 할 일이 없습니다.";
        }

        // 할일 목록을 세션에 저장 (버튼 처리용)
        const sessionId = cacheTasksForCompletion(taskItems.map(task => ({
            ...task,
            tasklistId: taskListId
        })));

        let reply = "📝 **현재 할 일 목록입니다!**\n\n";
        taskItems.forEach((task, index) => {
            reply += `${index + 1}. ${task.title}\n`;
        });

        // 버튼 생성 (최대 5개씩 행으로 나누어 표시)
        const buttons = [];
        const maxButtons = Math.min(taskItems.length, 25); // Discord 최대 25개 버튼 제한
        
        for (let i = 0; i < maxButtons; i++) {
            const button = new ButtonBuilder()
                .setCustomId(`complete_task_${sessionId}_${i}`)
                .setLabel(`${i + 1}번 ☑️`)
                .setStyle(ButtonStyle.Success);
            buttons.push(button);
        }

        // 버튼을 5개씩 행으로 나누기
        const rows = [];
        for (let i = 0; i < buttons.length; i += 5) {
            const row = new ActionRowBuilder()
                .addComponents(buttons.slice(i, i + 5));
            rows.push(row);
        }

        await message.reply({
            content: reply,
            components: rows
        });

        return reply;

    } catch (error) {
        console.error('Google Tasks API 오류:', error);
        await message.reply("Google Tasks API에서 할 일 목록을 가져오는 중 오류가 발생했습니다.");
        return "Google Tasks API 오류";
    }
}



/**
 * 할일 완료 버튼 클릭을 처리합니다.
 * @param {object} interaction - Discord 인터랙션 객체
 */
async function handleTaskCompleteButton(interaction) {
    const customId = interaction.customId;
    
    // complete_task_sessionId_taskIndex 형태 파싱
    const parts = customId.split('_');
    if (parts.length < 4) {
        await interaction.reply({ content: '❌ 잘못된 버튼 형식입니다.', ephemeral: true });
        return;
    }
    
    const sessionId = parts.slice(2, -1).join('_'); // sessionId 부분
    const taskIndex = parseInt(parts[parts.length - 1]); // 마지막 부분이 taskIndex
    
    console.log(`[TASK BUTTON] 할일 완료 요청 - 세션: ${sessionId}, 인덱스: ${taskIndex}`);
    
    try {
        const result = await executeTaskComplete(sessionId, taskIndex);
        
        if (result.success) {
            // 성공 시 원본 메시지 업데이트
            const originalMessage = interaction.message;
            const originalContent = originalMessage.content;
            
            // 완료된 할일을 취소선으로 표시
            const lines = originalContent.split('\n');
            const taskLineIndex = lines.findIndex(line => line.startsWith(`${taskIndex + 1}.`));
            
            if (taskLineIndex !== -1) {
                lines[taskLineIndex] = lines[taskLineIndex].replace(
                    /^(\d+\.\s)(.+)$/,
                    '$1~~$2~~ ✅'
                );
                
                const updatedContent = lines.join('\n');
                
                // 버튼 비활성화
                const updatedComponents = originalMessage.components.map(row => {
                    const newRow = new (require('discord.js').ActionRowBuilder)();
                    row.components.forEach(button => {
                        const newButton = new (require('discord.js').ButtonBuilder)()
                            .setCustomId(button.customId)
                            .setLabel(button.label)
                            .setStyle(button.style);
                        
                        if (button.customId === customId) {
                            newButton.setDisabled(true).setLabel(`${taskIndex + 1}번 완료됨`);
                        }
                        
                        newRow.addComponents(newButton);
                    });
                    return newRow;
                });
                
                await interaction.update({
                    content: updatedContent,
                    components: updatedComponents
                });
                
                // 별도 메시지로 완료 알림
                await interaction.followUp({ 
                    content: `${interaction.user.toString()} ${result.message}`, 
                    ephemeral: false 
                });
            } else {
                await interaction.reply({ content: result.message, ephemeral: true });
            }
        } else {
            await interaction.reply({ content: result.message, ephemeral: true });
        }
    } catch (error) {
        console.error('Task completion button error:', error);
        await interaction.reply({ content: '❌ 할일 완료 처리 중 오류가 발생했습니다.', ephemeral: true });
    }
}

module.exports = {
    listTasks,
    addTask,
    addMultipleTasks,
    completeTask,
    cacheTasksForCompletion,
    executeTaskComplete,
    searchAndCacheTasks,
    parseMultipleTasks,
    handleTaskRequest,
    handleTaskCompleteButton,
};
