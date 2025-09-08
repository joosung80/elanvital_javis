const { google } = require('googleapis');
const { getAuthenticatedGoogleApis } = require('../google-auth');
const { formatDate } = require('./formatUtils');
const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

/**
 * Google Sheets에서 키워드로 문서를 검색합니다.
 * @param {string} keyword - 검색할 키워드
 * @param {number} maxResults - 최대 결과 개수 (기본값: 5)
 * @returns {Promise<Array>} 검색된 문서 목록
 */
async function searchGoogleSheets(keyword, maxResults = 5) {
    try {
        console.log(`[SHEETS SEARCH] 🔍 키워드 '${keyword}'로 Google Sheets 검색 시작`);
        
        const { drive } = await getAuthenticatedGoogleApis();
        
        const query = `name contains '${keyword}' and mimeType='application/vnd.google-apps.spreadsheet' and trashed = false`;
        
        const response = await drive.files.list({
            q: query,
            pageSize: maxResults,
            fields: 'files(id, name, modifiedTime, webViewLink, owners)',
            orderBy: 'modifiedTime desc'
        });
        
        const files = response.data.files || [];
        console.log(`[SHEETS SEARCH] ✅ 검색 완료: ${files.length}개 Google Sheets 발견`);
        
        const processedSheets = files.map(file => ({
            id: file.id,
            title: file.name,
            modifiedTime: file.modifiedTime,
            webViewLink: file.webViewLink,
            owner: file.owners && file.owners[0] ? file.owners[0].displayName : '알 수 없음',
            modifiedTimeFormatted: formatDate(file.modifiedTime)
        }));
        
        return processedSheets;
        
    } catch (error) {
        console.error('[SHEETS SEARCH] ❌ Google Sheets 검색 실패:', error);
        throw error;
    }
}

/**
 * Google Sheets 문서를 읽고 텍스트로 변환합니다.
 * @param {string} spreadsheetId - 스프레드시트 ID
 * @returns {Promise<Object>} 문서 내용과 메타데이터
 */
async function readGoogleSheetAsText(spreadsheetId) {
    try {
        console.log(`[SHEETS READ] 📖 Google Sheets 읽기 시작: ${spreadsheetId}`);
        
        const { sheets } = await getAuthenticatedGoogleApis();
        
        // 스프레드시트 메타데이터 가져오기 (시트 이름 등)
        const sheetMetadata = await sheets.spreadsheets.get({
            spreadsheetId: spreadsheetId,
        });

        const firstSheetName = sheetMetadata.data.sheets[0].properties.title;
        console.log(`[SHEETS READ] 첫 번째 시트: ${firstSheetName}`);
        
        // 첫 번째 시트의 모든 데이터 가져오기
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: spreadsheetId,
            range: firstSheetName, // 첫 번째 시트 전체
        });

        const rows = response.data.values || [];
        let content = '';
        if (rows.length) {
            content = rows.map(row => row.join('\t')).join('\n');
        }

        const title = sheetMetadata.data.properties.title;
        const charCount = content.length;
        
        console.log(`[SHEETS READ] ✅ 문서 읽기 완료: ${title} (${charCount}자)`);

        return {
            id: spreadsheetId,
            title: title,
            content: content,
            charCount: charCount,
            webViewLink: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`
        };

    } catch (error) {
        console.error(`[SHEETS READ] ❌ 문서 읽기 실패: ${spreadsheetId}`, error);
        throw error;
    }
}

/**
 * Google Sheets 검색 결과를 포맷팅합니다.
 * @param {string} keyword - 검색 키워드
 * @param {Array} sheets - 검색된 문서 목록
 * @returns {string} 포맷된 메시지
 */
function formatSheetsSearchResults(keyword, sheets) {
    if (sheets.length === 0) {
        return `📊 **Google Sheets 검색 결과**\n\n**검색어:** "${keyword}"\n\n검색 결과가 없습니다.`;
    }
    
    let message = `📊 **Google Sheets 검색 결과**\n\n`;
    message += `**검색어:** "${keyword}"\n`;
    message += `**총 ${sheets.length}개 문서 발견**\n\n`;
    
    sheets.forEach((sheet, index) => {
        message += `📈 **${index + 1}. ${sheet.title}**\n`;
        message += `   👤 작성자: ${sheet.owner}\n`;
        message += `   📅 수정: ${sheet.modifiedTimeFormatted}\n`;
        message += `   🔗 [문서 링크](${sheet.webViewLink})\n\n`;
    });
    
    message += `💡 읽고 분석하려는 문서의 번호 버튼을 클릭하세요!`;
    
    return message;
}

/**
 * Google Sheets 키워드 검색 요청을 처리합니다.
 * @param {object} message - Discord 메시지 객체
 * @param {string} searchKeyword - 검색 키워드
 * @param {Map} sheetsSearchSessions - 세션 저장을 위한 Map 객체
 * @returns {Promise<string>} 처리 결과 메시지
 */
async function handleGoogleSheetsKeywordSearchRequest(message, searchKeyword, sheetsSearchSessions) {
    try {
        console.log(`[SHEETS KEYWORD SEARCH] 🔍 사용자 ${message.author.tag}가 '${searchKeyword}' 검색 요청`);

        if (!searchKeyword.trim()) {
            await message.reply('❌ **검색 키워드가 필요합니다!**\n\n예: "시트에서 예산안 찾아줘"');
            return '검색 키워드 없음';
        }

        const sheets = await searchGoogleSheets(searchKeyword, 5);

        if (sheets.length === 0) {
            const noResultMessage = `📊 **Google Sheets 검색 결과**\n\n**검색어:** "${searchKeyword}"\n\n검색 결과가 없습니다.`;
            await message.reply(noResultMessage);
            return noResultMessage;
        }

        const resultMessage = formatSheetsSearchResults(searchKeyword, sheets);

        const sessionId = `${message.author.id}_${Date.now()}`;
        sheetsSearchSessions.set(sessionId, {
            sheets: sheets,
            userId: message.author.id,
            keyword: searchKeyword,
            timestamp: Date.now()
        });

        const buttons = sheets.map((sheet, i) =>
            new ButtonBuilder()
                .setCustomId(`select_sheet_${sessionId}_${i}`)
                .setLabel(`${i + 1}번 문서 읽기`)
                .setStyle(ButtonStyle.Primary)
                .setEmoji('📊')
        );

        const actionRows = [];
        for (let i = 0; i < buttons.length; i += 5) {
            actionRows.push(new ActionRowBuilder().addComponents(buttons.slice(i, i + 5)));
        }

        await message.reply({
            content: resultMessage,
            components: actionRows
        });

        return resultMessage;

    } catch (error) {
        console.error(`[SHEETS KEYWORD SEARCH] ❌ 검색 실패:`, error);
        const errorMessage = `❌ **Google Sheets 검색 실패**\n\n${error.message}\n\n💡 Google Sheets 권한을 확인하거나 잠시 후 다시 시도해주세요.`;
        await message.reply(errorMessage);
        return errorMessage;
    }
}

module.exports = {
    searchGoogleSheets,
    readGoogleSheetAsText,
    formatSheetsSearchResults,
    handleGoogleSheetsKeywordSearchRequest,
};
