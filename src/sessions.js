/**
 * 세션 관리
 * - Discord 상호작용(버튼 클릭 등) 간의 상태를 유지하기 위한 세션 저장소입니다.
 * - 각 기능별로 Map 객체를 사용하여 세션 정보를 관리합니다.
 */

const driveSearchSessions = new Map();
const taskSessions = new Map();
const deleteSessions = new Map();
const scheduleSessions = new Map();

module.exports = {
    driveSearchSessions,
    taskSessions,
    deleteSessions,
    scheduleSessions,
};
