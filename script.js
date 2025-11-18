// =============================================
// CONFIGURATION - EDIT THIS SECTION
// =============================================

// Replace this with your deployed Google Apps Script URL
const GOOGLE_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbzOnSnylq6OWaiSMDyShbKahu0JrVgXPhoQkUMtl_Ikjmu9GPws4dIuLM5Eb6fKP6re/exec';

// Admin username (has special privileges)
const ADMIN_USERNAME = 'khush';

// =============================================
// APPLICATION STATE
// =============================================
let USER_NAME = localStorage.getItem('userName') || '';
let CURRENT_FOLDER = localStorage.getItem('currentFolder') || 'general';
let DARK_MODE = localStorage.getItem('darkMode') === 'true';
let IS_ADMIN = false;
let codeEditor = null;
let editingFileId = null;
let bulkSelectMode = false;
let selectedFiles = new Set();
let selectedUploadFiles = [];
let allSubmissions = [];
let currentPreviewFile = null;
let folders = [];
let projects = JSON.parse(localStorage.getItem('projects')) || [];
let starredFiles = JSON.parse(localStorage.getItem('starredFiles')) || [];
let activityLog = JSON.parse(localStorage.getItem('activityLog')) || [];

// =============================================
// INITIALIZATION
// =============================================
document.addEventListener('DOMContentLoaded', function () {
    initializeApp();
});

async function initializeApp() {
    initializeDragAndDrop();
    setupFileInput();
    initializeCodeEditor();
    initializeDarkMode();
    checkUserSetup();
    await loadFolders();
    updateFolderSelects();
    loadProjects();
    loadActivityLog();
    updateAnalytics();

    IS_ADMIN = USER_NAME.toLowerCase() === ADMIN_USERNAME.toLowerCase();
    if (IS_ADMIN) {
        document.getElementById('adminFolderOptions').style.display = 'block';
        showSuccess('Admin privileges activated! 👑');
    }

    if (GOOGLE_SCRIPT_URL && !GOOGLE_SCRIPT_URL.includes('YOUR_SCRIPT_ID')) {
        loadSubmissions();
        registerUser();
    } else {
        showError('Please configure the Google Apps Script URL');
    }

    document.getElementById('searchInput').addEventListener('input', filterFiles);
    document.getElementById('fileTypeFilter')?.addEventListener('change', filterFiles);
    document.getElementById('editorFileName').addEventListener('input', updateEditorTitle);
}

// =============================================
// THEME & USER MANAGEMENT
// =============================================
function initializeDarkMode() {
    const themeToggle = document.getElementById('themeToggle');
    if (DARK_MODE) {
        document.body.classList.add('dark-mode');
        themeToggle.innerHTML = '<i class="fas fa-sun"></i>';
        if (codeEditor) codeEditor.setOption('theme', 'material-darker');
    } else {
        document.body.classList.remove('dark-mode');
        themeToggle.innerHTML = '<i class="fas fa-moon"></i>';
        if (codeEditor) codeEditor.setOption('theme', 'default');
    }
}

function toggleDarkMode() {
    DARK_MODE = !DARK_MODE;
    localStorage.setItem('darkMode', DARK_MODE);
    initializeDarkMode();
    showSuccess(DARK_MODE ? 'Dark mode activated 🌙' : 'Light mode activated ☀️');
}

function checkUserSetup() {
    if (!USER_NAME) {
        showModal('welcomeModal');
    } else {
        document.getElementById('userName').textContent = USER_NAME;
    }
}

function saveUserName() {
    const userName = document.getElementById('userNameInput').value.trim();
    if (userName) {
        USER_NAME = userName;
        localStorage.setItem('userName', userName);
        document.getElementById('userName').textContent = userName;
        hideModal('welcomeModal');

        IS_ADMIN = USER_NAME.toLowerCase() === ADMIN_USERNAME.toLowerCase();
        if (IS_ADMIN) {
            document.getElementById('adminFolderOptions').style.display = 'block';
            showSuccess(`Welcome Admin ${userName}! 👑`);
        } else {
            showSuccess(`Welcome to CodeHub, ${userName}! 🎉`);
        }

        registerUser();
    } else {
        showError('Please enter your name to continue');
    }
}

function registerUser() {
    if (USER_NAME && GOOGLE_SCRIPT_URL && !GOOGLE_SCRIPT_URL.includes('YOUR_SCRIPT_ID')) {
        const params = new URLSearchParams();
        params.append('action', 'REGISTER_USER');
        params.append('userName', USER_NAME);
        params.append('timestamp', new Date().toISOString());

        fetch(GOOGLE_SCRIPT_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: params
        }).catch(error => console.log('User registration:', error));
    }
}

// =============================================
// PAGE NAVIGATION
// =============================================
function switchPage(pageName) {
    // Hide all pages
    document.querySelectorAll('.page').forEach(page => {
        page.classList.remove('active');
    });

    // Update nav items
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
    });

    // Show selected page
    document.getElementById(`${pageName}-page`).classList.add('active');

    // Activate nav item
    event.currentTarget.classList.add('active');

    // Refresh editor if needed
    if (pageName === 'editor') {
        setTimeout(() => codeEditor?.refresh(), 100);
    }

    // Load data for specific pages
    if (pageName === 'files') {
        loadSubmissions();
    } else if (pageName === 'analytics') {
        updateAnalytics();
    }
}

// =============================================
// CODE EDITOR
// =============================================
function initializeCodeEditor() {
    codeEditor = CodeMirror.fromTextArea(document.getElementById('codeEditor'), {
        mode: 'javascript',
        theme: DARK_MODE ? 'material-darker' : 'default',
        lineNumbers: true,
        matchBrackets: true,
        indentUnit: 4,
        indentWithTabs: false,
        extraKeys: {
            "Ctrl-S": function (instance) {
                if (editingFileId) saveFileEdit();
                else createFileFromEditor();
            },
            "Cmd-S": function (instance) {
                if (editingFileId) saveFileEdit();
                else createFileFromEditor();
            },
            "Ctrl-F": function (instance) { formatCode(); },
            "Cmd-F": function (instance) { formatCode(); }
        }
    });

    codeEditor.setValue(`// Welcome to CodeHub Editor!\n// Start writing your code here...\n\nfunction helloWorld() {\n    console.log("Hello, CodeHub!");\n    return "Welcome to your code editor";\n}\n\n// Try creating a file using the button below!`);
}

function updateEditorTitle() {
    const fileName = document.getElementById('editorFileName').value;
    const titleElement = document.getElementById('editorTitle');
    if (fileName) {
        titleElement.textContent = `Editing: ${fileName}`;
        setEditorMode(fileName);
    } else {
        titleElement.textContent = 'Code Editor';
    }
}

function setEditorMode(fileName) {
    const extension = fileName.split('.').pop().toLowerCase();
    const modeMap = {
        'js': 'javascript', 'py': 'python', 'html': 'htmlmixed', 'css': 'css',
        'java': 'text/x-java', 'cpp': 'text/x-c++src', 'c': 'text/x-csrc',
        'php': 'php', 'xml': 'xml', 'sql': 'sql', 'json': 'application/json'
    };
    codeEditor.setOption('mode', modeMap[extension] || 'javascript');
}

function clearEditor() {
    codeEditor.setValue('');
    document.getElementById('editorFileName').value = '';
    document.getElementById('editorDescription').value = '';
    document.getElementById('editorTags').value = '';
    updateEditorTitle();
    editingFileId = null;
    document.getElementById('saveEditBtn').style.display = 'none';
}

function formatCode() {
    const content = codeEditor.getValue();
    try {
        if (codeEditor.getOption('mode') === 'javascript') {
            const formatted = content
                .replace(/\s*{\s*/g, ' { ')
                .replace(/\s*}\s*/g, ' } ')
                .replace(/\s*\(\s*/g, ' (')
                .replace(/\s*\)\s*/g, ') ')
                .replace(/;\s*/g, ';\n')
                .replace(/\n\s*\n/g, '\n');
            codeEditor.setValue(formatted);
        }
        showSuccess('Code formatted! 🎨');
    } catch (error) {
        showError('Formatting failed. Check syntax errors.');
    }
}

function checkSyntax() {
    const content = codeEditor.getValue();
    const mode = codeEditor.getOption('mode');
    try {
        if (mode === 'javascript') new Function(content);
        showSuccess('Syntax check passed! ✅');
    } catch (error) {
        showError('Syntax error: ' + error.message);
    }
}

function loadTemplate() {
    const templates = {
        'JavaScript': `function main() {\n    // Your code here\n    console.log("Hello World!");\n    \n    return {\n        success: true,\n        message: "Function executed successfully"\n    };\n}\n\n// Call the main function\nmain();`,
        'Python': `def main():\n    # Your code here\n    print("Hello World!")\n    \n    return {\n        "success": True,\n        "message": "Function executed successfully"\n    }\n\nif __name__ == "__main__":\n    main()`,
        'HTML': `<!DOCTYPE html>\n<html lang="en">\n<head>\n    <meta charset="UTF-8">\n    <meta name="viewport" content="width=device-width, initial-scale=1.0">\n    <title>Document</title>\n</head>\n<body>\n    <h1>Hello World!</h1>\n</body>\n</html>`,
        'CSS': `/* Main Styles */\n.container {\n    max-width: 1200px;\n    margin: 0 auto;\n    padding: 20px;\n}`
    };

    const templateType = prompt('Choose template:\n1. JavaScript\n2. Python\n3. HTML\n4. CSS', '1');
    const templateMap = { '1': 'JavaScript', '2': 'Python', '3': 'HTML', '4': 'CSS' };
    const selected = templateMap[templateType];

    if (selected && templates[selected]) {
        codeEditor.setValue(templates[selected]);
        if (selected === 'JavaScript') document.getElementById('editorFileName').value = 'script.js';
        if (selected === 'Python') document.getElementById('editorFileName').value = 'script.py';
        if (selected === 'HTML') document.getElementById('editorFileName').value = 'index.html';
        if (selected === 'CSS') document.getElementById('editorFileName').value = 'styles.css';
        updateEditorTitle();
        showSuccess(`${selected} template loaded! 🚀`);
    }
}

// =============================================
// FOLDER MANAGEMENT
// =============================================
async function loadFolders() {
    const folderList = document.getElementById('folderList');
    if (!folderList) return;
    folderList.innerHTML = '<div class="loader"></div>';

    try {
        const response = await fetch(`${GOOGLE_SCRIPT_URL}?action=GET_FOLDERS`);
        const data = await response.json();
        if (data.success) {
            folders = data.folders;
            if (!folders.find(f => f.id === 'general')) {
                folders.unshift({ id: 'general', name: 'General', fileCount: 0, totalSize: 0, privacy: 'public' });
            }

            folderList.innerHTML = '';

            const availableFolders = folders.filter(folder =>
                folder.privacy === 'public' ||
                folder.owner === USER_NAME ||
                IS_ADMIN
            );

            availableFolders.forEach(folder => {
                const folderElement = document.createElement('div');
                folderElement.className = `folder-item ${folder.id === CURRENT_FOLDER ? 'active' : ''}`;
                const folderSize = folder.totalSize > 0 ? `${(folder.totalSize / 1024).toFixed(1)} KB` : '0 KB';
                folderElement.innerHTML = `
                    <div class="folder-info">
                        <i class="fas fa-folder"></i>
                        ${folder.name}
                        <span class="folder-stats">(${folder.fileCount || 0})</span>
                    </div>
                    <div class="folder-details">
                        <span class="folder-size">${folderSize}</span>
                        ${(IS_ADMIN || folder.owner === USER_NAME) && folder.id !== 'general' ? `<i class="fas fa-ellipsis-v" onclick="showFolderOptions(event, '${folder.id}')"></i>` : ''}
                    </div>
                `;
                folderElement.onclick = () => switchFolder(folder.id);
                folderList.appendChild(folderElement);
            });
            updateFolderSelects();
        } else {
            throw new Error(data.error || 'Failed to load folders');
        }
    } catch (error) {
        showError('Could not load folders: ' + error.message);
        folderList.innerHTML = '<div class="empty-state"><p>Could not load folders.</p></div>';
    }
}

function updateFolderSelects() {
    const uploadFolder = document.getElementById('uploadFolder');
    const editorFolder = document.getElementById('editorFolder');
    if (!uploadFolder || !editorFolder) return;

    // Load available folders for current user
    const availableFolders = folders.filter(folder =>
        folder.privacy === 'public' ||
        folder.owner === USER_NAME ||
        IS_ADMIN ||
        folder.id === 'general'
    );

    uploadFolder.innerHTML = availableFolders.map(folder =>
        `<option value="${folder.id}">${folder.name} ${folder.privacy === 'public' ? '(Public)' : ''}</option>`
    ).join('');

    editorFolder.innerHTML = availableFolders.map(folder =>
        `<option value="${folder.id}">${folder.name} ${folder.privacy === 'public' ? '(Public)' : ''}</option>`
    ).join('');

    uploadFolder.value = CURRENT_FOLDER;
    editorFolder.value = CURRENT_FOLDER;
}

function switchFolder(folderId) {
    const folder = folders.find(f => f.id === folderId);
    if (!folder) return;

    // Check if user has access to this folder
    if (folder.privacy !== 'public' && folder.owner !== USER_NAME && !IS_ADMIN && folder.id !== 'general') {
        showError('You do not have access to this folder');
        return;
    }

    CURRENT_FOLDER = folderId;
    localStorage.setItem('currentFolder', folderId);
    loadFolders();
    loadSubmissions();
    logActivity(`Switched to folder: ${folder.name}`);
    showSuccess(`Switched to folder: ${folder.name}`);
}

function showCreateFolderModal() {
    showModal('createFolderModal');
}

function closeCreateFolderModal() {
    hideModal('createFolderModal');
    document.getElementById('newFolderName').value = '';
}

async function createFolder() {
    const folderName = document.getElementById('newFolderName').value.trim();
    const privacy = document.getElementById('folderPrivacy').value;

    if (!folderName) {
        showError('Please enter a folder name');
        return;
    }

    try {
        const params = new URLSearchParams();
        params.append('action', 'CREATE_FOLDER');
        params.append('folderName', folderName);
        params.append('privacy', privacy);
        params.append('owner', USER_NAME);

        const response = await fetch(GOOGLE_SCRIPT_URL, {
            method: 'POST',
            body: params
        });
        const data = await response.json();

        if (data.success) {
            showSuccess(`Folder "${folderName}" created successfully!`);
            closeCreateFolderModal();
            await loadFolders();
            logActivity(`Created ${privacy} folder: ${folderName}`);
        } else {
            throw new Error(data.error || 'Failed to create folder');
        }
    } catch (error) {
        showError('Failed to create folder: ' + error.message);
    }
}

function showFolderOptions(event, folderId) {
    event.stopPropagation();
    const folder = folders.find(f => f.id === folderId);
    if (folder) {
        const action = confirm(`Folder: ${folder.name}\n\nPress OK to delete this folder.`);
        if (action) {
            deleteFolder(folderId);
        }
    }
}

async function deleteFolder(folderId) {
    if (folderId === 'general') {
        showError('Cannot delete the General folder.');
        return;
    }

    const folder = folders.find(f => f.id === folderId);
    if (!folder) return;

    if (!IS_ADMIN && folder.owner !== USER_NAME) {
        showError('You can only delete folders you created.');
        return;
    }

    if (!confirm(`Are you sure you want to delete "${folder.name}"? All files inside will be moved to General.`)) {
        return;
    }

    try {
        const params = new URLSearchParams();
        params.append('action', 'DELETE_FOLDER');
        params.append('folderId', folderId);

        const response = await fetch(GOOGLE_SCRIPT_URL, {
            method: 'POST',
            body: params
        });
        const data = await response.json();

        if (data.success) {
            showSuccess(`Folder "${folder.name}" deleted.`);
            if (CURRENT_FOLDER === folderId) {
                switchFolder('general');
            }
            await loadFolders();
            await loadSubmissions();
            logActivity(`Deleted folder: ${folder.name}`);
        } else {
            throw new Error(data.error || 'Failed to delete folder');
        }
    } catch (error) {
        showError('Failed to delete folder: ' + error.message);
    }
}

// =============================================
// FILE UPLOAD WITH PREVIEW
// =============================================
function initializeDragAndDrop() {
    const uploadArea = document.getElementById('uploadArea');
    if (!uploadArea) return;

    uploadArea.addEventListener('dragover', function (e) {
        e.preventDefault();
        uploadArea.classList.add('dragover');
    });

    uploadArea.addEventListener('dragleave', function () {
        uploadArea.classList.remove('dragover');
    });

    uploadArea.addEventListener('drop', function (e) {
        e.preventDefault();
        uploadArea.classList.remove('dragover');
        handleFiles(e.dataTransfer.files);
    });
}

function setupFileInput() {
    const fileInput = document.getElementById('fileInput');
    if (!fileInput) return;

    fileInput.addEventListener('change', function (e) {
        handleFiles(e.target.files);
    });
}

function handleFiles(files) {
    if (!GOOGLE_SCRIPT_URL || GOOGLE_SCRIPT_URL.includes('YOUR_SCRIPT_ID')) {
        showError('Please configure the Google Apps Script URL');
        return;
    }

    selectedUploadFiles = Array.from(files);
    updateSelectedFilesPreview();
    updateUploadUI();
}

function updateSelectedFilesPreview() {
    const previewContainer = document.getElementById('selectedFilesPreview');
    const filesList = document.getElementById('selectedFilesList');

    if (selectedUploadFiles.length === 0) {
        previewContainer.style.display = 'none';
        return;
    }

    previewContainer.style.display = 'block';
    filesList.innerHTML = selectedUploadFiles.map((file, index) => `
        <div class="selected-file-item">
            <div class="file-info">
                <i class="fas fa-file-code"></i>
                <span>${file.name}</span>
                <span class="file-size">(${(file.size / 1024).toFixed(1)} KB)</span>
            </div>
            <button class="file-remove" onclick="removeSelectedFile(${index})">
                <i class="fas fa-times"></i>
            </button>
        </div>
    `).join('');
}

function removeSelectedFile(index) {
    selectedUploadFiles.splice(index, 1);
    updateSelectedFilesPreview();
    updateUploadUI();
}

function clearSelectedFiles() {
    selectedUploadFiles = [];
    document.getElementById('fileInput').value = '';
    updateSelectedFilesPreview();
    updateUploadUI();
}

function updateUploadUI() {
    const uploadContent = document.getElementById('uploadContent');
    const submitBtn = document.getElementById('submitBtn');

    if (!uploadContent || !submitBtn) return;

    if (selectedUploadFiles.length > 0) {
        uploadContent.innerHTML = `
            <div class="upload-icon">
                <i class="fas fa-check-circle" style="color: var(--success);"></i>
            </div>
            <h3>${selectedUploadFiles.length} File(s) Selected</h3>
            <p>Ready to upload</p>
        `;
        submitBtn.disabled = false;
    } else {
        uploadContent.innerHTML = `
            <div class="upload-icon">
                <i class="fas fa-cloud-upload-alt"></i>
            </div>
            <h3>Drag & Drop Your Files Here</h3>
            <p>or click to browse your computer</p>
            <p class="upload-hint">Supports all code files: .js, .py, .java, .cpp, .html, .css, etc.</p>
        `;
        submitBtn.disabled = true;
    }
}

async function submitFiles() {
    if (!GOOGLE_SCRIPT_URL || GOOGLE_SCRIPT_URL.includes('YOUR_SCRIPT_ID')) {
        showError('Please configure the Google Apps Script URL');
        return;
    }

    const submitBtn = document.getElementById('submitBtn');
    const description = document.getElementById('fileDescription').value.trim();
    const folder = document.getElementById('uploadFolder').value;
    const tags = document.getElementById('fileTags').value;
    const expiration = document.getElementById('fileExpiration').value;

    if (selectedUploadFiles.length === 0) {
        showError('Please select at least one file to upload.');
        return;
    }

    submitBtn.innerHTML = '<div class="loading"></div> Uploading...';
    submitBtn.disabled = true;

    try {
        for (const file of selectedUploadFiles) {
            await uploadFileToSheets(file, description, folder, tags, expiration);
        }

        showSuccess(`🎉 Successfully uploaded ${selectedUploadFiles.length} file(s)!`);

        // Reset form
        selectedUploadFiles = [];
        document.getElementById('fileDescription').value = '';
        document.getElementById('fileTags').value = '';
        document.getElementById('fileInput').value = '';
        updateSelectedFilesPreview();
        updateUploadUI();

        await loadSubmissions();
        logActivity(`Uploaded ${selectedUploadFiles.length} file(s)`);

    } catch (error) {
        showError('Upload failed: ' + error.message);
    } finally {
        submitBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Upload Files';
        submitBtn.disabled = false;
    }
}

async function uploadFileToSheets(file, description, folder, tags, expiration) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = async function (e) {
            try {
                const fileContent = e.target.result;
                const expirationDate = calculateExpirationDate(expiration);

                const params = new URLSearchParams();
                params.append('action', 'SUBMIT_CODE');
                params.append('fileName', file.name);
                params.append('fileType', file.name.split('.').pop());
                params.append('codeContent', fileContent);
                params.append('timestamp', new Date().toISOString());
                params.append('fileSize', file.size);
                params.append('description', description || 'No description provided');
                params.append('folder', folder || CURRENT_FOLDER);
                params.append('uploadedBy', USER_NAME || 'Anonymous');
                params.append('tags', tags || '');
                params.append('expiration', expirationDate);

                const response = await fetch(GOOGLE_SCRIPT_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: params
                });

                if (!response.ok) throw new Error(`HTTP ${response.status}`);

                const data = await response.json();
                if (data.success) resolve(data);
                else reject(new Error(data.error || 'Upload failed'));
            } catch (error) {
                reject(error);
            }
        };

        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsText(file);
    });
}

function calculateExpirationDate(expiration) {
    const now = new Date();
    switch (expiration) {
        case '1day': return new Date(now.setDate(now.getDate() + 1)).toISOString();
        case '1week': return new Date(now.setDate(now.getDate() + 7)).toISOString();
        case '1month': return new Date(now.setMonth(now.getMonth() + 1)).toISOString();
        case '3months': return new Date(now.setMonth(now.getMonth() + 3)).toISOString();
        default: return 'never';
    }
}

// =============================================
// FILE MANAGEMENT & DISPLAY
// =============================================
async function loadSubmissions() {
    const container = document.getElementById('submissionsContainer');
    if (!container) return;
    container.innerHTML = '<div class="loader"></div>';

    if (!GOOGLE_SCRIPT_URL || GOOGLE_SCRIPT_URL.includes('YOUR_SCRIPT_ID')) return;

    try {
        const response = await fetch(`${GOOGLE_SCRIPT_URL}?action=GET_SUBMISSIONS&timestamp=${new Date().getTime()}`);

        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const data = await response.json();

        if (data.success) {
            allSubmissions = data.submissions || [];

            // Filter by current folder
            const folderSubmissions = allSubmissions.filter(submission => submission.folder === CURRENT_FOLDER);

            displaySubmissions(folderSubmissions);
            updateStatistics(folderSubmissions);
            updateFolderStats();
            updateAnalytics();
        } else {
            throw new Error(data.error || 'Failed to load files');
        }
    } catch (error) {
        console.error('Load error:', error);
        showError('Failed to load files: ' + error.message);
        container.innerHTML = '<div class="empty-state"><p>Could not load files.</p></div>';
    }
}

function displaySubmissions(submissions) {
    const container = document.getElementById('submissionsContainer');
    if (!container) return;

    if (!submissions || submissions.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-folder-open"></i>
                <h3>No Files in ${getFolderName(CURRENT_FOLDER)}</h3>
                <p>Upload your first code file or create one using the editor!</p>
            </div>
        `;
        return;
    }

    container.innerHTML = submissions.map(submission => {
        const isStarred = starredFiles.includes(submission.submissionId);
        const canEdit = IS_ADMIN || submission.uploadedBy === USER_NAME;
        const folder = folders.find(f => f.id === submission.folder);
        const isPublicFolder = folder && folder.privacy === 'public';

        return `
        <div class="file-item ${isStarred ? 'starred' : ''}">
            <input type="checkbox" class="file-checkbox" style="display: ${bulkSelectMode ? 'block' : 'none'}" 
                   onchange="toggleFileSelection('${submission.submissionId}')">
            
            <div class="file-header">
                <div class="file-name">
                    <i class="fas fa-file-code"></i>
                    ${submission.fileName}
                    ${isPublicFolder ? '<span style="color: var(--success); font-size: 0.8rem; margin-left: 8px;">(Public)</span>' : ''}
                </div>
                <div class="file-actions-top">
                    <button class="star-btn" onclick="toggleStar('${submission.submissionId}')">
                        <i class="${isStarred ? 'fas' : 'far'} fa-star"></i>
                    </button>
                    <span class="file-type">${submission.fileType}</span>
                </div>
            </div>
            
            <div class="file-meta">
                <div class="file-meta-item">
                    <i class="fas fa-weight-hanging"></i> ${(submission.fileSize / 1024).toFixed(1)} KB
                </div>
                <div class="file-meta-item">
                    <i class="fas fa-calendar"></i> ${new Date(submission.timestamp).toLocaleDateString()}
                </div>
                <div class="file-meta-item">
                    <i class="fas fa-user"></i> ${submission.uploadedBy || 'Anonymous'}
                </div>
                ${submission.lastModified ? `
                    <div class="file-meta-item">
                        <i class="fas fa-edit"></i> Modified ${new Date(submission.lastModified).toLocaleDateString()}
                    </div>
                ` : ''}
                ${submission.folder && submission.folder !== 'general' ? `
                    <div class="file-meta-item">
                        <i class="fas fa-folder"></i> ${getFolderName(submission.folder)}
                    </div>
                ` : ''}
            </div>
            
            ${submission.tags && submission.tags.length > 0 ? `
                <div class="tag-system">
                    ${submission.tags.map(tag => `
                        <span class="tag">${tag}</span>
                    `).join('')}
                </div>
            ` : ''}
            
            ${submission.description && submission.description !== 'No description provided' ? `
                <div class="file-description">
                    <strong><i class="fas fa-comment"></i> Description:</strong> ${submission.description}
                </div>
            ` : ''}
            
            <div class="file-actions">
                <button class="action-btn" style="background: var(--info); color: white;" onclick="viewFile('${submission.submissionId}')">
                    <i class="fas fa-eye"></i> View
                </button>
                <button class="action-btn" style="background: var(--success); color: white;" onclick="downloadFile('${submission.submissionId}', '${submission.fileName}')">
                    <i class="fas fa-download"></i> Download
                </button>
                ${canEdit ? `
                    <button class="action-btn" style="background: var(--warning); color: white;" onclick="editFile('${submission.submissionId}')">
                        <i class="fas fa-edit"></i> Edit
                    </button>
                ` : ''}
                ${canEdit ? `
                    <button class="action-btn" style="background: var(--danger); color: white;" onclick="deleteFile('${submission.submissionId}')">
                        <i class="fas fa-trash"></i> Delete
                    </button>
                ` : ''}
            </div>
        </div>
        `;
    }).join('');
}

function getFolderName(folderId) {
    const folder = folders.find(f => f.id === folderId);
    return folder ? folder.name : 'Unknown';
}

function updateFolderStats() {
    folders.forEach(folder => {
        folder.files = allSubmissions.filter(sub => sub.folder === folder.id).length;
    });
    localStorage.setItem('folders', JSON.stringify(folders));
    loadFolders();
}

function updateStatistics(submissions) {
    document.getElementById('totalFiles').textContent = submissions.length;
    document.getElementById('fileTypes').textContent = [...new Set(submissions.map(s => s.fileType))].length;
}

// =============================================
// FILE OPERATIONS
// =============================================
async function viewFile(submissionId) {
    try {
        const submission = allSubmissions.find(s => s.submissionId === submissionId);
        if (!submission) throw new Error('File not found');

        currentPreviewFile = submission;

        document.getElementById('modalTitle').textContent = submission.fileName;
        document.getElementById('modalMeta').innerHTML = `
            <div class="file-meta-item">
                <i class="fas fa-weight-hanging"></i> ${(submission.fileSize / 1024).toFixed(1)} KB
            </div>
            <div class="file-meta-item">
                <i class="fas fa-calendar"></i> ${new Date(submission.timestamp).toLocaleDateString()}
            </div>
            <div class="file-meta-item">
                <i class="fas fa-tag"></i> ${submission.fileType}
            </div>
            <div class="file-meta-item">
                <i class="fas fa-user"></i> ${submission.uploadedBy || 'Anonymous'}
            </div>
            ${submission.folder && submission.folder !== 'general' ? `
                <div class="file-meta-item">
                    <i class="fas fa-folder"></i> ${getFolderName(submission.folder)}
                </div>
            ` : ''}
        `;

        document.getElementById('modalDescription').innerHTML = submission.description && submission.description !== 'No description provided'
            ? `<strong><i class="fas fa-comment"></i> Description:</strong> ${submission.description}`
            : '<em>No description provided</em>';

        document.getElementById('modalContent').textContent = submission.codeContent;
        showModal('previewModal');

    } catch (error) {
        showError('Failed to open file: ' + error.message);
    }
}

function closeModal() {
    hideModal('previewModal');
    currentPreviewFile = null;
}

function downloadFile(submissionId, fileName) {
    const submission = allSubmissions.find(s => s.submissionId === submissionId);
    if (submission) {
        const blob = new Blob([submission.codeContent], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showSuccess(`Downloaded "${fileName}" successfully!`);
        logActivity(`Downloaded file: ${fileName}`);
    } else {
        showError('File not found for download');
    }
}

function downloadCurrentFile() {
    if (currentPreviewFile) {
        downloadFile(currentPreviewFile.submissionId, currentPreviewFile.fileName);
    }
}

async function copyToClipboard() {
    if (currentPreviewFile) {
        await copyFileCode(currentPreviewFile.submissionId);
    }
}

async function copyFileCode(submissionId) {
    const submission = allSubmissions.find(s => s.submissionId === submissionId);
    if (submission) {
        try {
            await navigator.clipboard.writeText(submission.codeContent);
            showSuccess('Code copied to clipboard! 📋');
            logActivity(`Copied code from: ${submission.fileName}`);
        } catch (err) {
            const textArea = document.createElement('textarea');
            textArea.value = submission.codeContent;
            document.body.appendChild(textArea);
            textArea.select();
            document.execCommand('copy');
            document.body.removeChild(textArea);
            showSuccess('Code copied to clipboard! 📋');
        }
    }
}

async function deleteFile(submissionId, silent = false) {
    const submission = allSubmissions.find(s => s.submissionId === submissionId);
    if (!submission) return;

    if (!IS_ADMIN && submission.uploadedBy !== USER_NAME) {
        showError('You can only delete your own files');
        return;
    }

    if (!silent && !confirm(`Are you sure you want to delete "${submission.fileName}"? This action cannot be undone.`)) {
        return;
    }

    try {
        const response = await fetch(`${GOOGLE_SCRIPT_URL}?action=DELETE_FILE&submissionId=${submissionId}`);
        const data = await response.json();

        if (data.success) {
            if (!silent) showSuccess(`"${submission.fileName}" has been deleted successfully!`);
            await loadSubmissions();
            logActivity(`Deleted file: ${submission.fileName}`);
        } else {
            throw new Error(data.error || 'Delete failed');
        }
    } catch (error) {
        if (!silent) showError('Delete failed: ' + error.message);
    }
}

function editFile(submissionId) {
    const submission = allSubmissions.find(s => s.submissionId === submissionId);
    if (submission) {
        currentPreviewFile = submission;
        editCurrentFile();
    }
}

function editCurrentFile() {
    if (!currentPreviewFile) return;

    editingFileId = currentPreviewFile.submissionId;
    document.getElementById('editorFileName').value = currentPreviewFile.fileName;
    document.getElementById('editorDescription').value = currentPreviewFile.description || '';
    document.getElementById('editorTags').value = currentPreviewFile.tags ? currentPreviewFile.tags.join(', ') : '';
    document.getElementById('editorFolder').value = currentPreviewFile.folder || 'general';

    codeEditor.setValue(currentPreviewFile.codeContent);
    document.getElementById('saveEditBtn').style.display = 'inline-block';

    switchPage('editor');
    closeModal();
    showSuccess('File loaded into editor. Make your changes and click "Save Changes"');
}

async function saveFileEdit() {
    if (!editingFileId) return;

    const fileName = document.getElementById('editorFileName').value.trim();
    const description = document.getElementById('editorDescription').value.trim();
    const tags = document.getElementById('editorTags').value.split(',').map(tag => tag.trim()).filter(tag => tag);
    const folder = document.getElementById('editorFolder').value;
    const codeContent = codeEditor.getValue();

    if (!fileName) {
        showError('Please enter a file name');
        return;
    }

    if (!codeContent.trim()) {
        showError('Please write some code before saving');
        return;
    }

    const file = allSubmissions.find(f => f.submissionId === editingFileId);
    if (!file) {
        showError('File not found');
        return;
    }

    if (!IS_ADMIN && file.uploadedBy !== USER_NAME) {
        showError('You can only edit your own files');
        return;
    }

    file.fileName = fileName;
    file.description = description;
    file.tags = tags;
    file.folder = folder;
    file.codeContent = codeContent;
    file.lastModified = new Date().toISOString();
    file.modifiedBy = USER_NAME;

    await updateFileInSheets(file);
}

async function updateFileInSheets(file) {
    try {
        const params = new URLSearchParams();
        params.append('action', 'UPDATE_FILE');
        params.append('submissionId', file.submissionId);
        params.append('fileName', file.fileName);
        params.append('fileType', file.fileType);
        params.append('codeContent', file.codeContent);
        params.append('description', file.description || '');
        params.append('tags', file.tags ? file.tags.join(',') : '');
        params.append('folder', file.folder || 'general');
        params.append('lastModified', file.lastModified);
        params.append('modifiedBy', file.modifiedBy);

        const response = await fetch(GOOGLE_SCRIPT_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: params
        });

        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const data = await response.json();

        if (data.success) {
            showSuccess(`File "${file.fileName}" updated successfully! ✨`);
            editingFileId = null;
            document.getElementById('saveEditBtn').style.display = 'none';
            clearEditor();
            await loadSubmissions();
            logActivity(`Edited file: ${file.fileName}`);
        } else {
            throw new Error(data.error || 'File update failed');
        }
    } catch (error) {
        showError('Failed to update file: ' + error.message);
    }
}

// 3-4

// =============================================
// BULK OPERATIONS
// =============================================
function toggleBulkSelect() {
    bulkSelectMode = !bulkSelectMode;
    selectedFiles.clear();

    const bulkActions = document.getElementById('bulkActions');
    const checkboxes = document.querySelectorAll('.file-checkbox');

    if (bulkActions) bulkActions.style.display = bulkSelectMode ? 'block' : 'none';
    checkboxes.forEach(cb => {
        cb.style.display = bulkSelectMode ? 'block' : 'none';
    });

    updateSelectedCount();
}

function toggleFileSelection(fileId) {
    if (selectedFiles.has(fileId)) {
        selectedFiles.delete(fileId);
    } else {
        selectedFiles.add(fileId);
    }
    updateSelectedCount();
}

function updateSelectedCount() {
    const selectedCount = document.getElementById('selectedCount');
    if (selectedCount) selectedCount.textContent = `${selectedFiles.size} files selected`;
}

function clearSelection() {
    selectedFiles.clear();
    document.querySelectorAll('.file-checkbox').forEach(cb => {
        cb.checked = false;
    });
    updateSelectedCount();
}

function deleteSelectedFiles() {
    if (selectedFiles.size === 0) {
        showError('No files selected');
        return;
    }

    if (!confirm(`Are you sure you want to delete ${selectedFiles.size} files?`)) {
        return;
    }

    selectedFiles.forEach(fileId => {
        deleteFile(fileId, true);
    });

    selectedFiles.clear();
    toggleBulkSelect();
    loadSubmissions();
}

// =============================================
// FILE CREATION FROM EDITOR
// =============================================
function createFileFromEditor() {
    const fileName = document.getElementById('editorFileName').value.trim();
    const description = document.getElementById('editorDescription').value.trim();
    const folder = document.getElementById('editorFolder').value;
    const tags = document.getElementById('editorTags').value.split(',').map(tag => tag.trim()).filter(tag => tag);
    const codeContent = codeEditor.getValue();

    if (!fileName) {
        showError('Please enter a file name');
        return;
    }

    if (!codeContent.trim()) {
        showError('Please write some code before creating a file');
        return;
    }

    const virtualFile = {
        name: fileName,
        size: new Blob([codeContent]).size,
        type: 'text/plain'
    };

    uploadVirtualFile(virtualFile, codeContent, description, folder, tags.join(','));
}

async function uploadVirtualFile(file, content, description, folder, tags) {
    if (!GOOGLE_SCRIPT_URL || GOOGLE_SCRIPT_URL.includes('YOUR_SCRIPT_ID')) {
        showError('Please configure the Google Apps Script URL');
        return;
    }

    try {
        const params = new URLSearchParams();
        params.append('action', 'SUBMIT_CODE');
        params.append('fileName', file.name);
        params.append('fileType', file.name.split('.').pop());
        params.append('codeContent', content);
        params.append('timestamp', new Date().toISOString());
        params.append('fileSize', file.size);
        params.append('description', description || 'Created with Code Editor');
        params.append('folder', folder || CURRENT_FOLDER);
        params.append('uploadedBy', USER_NAME || 'Anonymous');
        params.append('tags', tags || '');
        params.append('expiration', 'never');

        const response = await fetch(GOOGLE_SCRIPT_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: params
        });

        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const data = await response.json();

        if (data.success) {
            showSuccess(`File "${file.name}" created successfully! ✨`);
            clearEditor();
            await loadSubmissions();
            logActivity(`Created file: ${file.name}`);
        } else {
            throw new Error(data.error || 'File creation failed');
        }
    } catch (error) {
        showError('Failed to create file: ' + error.message);
    }
}

// =============================================
// PROJECT MANAGEMENT
// =============================================
function loadProjects() {
    const projectList = document.getElementById('project-list');
    if (!projectList) return;

    projectList.innerHTML = '';

    if (projects.length === 0) {
        projectList.innerHTML = '<p class="p-3 text-sm text-text-faded">No projects yet.</p>';
        return;
    }

    projects.forEach(project => {
        const projectElement = document.createElement('div');
        projectElement.className = 'project-item';
        projectElement.dataset.id = project.id;
        projectElement.onclick = () => showCollaborationContent('project', project.id);
        projectElement.innerHTML = `
            <p class="font-medium">${project.name}</p>
            <p class="text-xs text-text-faded">${project.description || 'No description'}</p>
        `;
        projectList.appendChild(projectElement);
    });
}

function loadChats() {
    const chatList = document.getElementById('chat-list');
    if (!chatList) return;

    chatList.innerHTML = '';

    if (chats.length === 0) {
        chats.push({ id: 'chat-1', name: 'General', type: 'group', participants: [] });
    }

    chats.forEach(chat => {
        const chatElement = document.createElement('div');
        chatElement.className = 'chat-item';
        chatElement.dataset.id = chat.id;
        chatElement.onclick = () => showCollaborationContent('chat', chat.id);
        const lastMessage = messages[chat.id] ? messages[chat.id][messages[chat.id].length - 1] : null;
        chatElement.innerHTML = `
            <p class="font-medium">${chat.name} <i class="fas fa-users text-sm ml-1"></i></p>
            <p class="text-xs text-text-faded truncate">${lastMessage ? `${lastMessage.sender}: ${lastMessage.text}` : 'No messages yet'}</p>
        `;
        chatList.appendChild(chatElement);
    });
}

function switchPage(pageName) {
    // Hide all pages
    document.querySelectorAll('.page').forEach(page => {
        page.classList.remove('active');
    });

    // Update nav items
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
    });

    // Show selected page
    const pageElement = document.getElementById(`${pageName}-page`);
    if (pageElement) {
        pageElement.classList.add('active');
    }

    // Activate nav item
    const navItem = document.querySelector(`.nav-item[onclick="switchPage('${pageName}')"]`);
    if (navItem) {
        navItem.classList.add('active');
    }

    // Refresh editor if needed
    if (pageName === 'editor') {
        setTimeout(() => codeEditor?.refresh(), 100);
    }

    // Load data for specific pages
    if (pageName === 'files') {
        loadSubmissions();
    } else if (pageName === 'analytics') {
        updateAnalytics();
    } else if (pageName === 'collaboration') {
        loadProjects();
        loadChats();
        showCollaborationContent(); // Show default empty state
    }
}

function showCreateProjectModal() {
    showModal('createProjectModal');
}

function closeCreateProjectModal() {
    hideModal('createProjectModal');
    document.getElementById('newProjectName').value = '';
    document.getElementById('newProjectDescription').value = '';
}

function createProject() {
    const projectName = document.getElementById('newProjectName').value.trim();
    const projectDescription = document.getElementById('newProjectDescription').value.trim();

    if (!projectName) {
        showError('Please enter a project name');
        return;
    }

    const newProject = {
        id: 'project_' + Date.now(),
        name: projectName,
        description: projectDescription,
        owner: USER_NAME,
        created: new Date().toISOString(),
        files: 0
    };

    projects.push(newProject);
    localStorage.setItem('projects', JSON.stringify(projects));
    loadProjects();
    closeCreateProjectModal();
    logActivity(`Created project: ${projectName}`);
    showSuccess(`Project "${projectName}" created successfully!`);
}

function switchToProject(projectId) {
    CURRENT_FOLDER = projectId;
    loadSubmissions();
    logActivity(`Switched to project: ${getProjectName(projectId)}`);
    showSuccess(`Switched to project: ${getProjectName(projectId)}`);
}

function getProjectName(projectId) {
    const project = projects.find(p => p.id === projectId);
    return project ? project.name : 'Unknown';
}

// =============================================
// COLLABORATION PAGE LOGIC
// =============================================
function showCollaborationContent(type, id) {
    const contentArea = document.getElementById('content-area');
    if (!contentArea) return;

    document.querySelectorAll('.chat-item, .project-item').forEach(item => {
        item.classList.remove('item-active');
    });

    if (type === 'chat' && id) {
        contentArea.innerHTML = renderCollaborationChatView(id);
        document.querySelector(`.chat-item[data-id="${id}"]`).classList.add('item-active');
    } else if (type === 'project' && id) {
        contentArea.innerHTML = renderCollaborationProjectView(id);
        document.querySelector(`.project-item[data-id="${id}"]`).classList.add('item-active');
    } else {
        contentArea.innerHTML = `<div class="empty-state"><i class="fas fa-comments"></i><h3>Select an item</h3><p>Select a conversation or project from the sidebar.</p></div>`;
    }
}

function renderCollaborationChatView(chatId) {
    const chat = chats.find(c => c.id === chatId);
    const chatMessages = messages[chatId] || [];
    if (!chat) return '<div class="empty-state"><p>Chat not found.</p></div>';

    const messagesHtml = chatMessages.map(msg => `
        <div class="flex ${msg.sender === USER_NAME ? 'justify-end' : 'justify-start'} mb-4">
            <div class="max-w-xs lg:max-w-md">
                <div class="px-4 py-2 rounded-xl ${msg.sender === USER_NAME ? 'bg-primary text-white rounded-br-none' : 'bg-tertiary text-primary rounded-tl-none'} shadow-md">
                    <p class="font-semibold text-xs ${msg.sender === USER_NAME ? '' : 'text-primary'}">${msg.sender === USER_NAME ? 'You' : msg.sender}</p>
                    <p class="mt-1">${msg.text}</p>
                    <p class="text-right text-xs mt-1">${new Date(msg.timestamp).toLocaleTimeString()}</p>
                </div>
            </div>
        </div>
    `).join('');

    return `
        <div class="flex flex-col h-full">
            <h2 class="text-2xl font-bold border-b border-border pb-4 mb-4">${chat.name}</h2>
            <div class="flex-grow overflow-y-auto p-4 space-y-4 custom-scrollbar">${messagesHtml}</div>
            <div class="pt-4 border-t border-border">
                <div class="flex items-center space-x-3">
                    <input type="text" id="collaborationMessageInput" placeholder="Type your message..." class="flex-grow p-3 bg-tertiary rounded-lg focus:outline-none">
                    <button class="btn btn-primary p-3" onclick="sendCollaborationMessage('${chatId}')"><i class="fas fa-paper-plane"></i></button>
                </div>
            </div>
        </div>
    `;
}

function renderCollaborationProjectView(projectId) {
    const project = projects.find(p => p.id === projectId);
    if (!project) return '<div class="empty-state"><p>Project not found.</p></div>';

    const projectFiles = allSubmissions.filter(s => s.folder === projectId);
    const filesHtml = projectFiles.map(file => `
        <div class="flex items-center justify-between p-3 bg-tertiary rounded-lg mb-2">
            <span class="text-sm font-medium"><i class="fas fa-file-code mr-2"></i>${file.fileName}</span>
            <button class="btn btn-primary btn-sm" onclick="viewFile('${file.submissionId}')">View</button>
        </div>
    `).join('');

    return `
        <div>
            <h2 class="text-3xl font-bold mb-4">${project.name}</h2>
            <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div class="lg:col-span-2 bg-secondary p-6 rounded-xl shadow-lg">
                    <h3 class="text-xl font-semibold mb-3 border-b border-border pb-2">Description</h3>
                    <p class="leading-relaxed">${project.description || 'No description provided.'}</p>
                </div>
                <div class="bg-secondary p-6 rounded-xl shadow-lg">
                    <h3 class="text-xl font-semibold mb-3 border-b border-border pb-2">Status</h3>
                    <p class="text-lg mb-2"><i class="fas fa-check-circle mr-2 text-green-500"></i> Active</p>
                    <button class="mt-4 w-full btn btn-success" onclick="switchPage('editor')">Go to Editor</button>
                </div>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
                <div class="bg-secondary p-6 rounded-xl shadow-lg">
                    <h3 class="text-xl font-semibold mb-3 border-b border-border pb-2">Project Files</h3>
                    ${filesHtml || '<p>No files in this project yet.</p>'}
                </div>
                <div class="bg-secondary p-6 rounded-xl shadow-lg">
                    <h3 class="text-xl font-semibold mb-3 border-b border-border pb-2">Collaborators</h3>
                    <p>Feature coming soon.</p>
                </div>
            </div>
        </div>
    `;
}

function sendCollaborationMessage(chatId) {
    const input = document.getElementById('collaborationMessageInput');
    const text = input.value.trim();
    if (!text) return;

    const message = {
        id: 'msg_' + Date.now(),
        sender: USER_NAME,
        text: text,
        timestamp: new Date().toISOString(),
        chatId: chatId
    };

    if (!messages[chatId]) messages[chatId] = [];
    messages[chatId].push(message);
    localStorage.setItem('chatMessages', JSON.stringify(messages));

    input.value = '';
    showCollaborationContent('chat', chatId);
}

// =============================================
// STAR SYSTEM
// =============================================
function toggleStar(fileId) {
    if (starredFiles.includes(fileId)) {
        starredFiles = starredFiles.filter(id => id !== fileId);
    } else {
        starredFiles.push(fileId);
    }
    localStorage.setItem('starredFiles', JSON.stringify(starredFiles));
    loadSubmissions();
    logActivity(`Toggled star for file`);
}

function filterStarred() {
    const starredSubmissions = allSubmissions.filter(sub =>
        starredFiles.includes(sub.submissionId) && sub.folder === CURRENT_FOLDER
    );
    displaySubmissions(starredSubmissions);
    showSuccess(`Showing ${starredSubmissions.length} starred files`);
}

function filterRecent() {
    const recentSubmissions = allSubmissions
        .filter(sub => sub.folder === CURRENT_FOLDER)
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
        .slice(0, 10);
    displaySubmissions(recentSubmissions);
    showSuccess(`Showing 10 most recent files`);
}

function filterFiles() {
    const searchTerm = document.getElementById('searchInput').value.toLowerCase();
    const fileTypeFilter = document.getElementById('fileTypeFilter')?.value;

    let filtered = allSubmissions.filter(submission => submission.folder === CURRENT_FOLDER);

    if (searchTerm) {
        filtered = filtered.filter(submission =>
            submission.fileName.toLowerCase().includes(searchTerm) ||
            (submission.description && submission.description.toLowerCase().includes(searchTerm)) ||
            submission.codeContent.toLowerCase().includes(searchTerm) ||
            (submission.uploadedBy && submission.uploadedBy.toLowerCase().includes(searchTerm)) ||
            (submission.tags && submission.tags.some(tag => tag.toLowerCase().includes(searchTerm)))
        );
    }

    if (fileTypeFilter) {
        filtered = filtered.filter(submission =>
            submission.fileType.toLowerCase() === fileTypeFilter.toLowerCase()
        );
    }

    displaySubmissions(filtered);
}

// 4-5

// =============================================
// ANALYTICS & ACTIVITY
// =============================================
function updateAnalytics() {
    const totalLines = allSubmissions.reduce((sum, file) => sum + (file.codeContent ? file.codeContent.split('\n').length : 0), 0);
    const activeProjects = projects.length;
    const storageUsed = allSubmissions.reduce((sum, file) => sum + (file.fileSize || 0), 0) / (1024 * 1024);
    const uniqueUsers = [...new Set(allSubmissions.map(f => f.uploadedBy))].length;

    document.getElementById('totalLines').textContent = totalLines.toLocaleString();
    document.getElementById('activeProjects').textContent = activeProjects;
    document.getElementById('collaborators').textContent = uniqueUsers;
    document.getElementById('storageUsed').textContent = storageUsed.toFixed(2) + 'MB';
}

function logActivity(action) {
    const activity = {
        action: action,
        user: USER_NAME,
        timestamp: new Date().toISOString(),
        folder: CURRENT_FOLDER
    };

    activityLog.unshift(activity);
    if (activityLog.length > 50) activityLog = activityLog.slice(0, 50);

    localStorage.setItem('activityLog', JSON.stringify(activityLog));
    loadActivityLog();
}

function loadActivityLog() {
    const activityLogContainer = document.getElementById('activityLog');
    if (!activityLogContainer) return;

    activityLogContainer.innerHTML = '';

    if (activityLog.length === 0) {
        activityLogContainer.innerHTML = '<div class="activity-item">No recent activity</div>';
        return;
    }

    activityLog.slice(0, 10).forEach(activity => {
        const activityElement = document.createElement('div');
        activityElement.className = 'activity-item';
        activityElement.innerHTML = `
            <div>${activity.action}</div>
            <div class="activity-time">${new Date(activity.timestamp).toLocaleString()} • ${activity.user}</div>
        `;
        activityLogContainer.appendChild(activityElement);
    });
}

// =============================================
// MODAL MANAGEMENT
// =============================================
function showModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.style.display = 'flex';
        document.body.style.overflow = 'hidden';
    }
}

function hideModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.style.display = 'none';
        document.body.style.overflow = 'auto';
    }
}

// Close modals on outside click
window.onclick = function (event) {
    const modals = ['previewModal', 'createFolderModal', 'createProjectModal'];
    modals.forEach(modalId => {
        const modal = document.getElementById(modalId);
        if (event.target === modal) {
            hideModal(modalId);
        }
    });
}

// =============================================
// UTILITY FUNCTIONS
// =============================================
function showSuccess(message) {
    const element = document.getElementById('successMessage');
    if (element) {
        element.textContent = message;
        element.style.display = 'block';
        setTimeout(() => element.style.display = 'none', 5000);
    }
}

function showError(message) {
    const element = document.getElementById('errorMessage');
    if (element) {
        element.textContent = message;
        element.style.display = 'block';
        setTimeout(() => element.style.display = 'none', 5000);
    }
}

function showUploadHelp() {
    alert(`📁 CodeHub Pro Features:\n\n• File Upload: Drag & drop or browse files\n• Code Editor: Write code directly with syntax highlighting\n• Templates: Pre-built templates for different languages\n• Folder System: Organize files in different folders\n• Project Management: Group files into projects\n• User Tracking: See who uploaded each file\n• Admin Features: Special privileges for admin user\n• File Editing: Edit existing files in the editor\n• File Starring: Mark important files as favorites\n• Bulk Operations: Select multiple files for batch actions\n• File Expiration: Set auto-delete timelines\n• Activity Logging: Track all user actions\n• Advanced Analytics: Code statistics and insights\n• Dark Mode: Toggle between light and dark themes\n• File Management: View, download, copy, delete files\n• Search & Filter: Find files by name, content, tags, or description\n• Cloud Storage: Secure Google Sheets backend\n\n💡 Tip: Use Ctrl+S to save files from the editor!`);
}

function exportAllFiles() {
    const folderSubmissions = allSubmissions.filter(sub => sub.folder === CURRENT_FOLDER);

    if (folderSubmissions.length === 0) {
        showError('No files to export in this folder.');
        return;
    }

    if (folderSubmissions.length === 1) {
        downloadFile(folderSubmissions[0].submissionId, folderSubmissions[0].fileName);
    } else {
        showSuccess(`Starting download of ${folderSubmissions.length} files...`);
        folderSubmissions.forEach((submission, index) => {
            setTimeout(() => {
                downloadFile(submission.submissionId, submission.fileName);
            }, index * 300);
        });
        logActivity(`Exported ${folderSubmissions.length} files`);
    }
}

// =============================================
// KEYBOARD SHORTCUTS
// =============================================
document.addEventListener('keydown', function (e) {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        const editorPage = document.getElementById('editor-page');
        if (editorPage && editorPage.classList.contains('active')) {
            if (editingFileId) saveFileEdit();
            else createFileFromEditor();
        }
    }

    if (e.key === 'Escape') {
        hideModal('previewModal');
        hideModal('createFolderModal');
        hideModal('createProjectModal');
    }
});

// =============================================
// ONLINE COMPILER PREVIEW FEATURE
// =============================================
function createCodePreview() {
    // This would integrate with an online compiler API
    // For now, we'll create a basic preview functionality
    const previewModal = document.createElement('div');
    previewModal.id = 'compilerPreviewModal';
    previewModal.className = 'modal-overlay';
    previewModal.innerHTML = `
        <div class="modal-container" style="max-width: 90%; height: 90%;">
            <div class="modal-header">
                <h3><i class="fas fa-play-circle"></i> Code Preview & Execution</h3>
                <button class="modal-close" onclick="hideModal('compilerPreviewModal')">&times;</button>
            </div>
            <div class="modal-body" style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; height: calc(100% - 120px);">
                <div>
                    <h4>Code</h4>
                    <div id="previewCodeEditor" style="height: 400px; border: 1px solid var(--border); border-radius: var(--radius);"></div>
                </div>
                <div>
                    <h4>Output</h4>
                    <div id="previewOutput" style="height: 400px; background: #1e1e1e; color: white; padding: 1rem; border-radius: var(--radius); font-family: monospace; overflow-y: auto;"></div>
                </div>
            </div>
            <div class="modal-footer">
                <button class="btn btn-success" onclick="runCodePreview()">
                    <i class="fas fa-play"></i> Run Code
                </button>
                <button class="btn btn-secondary" onclick="hideModal('compilerPreviewModal')">
                    <i class="fas fa-times"></i> Close
                </button>
            </div>
        </div>
    `;
    document.body.appendChild(previewModal);
}

function showCodePreview(submissionId) {
    const submission = allSubmissions.find(s => s.submissionId === submissionId);
    if (!submission) return;

    createCodePreview();
    showModal('compilerPreviewModal');

    // Initialize code editor for preview
    setTimeout(() => {
        const previewEditor = CodeMirror.fromTextArea(document.getElementById('previewCodeEditor'), {
            mode: submission.fileType === 'js' ? 'javascript' : submission.fileType,
            theme: 'material-darker',
            lineNumbers: true,
            readOnly: false
        });
        previewEditor.setValue(submission.codeContent);

        window.previewEditor = previewEditor;
    }, 100);
}

function runCodePreview() {
    const output = document.getElementById('previewOutput');
    if (!output || !window.previewEditor) return;

    const code = window.previewEditor.getValue();
    output.innerHTML = '<div style="color: #aaa;">Running code...</div>';

    // Basic JavaScript execution for demo
    if (code.includes('console.log')) {
        const logs = [];
        const originalLog = console.log;
        console.log = function (...args) {
            logs.push(args.join(' '));
            originalLog.apply(console, args);
        };

        try {
            eval(code);
            console.log = originalLog;
            output.innerHTML = logs.map(log => `<div>${log}</div>`).join('') || '<div style="color: #aaa;">No output</div>';
        } catch (error) {
            output.innerHTML = `<div style="color: #ff6b6b;">Error: ${error.message}</div>`;
            console.log = originalLog;
        }
    } else {
        output.innerHTML = '<div style="color: #aaa;">Add console.log statements to see output</div>';
    }
}

// Initialize code preview feature
document.addEventListener('DOMContentLoaded', function () {
    // Add preview button to file actions
    setTimeout(() => {
        const fileActions = document.querySelectorAll('.file-actions');
        fileActions.forEach(actions => {
            if (!actions.querySelector('.preview-btn')) {
                const previewBtn = document.createElement('button');
                previewBtn.className = 'action-btn';
                previewBtn.style.background = 'var(--info); color: white;';
                previewBtn.innerHTML = '<i class="fas fa-play"></i> Preview';
                previewBtn.onclick = function () {
                    const fileItem = this.closest('.file-item');
                    const fileId = fileItem.querySelector('.file-checkbox').getAttribute('onchange').split("'")[1];
                    showCodePreview(fileId);
                };
                actions.appendChild(previewBtn);
            }
        });
    }, 1000);
});
