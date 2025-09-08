const { google } = require('googleapis');
const { getAuthenticatedGoogleApis } = require('../google-auth');

const MIME_TYPES = {
    docs: 'application/vnd.google-apps.document',
    sheets: 'application/vnd.google-apps.spreadsheet',
    slides: 'application/vnd.google-apps.presentation',
};

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
    MIME_TYPES
};
