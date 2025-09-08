/**
 * 날짜를 'YYYY년 MM월 DD일 HH:mm' 형식으로 포맷팅합니다.
 * @param {string} dateString - ISO 8601 형식의 날짜 문자열
 * @returns {string} 포맷된 날짜 문자열
 */
function formatDate(dateString) {
    if (!dateString) return '날짜 정보 없음';
    const date = new Date(dateString);
    return `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일 ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
}

module.exports = {
    formatDate,
};
