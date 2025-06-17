// server.js
const express = require('express');
const path = require('path');
const fs = require('fs').promises;
const marked = require('marked');

const app = express();
const PORT = 3000;
const ARCHIVE_DIR = path.join(__dirname, 'archive');

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// Middleware to parse JSON bodies (if needed for future expansions)
app.use(express.json());

// Helper function to get file extension
function getFileExtension(filename) {
    return path.extname(filename).toLowerCase();
}

// Function to read and process text files for search
async function getTextFileContent(filePath) {
    try {
        const content = await fs.readFile(filePath, 'utf8');
        return content;
    } catch (error) {
        // console.error(`Error reading file ${filePath}:`, error); // Log only if really an error
        return null; // Return null if not a readable text file (e.g., binary)
    }
}

// Function to find the relevant line/snippet for search results
function getRelevantSnippet(content, query) {
    if (!content || !query) {
        return content ? content.split('\n')[0].trim() : ''; // Fallback to first line
    }

    const lowerCaseContent = content.toLowerCase();
    const lowerCaseQuery = query.toLowerCase();
    const lines = content.split('\n');

    for (const line of lines) {
        if (line.toLowerCase().includes(lowerCaseQuery)) {
            // Found a line with the query
            let snippet = line.trim();
            // Optional: Limit snippet length and add ellipsis
            if (snippet.length > 100) { // Limit to 100 characters for snippet
                const queryIndex = snippet.toLowerCase().indexOf(lowerCaseQuery);
                let start = Math.max(0, queryIndex - 20); // Start 20 chars before query
                let end = Math.min(snippet.length, queryIndex + lowerCaseQuery.length + 50); // End 50 chars after query

                if (start > 0) snippet = '...' + snippet.substring(start);
                if (end < snippet.length) snippet = snippet.substring(0, end - start) + '...';
                else snippet = snippet.substring(0, end - start);
            }
            return snippet;
        }
    }
    // If query not found in any specific line, fall back to first line
    return lines.length > 0 ? lines[0].trim() : '';
}


// Endpoint for searching documents
app.get('/search', async (req, res) => {
    const query = req.query.q ? req.query.q.toLowerCase() : '';
    const results = [];

    try {
        const files = await fs.readdir(ARCHIVE_DIR);

        for (const file of files) {
            const filePath = path.join(ARCHIVE_DIR, file);
            const stats = await fs.stat(filePath);

            if (stats.isFile()) {
                const ext = getFileExtension(file);
                let displaySnippet = ''; // This will be the line displayed in search results
                let contentToSearch = ''; // The full content (or filename) used for the search match
                let firstLineForTitle = ''; // Keep track of the very first line for the title format

                // Determine if it's a text-like file that we can read for content
                const isTextFile = ['.md', '.txt', '.json', '.xml', '.html', '.js', '.css'].includes(ext);

                // Always add filename to contentToSearch for a broader match
                contentToSearch += file.toLowerCase();

                let fileContent = null; // Store actual file content if read

                if (isTextFile) {
                    fileContent = await getTextFileContent(filePath);
                    if (fileContent) {
                        const lines = fileContent.split('\n');
                        if (lines.length > 0) {
                            firstLineForTitle = lines[0].trim();
                        }
                        contentToSearch += ' ' + fileContent.toLowerCase(); // Add content to search string
                    }
                }

                // Determine the displaySnippet based on query and content
                if (query === '') {
                    // No query:
                    if (firstLineForTitle) {
                        displaySnippet = firstLineForTitle;
                    } else {
                        // For non-text files or empty text files, display generic type
                        displaySnippet = `[${ext.substring(1).toUpperCase()} File]`;
                    }
                } else {
                    // Query is present:
                    let foundInContent = false;
                    if (isTextFile && fileContent) {
                        displaySnippet = getRelevantSnippet(fileContent, query);
                        // If getRelevantSnippet returns a snippet that contains the query, then it's found in content
                        if (displaySnippet.toLowerCase().includes(query)) {
                             foundInContent = true;
                        }
                    }

                    // If query wasn't found in content (or it's not a text file)
                    // and it's found in the filename, display filename as snippet or generic
                    if (!foundInContent && file.toLowerCase().includes(query)) {
                        displaySnippet = `Filename match: ${file}`;
                    } else if (!foundInContent && !file.toLowerCase().includes(query)) {
                         // Fallback for cases where query is present but not found clearly in snippet or filename
                         displaySnippet = `[${ext.substring(1).toUpperCase()} File]`;
                         if (firstLineForTitle) { // Prefer first line for text files if query not clearly matched in snippet/filename
                            displaySnippet = firstLineForTitle;
                         }
                    }
                    // If foundInContent is true, displaySnippet is already set by getRelevantSnippet
                }


                // Only add to results if the query is empty OR the `contentToSearch` contains the query.
                // This ensures that all files show when query is empty, and only relevant files otherwise.
                if (query === '' || contentToSearch.includes(query)) {
                    results.push({
                        fileName: file,
                        displaySnippet: displaySnippet,
                        firstLineForTitle: firstLineForTitle,
                        extension: ext
                    });
                }
            }
        }
        res.json(results);
    } catch (error) {
        console.error('Error during search:', error);
        res.status(500).json({ error: 'Internal server error during search.' });
    }
});

// Endpoint to get document content for display (no changes needed here)
app.get('/document/:filename', async (req, res) => {
    const filename = req.params.filename;
    const filePath = path.join(ARCHIVE_DIR, filename);

    try {
        const stats = await fs.stat(filePath);
        if (!stats.isFile()) {
            return res.status(404).send('File not found.');
        }

        const ext = getFileExtension(filename);

        if (ext === '.md') {
            const content = await fs.readFile(filePath, 'utf8');
            const htmlContent = marked.parse(content);
            res.send(htmlContent);
        } else if (['.png', '.jpg', '.jpeg', '.gif', '.mp3', '.mp4', '.webp', '.svg'].includes(ext)) {
            res.sendFile(filePath);
        } else {
            const content = await fs.readFile(filePath, 'utf8');
            res.setHeader('Content-Type', 'text/html');
            res.send(`<pre>${content}</pre>`);
        }
    } catch (error) {
        console.error(`Error serving document ${filename}:`, error);
        res.status(500).send('Error retrieving document.');
    }
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
