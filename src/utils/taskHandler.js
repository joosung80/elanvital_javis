const { google } = require('googleapis');
const { authorize } = require('../google-auth');
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
    const taskLists = await service.tasklists.list({
        maxResults: 10,
    });

    if (!taskLists.data.items || taskLists.data.items.length === 0) {
        console.log('No task lists found.');
        return [];
    }

    let allTasks = [];
    for (const tasklist of taskLists.data.items) {
        const tasks = await service.tasks.list({
            tasklist: tasklist.id,
            showCompleted: false // Fetch only incomplete tasks
        });
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

    const response = await service.tasks.patch({
        tasklist: tasklistId,
        task: taskId,
        requestBody: {
            status: 'completed'
        }
    });

    console.log(`Task '${response.data.title}' completed.`);
    return response.data;
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

module.exports = {
    listTasks,
    addTask,
    completeTask,
    cacheTasksForCompletion,
    executeTaskComplete,
    searchAndCacheTasks,
};
