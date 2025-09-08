const { google } = require('googleapis');
const { getAuthenticatedGoogleApis } = require('../google-auth');

const MIME_TYPES = {
    docs: 'application/vnd.google-apps.document',
    sheets: 'application/vnd.google-apps.spreadsheet',
    slides: 'application/vnd.google-apps.presentation',
};

/**
 * 마임타입을 사람이 읽기 좋은 형태로 변환
 * @param {string} mimeType - Google Drive 마임타입
 * @returns {string} 사람이 읽기 좋은 형태
 */
function getReadableMimeType(mimeType) {
    switch (mimeType) {
        case MIME_TYPES.docs:
            return 'Docs';
        case MIME_TYPES.sheets:
            return 'Sheets';
        case MIME_TYPES.slides:
            return 'Slides';
        default:
            return 'Unknown';
    }
}

async function readDocContent(documentId) {
    const { docs } = await getAuthenticatedGoogleApis();
    const response = await docs.documents.get({ documentId });
    const content = response.data.body.content;
    return content.map(element => {
        if (element.paragraph) {
            return element.paragraph.elements.map(elem => elem.textRun ? elem.textRun.content : '').join('');
        }
        return '';
    }).join('\n');
}

async function readSheetContent(spreadsheetId) {
    const { sheets } = await getAuthenticatedGoogleApis();
    const response = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: 'A1:E20', // Limit range for preview
    });
    const rows = response.data.values;
    return rows ? rows.map(row => row.join('\t')).join('\n') : '시트 내용을 읽을 수 없습니다.';
}

async function readSlidesContent(presentationId) {
    const { slides } = await getAuthenticatedGoogleApis();
    const response = await slides.presentations.get({ presentationId });
    const slideObjects = response.data.slides;
    let fullText = [];
    if (slideObjects) {
        slideObjects.forEach((slide, slideIndex) => {
            fullText.push(`--- Slide ${slideIndex + 1} ---`);
            if (slide.pageElements) {
                slide.pageElements.forEach(element => {
                    if (element.shape && element.shape.text) {
                        element.shape.text.textElements.forEach(textElement => {
                            if (textElement.textRun && textElement.textRun.content) {
                                fullText.push(textElement.textRun.content.trim());
                            }
                        });
                    }
                });
            }
        });
    }
    return fullText.join('\n');
}

module.exports = {
    readDocContent,
    readSheetContent,
    readSlidesContent,
    MIME_TYPES,
    getReadableMimeType
};
