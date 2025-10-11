// Configuration
let GOOGLE_SCRIPT_URL = localStorage.getItem('googleScriptUrl') || '';
let USER_NAME = localStorage.getItem('userName') || '';
let CURRENT_FOLDER = localStorage.getItem('currentFolder') || 'general';
let codeEditor = null;

let selectedFiles = [];
let allSubmissions = [];
let currentPreviewFile = null;
let folders = JSON.parse(localStorage.getItem('folders')) || [{ id: 'general', name: 'General', files: 0 }];

// Initialize the application
document.addEventListener('DOMContentLoaded', function() {
    initializeDragAndDrop();
    setupFileInput();
    initializeCodeEditor();
    checkUserSetup();
    loadFolders();
    updateFolderSelects();
    
    if (GOOGLE_SCRIPT_URL) {
        loadSubmissions();
        hideSetupGuide();
    }
    
    // Add event listeners for filter
    document.getElementById('searchInput').addEventListener('input', filterFiles);
    document.getElementById('fileTypeFilter').addEventListener('change', filterFiles);
    
    // Update editor title when filename changes
    document.getElementById('editorFileName').addEventListener('input', updateEditorTitle);
});

function checkUserSetup() {
    // Show welcome modal if no user name is set
    if (!USER_NAME) {
        document.getElementById('welcomeModal').style.display = 'block';
    } else {
        document.getElementById('userName').textContent = USER_NAME;
    }
    
    // Show setup guide if no script URL is set
    if (!GOOGLE_SCRIPT_URL) {
        document.getElementById('setupGuide').style.display = 'block';
    }
}

function saveUserName() {
    const userName = document.getElementById('userNameInput').value.trim();
    if (userName) {
        USER_NAME = userName;
        localStorage.setItem('userName', userName);
        document.getElementById('userName').textContent = userName;
        document.getElementById('welcomeModal').style.display = 'none';
        showSuccess(`Welcome to CodeHub, ${userName}! 🎉`);
    } else {
        showError('Please enter your name to continue');
    }
}

function initializeCodeEditor() {
    codeEditor = CodeMirror.fromTextArea(document.getElementById('codeEditor'), {
        mode: 'javascript',
        theme: 'material-darker',
        lineNumbers: true,
        matchBrackets: true,
        indentUnit: 4,
        indentWithTabs: false,
        extraKeys: {
            "Ctrl-S": function(instance) { createFileFromEditor(); },
            "Cmd-S": function(instance) { createFileFromEditor(); },
            "Ctrl-F": function(instance) { formatCode(); },
            "Cmd-F": function(instance) { formatCode(); }
        }
    });
    
    // Set initial content
    codeEditor.setValue(`// Welcome to CodeHub Editor!\n// Start writing your code here...\n\nfunction helloWorld() {\n    console.log("Hello, CodeHub!");\n    return "Welcome to your code editor";\n}\n\n// Try creating a file using the button below!`);
}

function updateEditorTitle() {
    const fileName = document.getElementById('editorFileName').value;
    const titleElement = document.getElementById('editorTitle');
    if (fileName) {
        titleElement.textContent = `Editing: ${fileName}`;
        // Auto-detect and set mode based on file extension
        setEditorMode(fileName);
    } else {
        titleElement.textContent = 'Code Editor';
    }
}

function setEditorMode(fileName) {
    const extension = fileName.split('.').pop().toLowerCase();
    const modeMap = {
        'js': 'javascript',
        'py': 'python',
        'html': 'htmlmixed',
        'css': 'css',
        'java': 'text/x-java',
        'cpp': 'text/x-c++src',
        'c': 'text/x-csrc',
        'php': 'php',
        'xml': 'xml',
        'sql': 'sql',
        'json': 'application/json'
    };
    
    const mode = modeMap[extension] || 'javascript';
    codeEditor.setOption('mode', mode);
}

function switchTab(tabName) {
    // Hide all tabs
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.remove('active');
    });
    
    // Remove active class from all buttons
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    
    // Show selected tab
    document.getElementById(tabName).classList.add('active');
    
    // Activate selected button
    event.currentTarget.classList.add('active');
    
    // Refresh editor if switching to editor tab
    if (tabName === 'code-editor') {
        setTimeout(() => codeEditor.refresh(), 100);
    }
}

function checkSetup() {
    const scriptUrlInput = document.getElementById('scriptUrlInput');
    if (GOOGLE_SCRIPT_URL) {
        scriptUrlInput.value = GOOGLE_SCRIPT_URL;
        hideSetupGuide();
    }
}

function hideSetupGuide() {
    document.getElementById('setupGuide').style.display = 'none';
}

function saveScriptUrl() {
    const url = document.getElementById('scriptUrlInput').value.trim();
    if (url && url.includes('google.com')) {
        GOOGLE_SCRIPT_URL = url;
        localStorage.setItem('googleScriptUrl', url);
        hideSetupGuide();
        showSuccess('Configuration saved successfully! Loading your files...');
        loadSubmissions();
    } else {
        showError('Please enter a valid Google Apps Script URL');
    }
}

// Folder Management Functions
function loadFolders() {
    const folderList = document.getElementById('folderList');
    folderList.innerHTML = '';
    
    folders.forEach(folder => {
        const folderElement = document.createElement('div');
        folderElement.className = `folder-item ${folder.id === CURRENT_FOLDER ? 'active' : ''}`;
        folderElement.innerHTML = `
            <i class="fas fa-folder"></i>
            ${folder.name}
            <span class="folder-stats">(${folder.files})</span>
        `;
        folderElement.onclick = () => switchFolder(folder.id);
        folderList.appendChild(folderElement);
    });
}

function updateFolderSelects() {
    const uploadFolder = document.getElementById('uploadFolder');
    const editorFolder = document.getElementById('editorFolder');
    
    // Clear existing options except "General"
    uploadFolder.innerHTML = '<option value="general">General</option>';
    editorFolder.innerHTML = '<option value="general">General</option>';
    
    // Add folder options
    folders.forEach(folder => {
        if (folder.id !== 'general') {
            uploadFolder.innerHTML += `<option value="${folder.id}">${folder.name}</option>`;
            editorFolder.innerHTML += `<option value="${folder.id}">${folder.name}</option>`;
        }
    });
    
    // Set current folder
    uploadFolder.value = CURRENT_FOLDER;
    editorFolder.value = CURRENT_FOLDER;
}

function switchFolder(folderId) {
    CURRENT_FOLDER = folderId;
    localStorage.setItem('currentFolder', folderId);
    loadFolders();
    loadSubmissions();
    showSuccess(`Switched to folder: ${getFolderName(folderId)}`);
}

function getFolderName(folderId) {
    const folder = folders.find(f => f.id === folderId);
    return folder ? folder.name : 'Unknown';
}

function showCreateFolderModal() {
    document.getElementById('createFolderModal').style.display = 'block';
}

function closeCreateFolderModal() {
    document.getElementById('createFolderModal').style.display = 'none';
    document.getElementById('newFolderName').value = '';
}

function createFolder() {
    const folderName = document.getElementById('newFolderName').value.trim();
    if (!folderName) {
        showError('Please enter a folder name');
        return;
    }
    
    // Check if folder already exists
    if (folders.some(f => f.name.toLowerCase() === folderName.toLowerCase())) {
        showError('A folder with this name already exists');
        return;
    }
    
    const newFolder = {
        id: 'folder_' + Date.now(),
        name: folderName,
        files: 0
    };
    
    folders.push(newFolder);
    localStorage.setItem('folders', JSON.stringify(folders));
    updateFolderSelects();
    loadFolders();
    closeCreateFolderModal();
    showSuccess(`Folder "${folderName}" created successfully!`);
}

// Drag and drop functionality
function initializeDragAndDrop() {
    const uploadArea = document.getElementById('uploadArea');
    
    uploadArea.addEventListener('dragover', function(e) {
        e.preventDefault();
        uploadArea.classList.add('dragover');
    });
    
    uploadArea.addEventListener('dragleave', function() {
        uploadArea.classList.remove('dragover');
    });
    
    uploadArea.addEventListener('drop', function(e) {
        e.preventDefault();
        uploadArea.classList.remove('dragover');
        handleFiles(e.dataTransfer.files);
    });
}

function setupFileInput() {
    const fileInput = document.getElementById('fileInput');
    fileInput.addEventListener('change', function(e) {
        handleFiles(e.target.files);
    });
}

function handleFiles(files) {
    if (!GOOGLE_SCRIPT_URL) {
        showError('Please configure the Google Apps Script URL first');
        document.getElementById('setupGuide').style.display = 'block';
        return;
    }
    
    selectedFiles = Array.from(files);
    updateUploadUI();
}

function updateUploadUI() {
    const uploadContent = document.getElementById('uploadContent');
    const submitBtn = document.getElementById('submitBtn');
    
    if (selectedFiles.length > 0) {
        uploadContent.innerHTML = `
            <div class="upload-icon">
                <i class="fas fa-check-circle" style="color: var(--success);"></i>
            </div>
            <h3>${selectedFiles.length} File(s) Selected</h3>
            ${selectedFiles.map(file => `
                <div style="text-align: left; margin: 8px 0; padding: 10px; background: white; border-radius: 8px; border: 1px solid var(--border);">
                    <i class="fas fa-file-code"></i> ${file.name} 
                    <span style="background: var(--primary); color: white; padding: 2px 8px; border-radius: 10px; font-size: 0.8rem; margin-left: 10px;">
                        ${(file.size / 1024).toFixed(1)} KB
                    </span>
                    <span style="background: var(--secondary); color: white; padding: 2px 8px; border-radius: 10px; font-size: 0.8rem; margin-left: 5px;">
                        ${file.name.split('.').pop()}
                    </span>
                </div>
            `).join('')}
        `;
        submitBtn.disabled = false;
    } else {
        uploadContent.innerHTML = `
            <div class="upload-icon">
                <i class="fas fa-file-upload"></i>
            </div>
            <h3>Drag & Drop Your Files Here</h3>
            <p>or click to browse your computer</p>
            <p class="small">Supports all code files: .js, .py, .java, .cpp, .html, .css, etc.</p>
        `;
        submitBtn.disabled = true;
    }
}

// Code Editor Functions
function createFileFromEditor() {
    const fileName = document.getElementById('editorFileName').value.trim();
    const description = document.getElementById('editorDescription').value.trim();
    const folder = document.getElementById('editorFolder').value;
    const codeContent = codeEditor.getValue();
    
    if (!fileName) {
        showError('Please enter a file name');
        return;
    }
    
    if (!codeContent.trim()) {
        showError('Please write some code before creating a file');
        return;
    }
    
    // Create a virtual file object
    const virtualFile = {
        name: fileName,
        size: new Blob([codeContent]).size,
        type: 'text/plain'
    };
    
    // Upload the virtual file
    uploadVirtualFile(virtualFile, codeContent, description, folder);
}

async function uploadVirtualFile(file, content, description, folder) {
    if (!GOOGLE_SCRIPT_URL) {
        showError('Please configure the Google Apps Script URL first');
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
        
        const response = await fetch(GOOGLE_SCRIPT_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: params
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        
        if (data.success) {
            showSuccess(`File "${file.name}" created successfully! ✨`);
            // Clear editor
            clearEditor();
            // Reload files
            await loadSubmissions();
        } else {
            throw new Error(data.error || 'File creation failed');
        }
    } catch (error) {
        showError('Failed to create file: ' + error.message);
    }
}

function clearEditor() {
    codeEditor.setValue('');
    document.getElementById('editorFileName').value = '';
    document.getElementById('editorDescription').value = '';
    updateEditorTitle();
}

function formatCode() {
    const content = codeEditor.getValue();
    // Simple formatting - in a real app you might use a proper formatter
    try {
        // Basic JavaScript formatting
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
        showError('Formatting failed. The code might have syntax errors.');
    }
}

function loadTemplate() {
    const templates = {
        'JavaScript': `function main() {\n    // Your code here\n    console.log("Hello World!");\n    \n    return {\n        success: true,\n        message: "Function executed successfully"\n    };\n}\n\n// Call the main function\nmain();`,
        'Python': `def main():\n    # Your code here\n    print("Hello World!")\n    \n    return {\n        "success": True,\n        "message": "Function executed successfully"\n    }\n\nif __name__ == "__main__":\n    main()`,
        'HTML': `<!DOCTYPE html>\n<html lang="en">\n<head>\n    <meta charset="UTF-8">\n    <meta name="viewport" content="width=device-width, initial-scale=1.0">\n    <title>Document</title>\n    <style>\n        body {\n            font-family: Arial, sans-serif;\n            margin: 0;\n            padding: 20px;\n        }\n    </style>\n</head>\n<body>\n    <h1>Hello World!</h1>\n    <script>\n        // Your JavaScript here\n    </script>\n</body>\n</html>`,
        'CSS': `/* Main Styles */\n.container {\n    max-width: 1200px;\n    margin: 0 auto;\n    padding: 20px;\n}\n\n.header {\n    background: #f8f9fa;\n    padding: 20px;\n    border-radius: 8px;\n}\n\n/* Responsive Design */\n@media (max-width: 768px) {\n    .container {\n        padding: 10px;\n    }\n}`
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

async function submitFiles() {
    if (!GOOGLE_SCRIPT_URL) {
        showError('Please configure the Google Apps Script URL first');
        return;
    }

    const submitBtn = document.getElementById('submitBtn');
    const description = document.getElementById('fileDescription').value.trim();
    const folder = document.getElementById('uploadFolder').value;
    
    if (selectedFiles.length === 0) {
        showError('Please select at least one file to upload.');
        return;
    }
    
    submitBtn.innerHTML = '<div class="loading"></div> Uploading...';
    submitBtn.disabled = true;
    
    try {
        for (const file of selectedFiles) {
            await uploadFileToSheets(file, description, folder);
        }
        
        showSuccess(`🎉 Successfully uploaded ${selectedFiles.length} file(s)!`);
        
        // Reset form
        selectedFiles = [];
        document.getElementById('fileDescription').value = '';
        document.getElementById('fileInput').value = '';
        updateUploadUI();
        
        // Reload submissions
        await loadSubmissions();
        
    } catch (error) {
        showError('Upload failed: ' + error.message);
        console.error('Upload error:', error);
    } finally {
        submitBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Upload to Cloud';
        submitBtn.disabled = false;
    }
}

async function uploadFileToSheets(file, description, folder) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        
        reader.onload = async function(e) {
            try {
                const fileContent = e.target.result;
                
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
                
                const response = await fetch(GOOGLE_SCRIPT_URL, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                    },
                    body: params
                });
                
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }
                
                const data = await response.json();
                
                if (data.success) {
                    resolve(data);
                } else {
                    reject(new Error(data.error || 'Upload failed'));
                }
            } catch (error) {
                reject(error);
            }
        };
        
        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsText(file);
    });
}

async function loadSubmissions() {
    if (!GOOGLE_SCRIPT_URL) return;

    try {
        const response = await fetch(`${GOOGLE_SCRIPT_URL}?action=GET_SUBMISSIONS&timestamp=${new Date().getTime()}`);
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.success) {
            allSubmissions = data.submissions || [];
            
            // Filter by current folder
            const folderSubmissions = allSubmissions.filter(submission => 
                submission.folder === CURRENT_FOLDER
            );
            
            displaySubmissions(folderSubmissions);
            updateStatistics(folderSubmissions);
            updateFolderStats();
        } else {
            throw new Error(data.error || 'Failed to load files');
        }
    } catch (error) {
        console.error('Load error:', error);
        showError('Failed to load files: ' + error.message);
    }
}

function updateFolderStats() {
    // Update file counts for each folder
    folders.forEach(folder => {
        folder.files = allSubmissions.filter(sub => sub.folder === folder.id).length;
    });
    localStorage.setItem('folders', JSON.stringify(folders));
    loadFolders();
}

function updateStatistics(submissions) {
    document.getElementById('totalFiles').textContent = submissions.length;
    document.getElementById('fileTypes').textContent = [...new Set(submissions.map(s => s.fileType))].length;
    document.getElementById('lastUpload').textContent = submissions.length > 0 
        ? new Date(submissions[0].timestamp).toLocaleDateString() 
        : '-';
}

function displaySubmissions(submissions) {
    const container = document.getElementById('submissionsContainer');
    
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
    
    container.innerHTML = submissions.map(submission => `
        <div class="file-item">
            <div class="file-header">
                <div class="file-name">
                    <i class="fas fa-file-code"></i>
                    ${submission.fileName}
                </div>
                <span class="file-type">${submission.fileType}</span>
            </div>
            
            <div class="file-meta">
                <div class="file-meta-item">
                    <i class="fas fa-weight-hanging"></i> ${(submission.fileSize / 1024).toFixed(1)} KB
                </div>
                <div class="file-meta-item">
                    <i class="fas fa-calendar"></i> ${new Date(submission.timestamp).toLocaleDateString()}
                </div>
                <div class="file-meta-item">
                    <i class="fas fa-clock"></i> ${new Date(submission.timestamp).toLocaleTimeString()}
                </div>
                <div class="file-meta-item">
                    <i class="fas fa-user"></i> ${submission.uploadedBy || 'Anonymous'}
                </div>
                ${submission.folder && submission.folder !== 'general' ? `
                    <div class="file-meta-item">
                        <i class="fas fa-folder"></i> ${getFolderName(submission.folder)}
                    </div>
                ` : ''}
            </div>
            
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
                <button class="action-btn" style="background: var(--primary); color: white;" onclick="copyFileCode('${submission.submissionId}')">
                    <i class="fas fa-copy"></i> Copy
                </button>
                <button class="action-btn" style="background: var(--danger); color: white;" onclick="deleteFile('${submission.submissionId}')">
                    <i class="fas fa-trash"></i> Delete
                </button>
            </div>
        </div>
    `).join('');
}

function filterFiles() {
    const searchTerm = document.getElementById('searchInput').value.toLowerCase();
    const fileTypeFilter = document.getElementById('fileTypeFilter').value;
    
    let filtered = allSubmissions.filter(submission => submission.folder === CURRENT_FOLDER);
    
    if (searchTerm) {
        filtered = filtered.filter(submission => 
            submission.fileName.toLowerCase().includes(searchTerm) ||
            (submission.description && submission.description.toLowerCase().includes(searchTerm)) ||
            submission.codeContent.toLowerCase().includes(searchTerm) ||
            (submission.uploadedBy && submission.uploadedBy.toLowerCase().includes(searchTerm))
        );
    }
    
    if (fileTypeFilter) {
        filtered = filtered.filter(submission => 
            submission.fileType.toLowerCase() === fileTypeFilter.toLowerCase()
        );
    }
    
    displaySubmissions(filtered);
}

async function viewFile(submissionId) {
    try {
        const submission = allSubmissions.find(s => s.submissionId === submissionId);
        if (!submission) {
            throw new Error('File not found');
        }

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
        document.getElementById('previewModal').style.display = 'block';
        
    } catch (error) {
        showError('Failed to open file: ' + error.message);
    }
}

function closeModal() {
    document.getElementById('previewModal').style.display = 'none';
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
    } else {
        showError('File not found for download');
    }
}

function downloadCurrentFile() {
    if (currentPreviewFile) {
        downloadFile(currentPreviewFile.submissionId, currentPreviewFile.fileName);
    }
}

async function copyFileCode(submissionId) {
    const submission = allSubmissions.find(s => s.submissionId === submissionId);
    if (submission) {
        try {
            await navigator.clipboard.writeText(submission.codeContent);
            showSuccess('Code copied to clipboard! 📋');
        } catch (err) {
            // Fallback
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

async function copyToClipboard() {
    if (currentPreviewFile) {
        await copyFileCode(currentPreviewFile.submissionId);
    }
}

async function deleteFile(submissionId) {
    const submission = allSubmissions.find(s => s.submissionId === submissionId);
    if (!submission) return;

    if (!confirm(`Are you sure you want to delete "${submission.fileName}"? This action cannot be undone.`)) {
        return;
    }

    try {
        const response = await fetch(`${GOOGLE_SCRIPT_URL}?action=DELETE_FILE&submissionId=${submissionId}`);
        const data = await response.json();
        
        if (data.success) {
            showSuccess(`"${submission.fileName}" has been deleted successfully!`);
            await loadSubmissions();
        } else {
            throw new Error(data.error || 'Delete failed');
        }
    } catch (error) {
        showError('Delete failed: ' + error.message);
    }
}

async function exportAllFiles() {
    const folderSubmissions = allSubmissions.filter(sub => sub.folder === CURRENT_FOLDER);
    
    if (folderSubmissions.length === 0) {
        showError('No files to export in this folder.');
        return;
    }

    // Simple implementation - export first file
    if (folderSubmissions.length === 1) {
        downloadFile(folderSubmissions[0].submissionId, folderSubmissions[0].fileName);
    } else {
        showSuccess(`Starting download of ${folderSubmissions.length} files...`);
        // Download files with delay to avoid browser blocking
        folderSubmissions.forEach((submission, index) => {
            setTimeout(() => {
                downloadFile(submission.submissionId, submission.fileName);
            }, index * 300);
        });
    }
}

function showUploadHelp() {
    alert(`📁 CodeHub Pro Features:\n\n• File Upload: Drag & drop or browse files\n• Code Editor: Write code directly with syntax highlighting\n• Templates: Pre-built templates for different languages\n• Folder System: Organize files in different folders\n• User Tracking: See who uploaded each file\n• File Management: View, download, copy, delete files\n• Search & Filter: Find files by name, content, or description\n• Cloud Storage: Secure Google Sheets backend\n\n💡 Tip: Use Ctrl+S to save files from the editor!`);
}

function clearLocalData() {
    if (confirm('Clear all local settings and reset the application?')) {
        localStorage.removeItem('googleScriptUrl');
        localStorage.removeItem('userName');
        localStorage.removeItem('currentFolder');
        localStorage.removeItem('folders');
        location.reload();
    }
}

function showSuccess(message) {
    const element = document.getElementById('successMessage');
    element.textContent = message;
    element.style.display = 'block';
    setTimeout(() => element.style.display = 'none', 5000);
}

function showError(message) {
    const element = document.getElementById('errorMessage');
    element.textContent = message;
    element.style.display = 'block';
    setTimeout(() => element.style.display = 'none', 5000);
}

// Close modal on outside click
window.onclick = function(event) {
    const modal = document.getElementById('previewModal');
    const createFolderModal = document.getElementById('createFolderModal');
    const welcomeModal = document.getElementById('welcomeModal');
    
    if (event.target === modal) {
        closeModal();
    }
    if (event.target === createFolderModal) {
        closeCreateFolderModal();
    }
    if (event.target === welcomeModal) {
        // Don't close welcome modal - user must enter name
    }
}

// Keyboard shortcuts
document.addEventListener('keydown', function(e) {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        if (document.getElementById('code-editor').classList.contains('active')) {
            createFileFromEditor();
        }
    }
});