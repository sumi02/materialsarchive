// public/script.js
document.addEventListener('DOMContentLoaded', () => {
    // Get references to main view containers
    const searchView = document.getElementById('searchView');
    const documentView = document.getElementById('documentView');

    // Get references to elements within the search view
    const searchInput = document.getElementById('searchInput');
    const searchButton = document.getElementById('searchButton');
    const searchResultsDiv = document.getElementById('searchResults');
    const mainHeader = document.getElementById('mainHeader');
    const searchBox = document.getElementById('searchBox'); // Still need this for its own ID

    // Get references to elements within the document view (these must exist in the HTML initially)
    const currentDocumentName = document.getElementById('currentDocumentName');
    const documentContentDiv = document.getElementById('documentContent');
    const documentBackButton = document.querySelector('#documentView .back-button'); // Select button inside documentView

    // Other elements
    const pageTitle = document.getElementById('pageTitle');

    // State to manage current view
    let currentQuery = ''; // Store the last search query

    // Function to show/hide views
    const showView = (viewName) => {
        if (viewName === 'search') {
            searchView.style.display = 'block';
            documentView.style.display = 'none';
            pageTitle.textContent = 'materials archive (m.a.)'; // Reset main page title
        } else if (viewName === 'document') {
            searchView.style.display = 'none';
            documentView.style.display = 'block';
        }
    };

    // Function to perform search
    const performSearch = async (query = '') => {
        currentQuery = query; // Update current query
        showView('search'); // Show search view
        searchResultsDiv.innerHTML = '<p>検索中…</p>'; // Show loading message
        documentContentDiv.innerHTML = '<p>ドキュメントを読み込み中…</p>'; // Reset document content

        try {
            const response = await fetch(`/search?q=${encodeURIComponent(query)}`);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const results = await response.json();
            displayResults(results);
        } catch (error) {
            console.error('Error fetching search results:', error);
            searchResultsDiv.innerHTML = '<p style="color: red;">検索エラーが発生しました。もう一度お試しください。</p>';
        }
    };

    // Function to display search results (mostly unchanged, except for linking)
    const displayResults = (results) => {
        searchResultsDiv.innerHTML = ''; // Clear previous results
        if (results.length === 0) {
            searchResultsDiv.innerHTML = '<p>クエリに一致するドキュメントが見つかりません。</p>';
            return;
        }

        results.forEach(result => {
            const resultItem = document.createElement('div');
            resultItem.classList.add('result-item');

            const docNameWithoutExt = result.fileName.split('.').slice(0, -1).join('.');
            const previewTextContent = result.displaySnippet ? result.displaySnippet : `[${result.extension.substring(1).toUpperCase()} Document]`;

            const docTitle = result.firstLineForTitle ?
                `${docNameWithoutExt} | ${result.firstLineForTitle.substring(0, 50)}${result.firstLineForTitle.length > 50 ? '...' : ''}` :
                docNameWithoutExt;

            const link = document.createElement('a');
            link.href = `javascript:void(0)`; // Prevent default navigation
            link.textContent = docNameWithoutExt;
            link.title = `Open ${result.fileName}`;
            link.addEventListener('click', () => openDocument(result.fileName, docTitle));

            const previewText = document.createElement('p');
            previewText.textContent = previewTextContent;

            resultItem.appendChild(link);
            resultItem.appendChild(previewText);
            searchResultsDiv.appendChild(resultItem);
        });
    };

    // Function to open a document in the document view
    const openDocument = async (filename, titleForPage) => {
        showView('document'); // Show document view

        // Update document specific elements
        currentDocumentName.textContent = filename;
        pageTitle.textContent = titleForPage;
        documentContentDiv.innerHTML = '<p>Loading document...</p>'; // Show loading

        // Push state to browser history
        history.pushState({ view: 'document', filename: filename, query: currentQuery, title: titleForPage }, '', `?doc=${encodeURIComponent(filename)}`);

        try {
            const response = await fetch(`/document/${encodeURIComponent(filename)}`);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const fileExtension = filename.split('.').pop().toLowerCase();

            if (fileExtension === 'md') {
                const htmlContent = await response.text();
                documentContentDiv.innerHTML = htmlContent;
            } else if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(fileExtension)) {
                documentContentDiv.innerHTML = `<img src="/document/${encodeURIComponent(filename)}" alt="${filename}">`;
            } else if (fileExtension === 'mp3') {
                documentContentDiv.innerHTML = `<audio controls src="/document/${encodeURIComponent(filename)}"></audio>`;
            } else if (fileExtension === 'mp4') {
                documentContentDiv.innerHTML = `<video controls src="/document/${encodeURIComponent(filename)}"></video>`;
            } else {
                const textContent = await response.text();
                documentContentDiv.innerHTML = `<pre>${textContent}</pre>`;
            }
        } catch (error) {
            console.error('Error opening document:', error);
            documentContentDiv.innerHTML = `<p style="color: red;">Error displaying document: ${error.message}</p>`;
        }
    };

    // Handle browser back/forward buttons
    window.addEventListener('popstate', (event) => {
        if (event.state && event.state.view === 'document') {
            // Navigated back to a document view (e.g., from browser history)
            openDocument(event.state.filename, event.state.title);
        } else {
            // Navigated back to the search view
            performSearch(event.state ? event.state.query : ''); // Use stored query or empty
        }
    });

    // Event Listeners
    searchButton.addEventListener('click', () => performSearch(searchInput.value.trim()));
    searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            performSearch(searchInput.value.trim());
        }
    });

    // Initial load: Check if a document is specified in the URL (for direct linking or refresh)
    const urlParams = new URLSearchParams(window.location.search);
    const initialDoc = urlParams.get('doc');
    if (initialDoc) {
        // If there's a document in the URL, try to open it
        fetch(`/search?q=${encodeURIComponent(initialDoc)}`)
            .then(res => res.json())
            .then(data => {
                const foundDoc = data.find(d => d.fileName === initialDoc);
                if (foundDoc) {
                    const docNameWithoutExt = foundDoc.fileName.split('.').slice(0, -1).join('.');
                    const title = foundDoc.firstLineForTitle ?
                        `${docNameWithoutExt} | ${foundDoc.firstLineForTitle.substring(0, 50)}${foundDoc.firstLineForTitle.length > 50 ? '...' : ''}` :
                        docNameWithoutExt;
                    openDocument(initialDoc, title);
                } else {
                    console.warn(`Document ${initialDoc} not found.`);
                    performSearch('');
                }
            })
            .catch(error => {
                console.error("Error fetching initial document metadata:", error);
                performSearch('');
            });
    } else {
        // Otherwise, perform an initial search (e.g., show all documents)
        performSearch('');
    }

    // Initialize the history state for the search view, so the first "back" works correctly
    history.replaceState({ view: 'search', query: '' }, '', '/');
});
