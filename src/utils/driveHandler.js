/**
 * Google Drive 핸들러
 * - Google Drive (Docs, Sheets, Slides) 파일 검색
 * - 파일 내용 읽기 및 컨텍스트 변환
 */
const { google } = require('googleapis');
const { getAuthenticatedGoogleApis } = require('../google-auth');
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const { getOpenAIClient } = require('./openaiClient');
const { searchInDocument, getSmartKeywords } = require('./documentHandler');
const { readDocContent, readSheetContent, readSlidesContent, MIME_TYPES, getReadableMimeType } = require('./driveReadUtils');


async function searchDrive(keyword, targetType = 'all') {
    const { drive } = await getAuthenticatedGoogleApis();
    
    const keywords = keyword.split(' ').filter(k => k.trim() !== '');
    const nameQueries = keywords.map(k => `name contains '${k}'`).join(' and ');
    
    let query = `${nameQueries} and trashed = false`;
    
    const mimeQueries = [];
    if (targetType === 'all' || targetType === 'docs') {
        mimeQueries.push(`mimeType='${MIME_TYPES.docs}'`);
    }
    if (targetType === 'all' || targetType === 'sheets') {
        mimeQueries.push(`mimeType='${MIME_TYPES.sheets}'`);
    }
    if (targetType === 'all' || targetType === 'slides') {
        mimeQueries.push(`mimeType='${MIME_TYPES.slides}'`);
    }
    
    if (mimeQueries.length > 0) {
        query += ` and (${mimeQueries.join(' or ')})`;
    }

    console.log(`[DRIVE] 🔍 "${keyword}" 검색 중...`);

    const res = await drive.files.list({
        q: query,
        fields: 'files(id, name, mimeType, modifiedTime, iconLink, webViewLink)',
        pageSize: 5,
        orderBy: 'modifiedTime desc',
    });

    return res.data.files || [];
}

/**
 * 검색 결과를 Discord 메시지 형식으로 변환합니다.
 * @param {string} keyword - 검색 키워드
 * @param {Array<Object>} files - 검색된 파일 목록
 * @returns {string} Discord 메시지 내용
 */
function formatDriveSearchResults(keyword, files) {
    let message = `🔍 **Google Drive 검색 결과**\n**검색어:** "${keyword}"\n\n`;
    if (files.length === 0) {
        message += "검색 결과가 없습니다.";
        return message;
    }

    files.forEach((file, index) => {
        const fileType = file.mimeType === MIME_TYPES.docs ? '📄' 
                       : file.mimeType === MIME_TYPES.sheets ? '📊' 
                       : file.mimeType === MIME_TYPES.slides ? '💻' 
                       : '📁';
        const modifiedDate = new Date(file.modifiedTime).toLocaleDateString('ko-KR', {
            year: '2-digit',
            month: '2-digit',
            day: '2-digit'
        }).replace(/\s/g, '').slice(0, -1); // 'YY. MM. DD.' -> 'YY.MM.DD'

        message += `**${index + 1}. ${fileType} ${file.name}** (✍️ ${modifiedDate}) - [원본 링크](${file.webViewLink})\n`;
    });
    return message;
}

async function handleCombinedSearch(message, docKeyword, inDocKeyword, targetType) {
    const statusMessage = await message.reply(`🔍 **통합 검색 시작:** '${docKeyword}' 문서를 찾아서 '${inDocKeyword}' 키워드를 검색합니다...`);
    let failureSummary = [];

    try {
        // Step 1: Find the document with smart search
        let files = await searchDrive(docKeyword, targetType);
        if (!files || files.length === 0) {
            const isKorean = /[ㄱ-ㅎ|ㅏ-ㅣ|가-힣]/.test(docKeyword);
            if (isKorean) {
                const expansion = await getSmartKeywords(docKeyword);
                
                if (expansion && expansion.strategy === 'english' && expansion.keywords.length > 0) {
                    const englishKeyword = expansion.keywords[0];
                    await statusMessage.edit(`'${docKeyword}'(을)를 못찾았어요. 영어 키워드 '**${englishKeyword}**'(으)로 다시 찾아볼게요...`);
                    files = await searchDrive(englishKeyword, targetType);
                } else if (expansion && expansion.strategy === 'korean_synonyms' && expansion.keywords.length > 0) {
                    const koreanKeywords = expansion.keywords;
                    await statusMessage.edit(`'${docKeyword}'(을)를 못찾았어요. 유사 키워드 '**${koreanKeywords.join(', ')}**'(으)로 다시 찾아볼게요...`);
                    
                    let expandedFiles = [];
                    for (const newKeyword of koreanKeywords) {
                        const foundFiles = await searchDrive(newKeyword, targetType);
                        expandedFiles.push(...foundFiles);
                    }
                    files = Array.from(new Map(expandedFiles.map(file => [file.id, file])).values());
                } else if (expansion && expansion.keywords && expansion.keywords.length > 0) {
                    // fallback: strategy가 없어도 키워드가 있으면 시도
                    await statusMessage.edit(`'${docKeyword}'(을)를 못찾았어요. 유사 키워드 '**${expansion.keywords.join(', ')}**'(으)로 다시 찾아볼게요...`);
                    for (const newKeyword of expansion.keywords) {
                        const foundFiles = await searchDrive(newKeyword, targetType);
                        files.push(...foundFiles);
                    }
                    files = Array.from(new Map(files.map(file => [file.id, file])).values());
                }
            }
        }

        if (!files || files.length === 0) {
            failureSummary.push(`1️⃣ **문서 검색 실패:** '${docKeyword}'(와)과 관련된 문서를 찾지 못했습니다.`);
            failureSummary.push(`2️⃣ **검색 중단:** 따라서 문서 내 키워드 검색을 진행할 수 없습니다.`);
            await statusMessage.edit({ content: failureSummary.join('\n'), embeds: [] });
            return;
        }

        // 최대 3개 문서까지 처리
        const maxDocuments = Math.min(files.length, 3);
        const documentsToProcess = files.slice(0, maxDocuments);

        if (documentsToProcess.length > 1) {
            await statusMessage.edit(`📚 **다중 문서 검색:** '${docKeyword}'(으)로 **${documentsToProcess.length}개** 문서를 찾았습니다. 각 문서에서 '${inDocKeyword}' 키워드를 검색합니다...`);
        } else {
            const fileType = getReadableMimeType(documentsToProcess[0].mimeType);
            await statusMessage.edit(`✅ **문서 확인:** '${documentsToProcess[0].name}' (${fileType})(을)를 찾았습니다! 이제 내부에서 '${inDocKeyword}' 키워드를 검색합니다...`);
        }

        // Step 2: Process multiple documents
        let allResults = [];
        let processedCount = 0;
        let failedCount = 0;

        for (const file of documentsToProcess) {
            try {
                const fileType = getReadableMimeType(file.mimeType);
                
                // 문서 내용 읽기
                let fileContent = '';
                if (file.mimeType === MIME_TYPES.docs) fileContent = await readDocContent(file.id);
                else if (file.mimeType === MIME_TYPES.sheets) fileContent = await readSheetContent(file.id);
                else if (file.mimeType === MIME_TYPES.slides) fileContent = await readSlidesContent(file.id);

                if (!fileContent) {
                    failedCount++;
                    continue;
                }

                const document = { title: file.name, content: fileContent, url: file.webViewLink, mimeType: file.mimeType };

                // Step 3: Search keyword inside the document with smart search
                let searchResultText = searchInDocument(document, inDocKeyword);
                if (!searchResultText || searchResultText.trim() === '') {
                    const expansion = await getSmartKeywords(inDocKeyword, /[ㄱ-ㅎ|ㅏ-ㅣ|가-힣]/.test(inDocKeyword));
                    if (expansion && expansion.keywords && expansion.keywords.length > 0) {
                        let expandedResults = [];
                        for (const newKeyword of expansion.keywords) {
                            const newResult = searchInDocument(document, newKeyword);
                            if (newResult) expandedResults.push(`**'${newKeyword}'(으)로 검색한 결과:**\n${newResult}`);
                        }
                        searchResultText = expandedResults.join('\n\n');
                    }
                }

                if (searchResultText && searchResultText.trim() !== '') {
                    allResults.push({
                        title: file.name,
                        type: fileType,
                        url: file.webViewLink,
                        content: searchResultText
                    });
                }

                processedCount++;
                
                // 진행 상황 업데이트
                if (documentsToProcess.length > 1) {
                    await statusMessage.edit(`📚 **다중 문서 검색 진행 중:** ${processedCount}/${documentsToProcess.length} 문서 처리 완료...`);
                }

            } catch (error) {
                console.error(`[COMBINED_SEARCH] 문서 처리 실패: ${file.name}`, error);
                failedCount++;
            }
        }

        // Step 4: Present combined results
        if (allResults.length === 0) {
            failureSummary.push(`1️⃣ **문서 처리 완료:** ${processedCount}개 문서를 처리했습니다.`);
            failureSummary.push(`2️⃣ **키워드 검색 실패:** 하지만 어떤 문서에서도 '${inDocKeyword}'(와)과 관련된 내용을 찾지 못했습니다.`);
            if (failedCount > 0) {
                failureSummary.push(`3️⃣ **처리 실패:** ${failedCount}개 문서는 읽기에 실패했습니다.`);
            }
            await statusMessage.edit({ content: failureSummary.join('\n'), embeds: [] });
            return;
        }

        // 결과 포맷팅
        let combinedResultText = '';
        allResults.forEach((result, index) => {
            combinedResultText += `## 📄 ${result.title} (${result.type})\n\n`;
            combinedResultText += `${result.content}\n\n`;
            combinedResultText += `🔗 [${result.title}](${result.url})\n\n`;
            if (index < allResults.length - 1) {
                combinedResultText += `---\n\n`;
            }
        });

        const truncatedResult = combinedResultText.length > 3800 ? combinedResultText.substring(0, 3800) + '...' : combinedResultText;

        const resultEmbed = new EmbedBuilder()
            .setColor(0x0099FF)
            .setTitle(`'${inDocKeyword}' 다중 문서 통합 검색 결과`)
            .setDescription(truncatedResult)
            .addFields({ 
                name: '📊 검색 결과 요약', 
                value: `✅ 검색 성공: ${allResults.length}개 문서\n❌ 검색 실패: ${processedCount - allResults.length}개 문서${failedCount > 0 ? `\n⚠️ 읽기 실패: ${failedCount}개 문서` : ''}` 
            })
            .setFooter({ text: '다중 문서 통합 검색이 완료되었습니다.'})
            .setTimestamp();

        await statusMessage.edit({ content: `✅ **다중 문서 통합 검색 완료!**`, embeds: [resultEmbed] });

    } catch (error) {
        console.error('[COMBINED_SEARCH] 통합 검색 중 오류:', error);
        await statusMessage.edit('죄송합니다, 통합 검색을 처리하는 중에 심각한 오류가 발생했습니다.');
    }
}


/**
 * Google Drive 검색 요청을 처리하고 버튼과 함께 응답합니다.
 * @param {object} message - Discord 메시지 객체
 * @param {object} classification - 분류 결과
 * @param {Map} driveSearchSessions - 세션 저장을 위한 Map 객체
 */
async function handleDriveSearchRequest(message, classification, driveSearchSessions) {
    console.log(`🔍 드라이브 검색 요청 처리:`);
    console.log(`- 전체 분류 결과:`, classification);
    console.log(`- extractedInfo:`, classification.extractedInfo);
    
    const { searchKeyword, targetType, inDocumentKeyword } = classification.extractedInfo;
    
    console.log(`- searchKeyword: "${searchKeyword}"`);
    console.log(`- inDocumentKeyword: "${inDocumentKeyword}"`);
    console.log(`- targetType: "${targetType}"`);

    if (!searchKeyword || searchKeyword.trim() === '') {
        await message.reply('무엇을 검색할지 알려주세요! (예: "드라이브에서 마케팅 기획안 찾아줘")');
        return;
    }
    
    if (inDocumentKeyword) {
        await handleCombinedSearch(message, searchKeyword, inDocumentKeyword, targetType);
        return;
    }

    try {
        let files = await searchDrive(searchKeyword, targetType);
        let finalSearchKeywords = [searchKeyword];

        // 초기 검색 결과가 없을 경우 키워드 확장 검색
        if (!files || files.length === 0) {
            const isKorean = /[ㄱ-ㅎ|ㅏ-ㅣ|가-힣]/.test(searchKeyword);
            if (isKorean) {
                const sentMessage = await message.channel.send(`'${searchKeyword}'에 대한 문서를 찾지 못했습니다. 검색을 확장해볼게요... 🧐`);
                const expansion = await getSmartKeywords(searchKeyword);

                if (expansion && expansion.strategy === 'english' && expansion.keywords.length > 0) {
                    const englishKeyword = expansion.keywords[0];
                    finalSearchKeywords.push(englishKeyword);
                    await sentMessage.edit(`'${searchKeyword}'(을)를 영어 키워드 '**${englishKeyword}**'(으)로 다시 검색합니다... 🧐`);
                    files = await searchDrive(englishKeyword, targetType);
                } else if (expansion && expansion.strategy === 'korean_synonyms' && expansion.keywords.length > 0) {
                    const koreanKeywords = expansion.keywords;
                    finalSearchKeywords.push(...koreanKeywords);
                    await sentMessage.edit(`'${searchKeyword}'(와)과 유사한 한글 키워드 '**${koreanKeywords.join(', ')}**'(으)로 확장하여 검색합니다... 🧐`);
                    
                    let expandedFiles = [];
                    for (const newKeyword of koreanKeywords) {
                        const foundFiles = await searchDrive(newKeyword, targetType);
                        expandedFiles.push(...foundFiles);
                    }
                    
                    files = Array.from(new Map(expandedFiles.map(file => [file.id, file])).values());
                } else {
                    await sentMessage.delete(); // 확장 검색 실패 시 메시지 삭제
                }
            }
        }

        if (!files || files.length === 0) {
            await message.reply(`'${finalSearchKeywords.join(', ')}'(으)로 문서를 찾지 못했습니다. 다른 키워드로 시도해보세요.`);
            return;
        }

        const sessionId = `${message.author.id}_${Date.now()}`;
        driveSearchSessions.set(sessionId, {
            files: files,
            userId: message.author.id,
            keyword: searchKeyword,
        });

        const buttons = files.map((file, i) => {
            const numberEmojis = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣'];
            return new ButtonBuilder()
                .setCustomId(`read_drive_${sessionId}_${i}`)
                .setLabel(`${i + 1}번 읽기`)
                .setStyle(ButtonStyle.Secondary)
                .setEmoji(numberEmojis[i] || '📖');
        });
        
        const actionRow = new ActionRowBuilder().addComponents(buttons);

        await message.channel.send({
            content: `🔍 **Google Drive에서 '${searchKeyword}' 검색 결과**\n\n${formatDriveSearchResults(searchKeyword, files)}`,
            components: [actionRow],
        });

    } catch (error) {
        console.error('[DRIVE_SEARCH] 드라이브 검색 중 오류:', error);
        await message.reply('드라이브 검색 중 오류가 발생했습니다.');
    }
}


/**
 * '문서 읽기' 버튼 상호작용을 처리합니다.
 * @param {object} interaction - Discord 상호작용 객체
 * @param {Map} driveSearchSessions - 세션이 저장된 Map 객체
 */
async function handleDriveReadButton(interaction, driveSearchSessions) {
    try {
        await interaction.deferReply({ ephemeral: false });

        const customIdParts = interaction.customId.split('_');
        const sessionId = `${customIdParts[2]}_${customIdParts[3]}`; // Reconstruct sessionId
        const fileIndex = parseInt(customIdParts[4], 10);
        
        const session = driveSearchSessions.get(sessionId);

        if (!session) {
            console.error('[DRIVE_READ_ERROR] Session expired or not found for ID:', sessionId);
            await interaction.editReply('세션이 만료되었거나 찾을 수 없습니다. 다시 검색해주세요.');
            return;
        }

        const file = session.files[fileIndex];
        
        let fileContent = '';
        const fileType = getReadableMimeType(file.mimeType);
        if (file.mimeType === MIME_TYPES.docs) {
            fileContent = await readDocContent(file.id);
        } else if (file.mimeType === MIME_TYPES.sheets) {
            fileContent = await readSheetContent(file.id);
        } else if (file.mimeType === MIME_TYPES.slides) {
            fileContent = await readSlidesContent(file.id);
        } else {
            throw new Error('지원하지 않는 파일 형식입니다.');
        }

        const documentToSave = {
            title: file.name,
            content: fileContent,
            url: file.webViewLink,
            mimeType: file.mimeType, // mimeType explicitly included
        };

        // client.memory를 사용하여 메모리 저장
        await interaction.client.memory.saveDocumentsToMemory(interaction.user.id, [documentToSave]);

        const preview = fileContent.length > 500 ? fileContent.substring(0, 500) + '...' : fileContent;
        let responseMessage = `✅ **${file.name}** 문서를 성공적으로 읽어 컨텍스트에 저장했습니다.\n`;
        responseMessage += `🔗 [**${file.name}**](${file.webViewLink})\n\n`;
        responseMessage += `**📖 내용 미리보기:**\n\`\`\`\n${preview}\n\`\`\`\n\n`;
        responseMessage += `💡 이제 이 문서에 대해 질문하거나 요약을 요청할 수 있습니다!`;

        const summarizeButton = new ButtonBuilder()
            .setCustomId('summarize_document')
            .setLabel('📝 이 문서 요약해줘')
            .setStyle(ButtonStyle.Success);

        const searchButton = new ButtonBuilder()
            .setCustomId('search_in_document')
            .setLabel('📄 이 문서에서 검색')
            .setStyle(ButtonStyle.Secondary);

        const row = new ActionRowBuilder().addComponents(summarizeButton, searchButton);

        await interaction.followUp({
            content: responseMessage,
            components: [row],
            ephemeral: false,
        });

    } catch (error) {
        console.error(`[DRIVE READ] ❌ 문서 읽기 실패:`, error);
        await interaction.followUp(`❌ **${file.name}** 문서 읽기 실패: ${error.message}`);
    }
}


module.exports = {
    searchDrive,
    formatDriveSearchResults,
    handleDriveSearchRequest,
    handleDriveReadButton,
    handleCombinedSearch
};
