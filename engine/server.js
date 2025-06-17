const express = require('express');
const path = require('path');
const fs = require('fs').promises;
const marked = require('marked');

const app = express();
const PORT = 3000;
const ARCHIVE_DIR = path.join(__dirname, 'archive');

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

function getFileExtension(Filename)
{
    return path.extname(Filename).toLowerCase();
}

async function getTextFileContent(FilePath)
{
    try
    {
        const Content = await fs.readFile(FilePath, 'utf8');
        return Content;
    }
    catch
    {
        return null;
    }
}

function getRelevantSnippet(Content, Query)
{
    if (!Content || !Query)
    {
        return Content ? Content.split('\n')[0].trim() : '';
    }

    const LowerQuery = Query.toLowerCase();
    const Lines = Content.split('\n');

    for (const Line of Lines)
    {
        if (Line.toLowerCase().includes(LowerQuery))
        {
            let Snippet = Line.trim();

            if (Snippet.length > 100)
            {
                const QueryIndex = Snippet.toLowerCase().indexOf(LowerQuery);
                let Start = Math.max(0, QueryIndex - 20);
                let End = Math.min(Snippet.length, QueryIndex + LowerQuery.length + 50);

                if (Start > 0) Snippet = '...' + Snippet.substring(Start);
                if (End < Snippet.length) Snippet = Snippet.substring(0, End - Start) + '...';
                else Snippet = Snippet.substring(0, End - Start);
            }

            return Snippet;
        }
    }

    return Lines.length > 0 ? Lines[0].trim() : '';
}

async function getAllFilesRecursive(Dir)
{
    let Files = [];
    const Entries = await fs.readdir(Dir, { withFileTypes: true });

    for (const Entry of Entries)
    {
        const FullPath = path.join(Dir, Entry.name);
        if (Entry.isDirectory())
        {
            const SubFiles = await getAllFilesRecursive(FullPath);
            Files = Files.concat(SubFiles);
        }
        else
        {
            Files.push(FullPath);
        }
    }

    return Files;
}

app.get('/search', async (req, res) =>
{
    const Query = req.query.q ? req.query.q.toLowerCase() : '';
    const Results = [];

    try
    {
        const AllFiles = await getAllFilesRecursive(ARCHIVE_DIR);

        for (const FilePath of AllFiles)
        {
            const Stats = await fs.stat(FilePath);
            if (!Stats.isFile()) continue;

            const Extension = getFileExtension(FilePath);
            const RelativePath = path.relative(ARCHIVE_DIR, FilePath);
            const FileName = path.basename(FilePath);
            const DirTag = path.dirname(RelativePath).split(path.sep)[0].toUpperCase();

            const IsTextFile = ['.md', '.txt', '.json', '.xml', '.html', '.js', '.css'].includes(Extension);
            let ContentToSearch = FileName.toLowerCase();
            let FileContent = null;
            let FirstLine = '';
            let DisplaySnippet = '';

            if (IsTextFile)
            {
                FileContent = await getTextFileContent(FilePath);
                if (FileContent)
                {
                    const Lines = FileContent.split('\n');
                    FirstLine = Lines[0]?.trim() || '';
                    ContentToSearch += ' ' + FileContent.toLowerCase();
                }
            }

            if (Query === '')
            {
                DisplaySnippet = FirstLine || `[${Extension.substring(1).toUpperCase()} File]`;
            }
            else
            {
                let FoundInContent = false;

                if (IsTextFile && FileContent)
                {
                    DisplaySnippet = getRelevantSnippet(FileContent, Query);
                    if (DisplaySnippet.toLowerCase().includes(Query))
                    {
                        FoundInContent = true;
                    }
                }

                if (!FoundInContent && FileName.toLowerCase().includes(Query))
                {
                    DisplaySnippet = `ファイル名の一致：${FileName}`;
                }
                else if (!FoundInContent)
                {
                    DisplaySnippet = FirstLine || `[${Extension.substring(1).toUpperCase()} File]`;
                }
            }

            if (Query === '' || ContentToSearch.includes(Query))
            {
                Results.push({
                    fileName: RelativePath.replace(/\\/g, '/'),
                    displaySnippet: DisplaySnippet,
                    firstLineForTitle: FirstLine,
                    extension: Extension,
                    tag: DirTag
                });
            }
        }

        res.json(Results);
    }
    catch (Error)
    {
        console.error('Search error:', Error);
        res.status(500).json({ error: 'Internal server error.' });
    }
});

app.get('/document/:filename(*)', async (req, res) =>
{
    const Filename = req.params.filename;
    const FilePath = path.join(ARCHIVE_DIR, Filename);

    try
    {
        const Stats = await fs.stat(FilePath);
        if (!Stats.isFile())
        {
            return res.status(404).send('File not found.');
        }

        const Extension = getFileExtension(Filename);

        if (Extension === '.md')
        {
            const Content = await fs.readFile(FilePath, 'utf8');
            const HtmlContent = marked.parse(Content);
            res.send(HtmlContent);
        }
        else if (['.png', '.jpg', '.jpeg', '.gif', '.mp3', '.mp4', '.webp', '.svg'].includes(Extension))
        {
            res.sendFile(FilePath);
        }
        else
        {
            const Content = await fs.readFile(FilePath, 'utf8');
            res.setHeader('Content-Type', 'text/html');
            res.send(`<pre>${Content}</pre>`);
        }
    }
    catch (Error)
    {
        console.error(`Error serving document ${Filename}:`, Error);
        res.status(500).send('Error retrieving document.');
    }
});

app.listen(PORT, () =>
{
    console.log(`Server running on http://localhost:${PORT}`);
});
