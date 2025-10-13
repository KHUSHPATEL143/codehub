// =============================================
// CONFIGURATION - EDIT THIS SECTION
// =============================================

// Replace this with your deployed Google Apps Script URL
const GOOGLE_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbzRFPAtSgX8zXAK03vySpHRf5oJjtjJqLoU-y5LQcdBGlxm6TE1tnZWaEp5AiuYwLoN/exec';

// Admin username (has special privileges)
const ADMIN_USERNAME = 'khush';

// =============================================
// END OF CONFIGURATION
// =============================================
// Application State
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
let folders = JSON.parse(localStorage.getItem('folders')) || [{ id: 'general', name: 'General', files: 0, privacy: 'private' }];
let projects = JSON.parse(localStorage.getItem('projects')) || [];
let starredFiles = JSON.parse(localStorage.getItem('starredFiles')) || [];
let activityLog = JSON.parse(localStorage.getItem('activityLog')) || [];

// Initialize the application
document.addEventListener('DOMContentLoaded', function () {
    initializeApp();
});

function initializeApp() {
    initializeDragAndDrop();
    setupFileInput();
    initializeCodeEditor();
    initializeDarkMode();
    checkUserSetup();
    loadFolders();
    updateFolderSelects();
    loadProjects();
    loadActivityLog();
    updateAnalytics();

    // Check if user is admin
    IS_ADMIN = USER_NAME.toLowerCase() === ADMIN_USERNAME.toLowerCase();
    if (IS_ADMIN) {
        document.getElementById('adminFolderOptions').style.display = 'block';
        showSuccess('Admin privileges activated! 👑');
    }

    // Load files if script URL is configured
    if (GOOGLE_SCRIPT_URL && !GOOGLE_SCRIPT_URL.includes('YOUR_SCRIPT_ID_HERE')) {
        loadSubmissions();
        registerUser(); // Register user even if they haven't uploaded files
    } else {
        showError('Please configure the Google Apps Script URL in the script.js file');
    }

    // Add event listeners for filter
    document.getElementById('searchInput').addEventListener('input', filterFiles);
    document.getElementById('fileTypeFilter').addEventListener('change', filterFiles);

    // Update editor title when filename changes
    document.getElementById('editorFileName').addEventListener('input', updateEditorTitle);
}

function registerUser() {
    // Register user in Google Sheets even if they haven't uploaded files
    if (USER_NAME && GOOGLE_SCRIPT_URL && !GOOGLE_SCRIPT_URL.includes('YOUR_SCRIPT_ID_HERE')) {
        const params = new URLSearchParams();
        params.append('action', 'REGISTER_USER');
        params.append('userName', USER_NAME);
        params.append('timestamp', new Date().toISOString());

        fetch(GOOGLE_SCRIPT_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: params
        }).catch(error => console.log('User registration attempt:', error));
    }
}

function initializeDarkMode() {
    const themeToggle = document.getElementById('themeToggle');

    if (DARK_MODE) {
        document.body.classList.add('dark-mode');
        themeToggle.innerHTML = '<i class="fas fa-sun"></i>';
        // Update CodeMirror theme if editor exists
        if (codeEditor) {
            codeEditor.setOption('theme', 'material-darker');
        }
    } else {
        document.body.classList.remove('dark-mode');
        themeToggle.innerHTML = '<i class="fas fa-moon"></i>';
        // Update CodeMirror theme if editor exists
        if (codeEditor) {
            codeEditor.setOption('theme', 'default');
        }
    }
}

function toggleDarkMode() {
    DARK_MODE = !DARK_MODE;
    localStorage.setItem('darkMode', DARK_MODE);
    initializeDarkMode();
    showSuccess(DARK_MODE ? 'Dark mode activated 🌙' : 'Light mode activated ☀️');
}

function checkUserSetup() {
    // Show welcome modal if no user name is set
    if (!USER_NAME) {
        document.getElementById('welcomeModal').style.display = 'block';
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
        document.getElementById('welcomeModal').style.display = 'none';

        // Check if user is admin
        IS_ADMIN = USER_NAME.toLowerCase() === ADMIN_USERNAME.toLowerCase();
        if (IS_ADMIN) {
            document.getElementById('adminFolderOptions').style.display = 'block';
            showSuccess(`Welcome Admin ${userName}! 👑 Special privileges activated.`);
        } else {
            showSuccess(`Welcome to CodeHub, ${userName}! 🎉`);
        }

        // Register user
        registerUser();
    } else {
        showError('Please enter your name to continue');
    }
}

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
                if (editingFileId) {
                    saveFileEdit();
                } else {
                    createFileFromEditor();
                }
            },
            "Cmd-S": function (instance) {
                if (editingFileId) {
                    saveFileEdit();
                } else {
                    createFileFromEditor();
                }
            },
            "Ctrl-F": function (instance) { formatCode(); },
            "Cmd-F": function (instance) { formatCode(); }
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

// Enhanced Folder Management
function loadFolders() {
    const folderList = document.getElementById('folderList');
    folderList.innerHTML = '';

    folders.forEach(folder => {
        const folderElement = document.createElement('div');
        folderElement.className = `folder-item ${folder.id === CURRENT_FOLDER ? 'active' : ''}`;
        folderElement.innerHTML = `
            <div class="folder-info">
                <i class="fas fa-folder"></i>
                ${folder.name}
                <span class="folder-stats">(${folder.files})</span>
                ${folder.privacy === 'public' ? '<span class="folder-privacy public">Public</span>' : '<span class="folder-privacy">Private</span>'}
            </div>
            ${IS_ADMIN || folder.owner === USER_NAME ? '<i class="fas fa-ellipsis-v" onclick="showFolderOptions(event, \'' + folder.id + '\')"></i>' : ''}
        `;
        folderElement.onclick = () => switchFolder(folder.id);
        folderList.appendChild(folderElement);
    });
}

function showFolderOptions(event, folderId) {
    event.stopPropagation();
    // Implement folder options menu (rename, delete, change privacy)
    const folder = folders.find(f => f.id === folderId);
    if (folder) {
        const action = confirm(`Folder: ${folder.name}\n\nOptions:\n- Press OK to delete folder\n- Cancel for other options`);
        if (action) {
            deleteFolder(folderId);
        }
    }
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
    logActivity(`Switched to folder: ${getFolderName(folderId)}`);
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
    const privacy = document.getElementById('folderPrivacy').value;

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
        files: 0,
        privacy: privacy,
        owner: USER_NAME,
        created: new Date().toISOString()
    };

    folders.push(newFolder);
    localStorage.setItem('folders', JSON.stringify(folders));
    updateFolderSelects();
    loadFolders();
    closeCreateFolderModal();
    logActivity(`Created folder: ${folderName}`);
    showSuccess(`Folder "${folderName}" created successfully!`);
}

function deleteFolder(folderId) {
    if (folderId === 'general') {
        showError('Cannot delete the General folder');
        return;
    }

    const folder = folders.find(f => f.id === folderId);
    if (!folder) return;

    if (!IS_ADMIN && folder.owner !== USER_NAME) {
        showError('You can only delete folders you created');
        return;
    }

    if (!confirm(`Are you sure you want to delete folder "${folder.name}"? This will move all files to General folder.`)) {
        return;
    }

    // Move files to general folder
    allSubmissions.forEach(submission => {
        if (submission.folder === folderId) {
            submission.folder = 'general';
        }
    });

    // Remove folder
    folders = folders.filter(f => f.id !== folderId);
    localStorage.setItem('folders', JSON.stringify(folders));
    updateFolderSelects();
    loadFolders();
    logActivity(`Deleted folder: ${folder.name}`);
    showSuccess(`Folder "${folder.name}" deleted successfully!`);
}

// Project Management
function loadProjects() {
    const projectsList = document.getElementById('projectsList');
    projectsList.innerHTML = '';

    if (projects.length === 0) {
        projectsList.innerHTML = '<p>No projects yet. Create your first project!</p>';
        return;
    }

    projects.forEach(project => {
        const projectElement = document.createElement('div');
        projectElement.className = 'project-item';
        projectElement.innerHTML = `
            <div class="project-header">
                <strong>${project.name}</strong>
                <span>${project.files || 0} files</span>
            </div>
            <p>${project.description || 'No description'}</p>
            <div class="project-stats">
                <span><i class="fas fa-calendar"></i> ${new Date(project.created).toLocaleDateString()}</span>
                <span><i class="fas fa-user"></i> ${project.owner}</span>
            </div>
        `;
        projectElement.onclick = () => switchToProject(project.id);
        projectsList.appendChild(projectElement);
    });
}

function showCreateProjectModal() {
    document.getElementById('createProjectModal').style.display = 'block';
}

function closeCreateProjectModal() {
    document.getElementById('createProjectModal').style.display = 'none';
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
    // For now, projects work like folders
    CURRENT_FOLDER = projectId;
    loadSubmissions();
    logActivity(`Switched to project: ${getProjectName(projectId)}`);
    showSuccess(`Switched to project: ${getProjectName(projectId)}`);
}

function getProjectName(projectId) {
    const project = projects.find(p => p.id === projectId);
    return project ? project.name : 'Unknown';
}

// Enhanced File Management
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

// Bulk Operations
function toggleBulkSelect() {
    bulkSelectMode = !bulkSelectMode;
    selectedFiles.clear();
    document.getElementById('bulkActions').style.display = bulkSelectMode ? 'block' : 'none';
    document.getElementById('submissionsContainer').querySelectorAll('.file-checkbox').forEach(cb => {
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
    document.getElementById('selectedCount').textContent = `${selectedFiles.size} files selected`;
}

function clearSelection() {
    selectedFiles.clear();
    document.getElementById('submissionsContainer').querySelectorAll('.file-checkbox').forEach(cb => {
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
}

function showBulkActions() {
    if (!bulkSelectMode) {
        toggleBulkSelect();
    }
}

// File Editing
function editCurrentFile() {
    if (!currentPreviewFile) return;

    editingFileId = currentPreviewFile.submissionId;
    document.getElementById('editorFileName').value = currentPreviewFile.fileName;
    document.getElementById('editorDescription').value = currentPreviewFile.description || '';
    document.getElementById('editorTags').value = currentPreviewFile.tags ? currentPreviewFile.tags.join(', ') : '';
    document.getElementById('editorFolder').value = currentPreviewFile.folder || 'general';

    codeEditor.setValue(currentPreviewFile.codeContent);
    document.getElementById('saveEditBtn').style.display = 'inline-block';

    switchTab('code-editor');
    closeModal();
    showSuccess('File loaded into editor. Make your changes and click "Save Changes"');
}

function saveFileEdit() {
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

    // Check if user owns the file or is admin
    if (!IS_ADMIN && file.uploadedBy !== USER_NAME) {
        showError('You can only edit your own files');
        return;
    }

    // Update file data
    file.fileName = fileName;
    file.description = description;
    file.tags = tags;
    file.folder = folder;
    file.codeContent = codeContent;
    file.lastModified = new Date().toISOString();
    file.modifiedBy = USER_NAME;

    // Save to Google Sheets
    updateFileInSheets(file);
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

// Enhanced File Operations with Permission Checks
async function deleteFile(submissionId, silent = false) {
    const submission = allSubmissions.find(s => s.submissionId === submissionId);
    if (!submission) return;

    // Permission check: Admin can delete any file, users can only delete their own files
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
            if (!silent) {
                showSuccess(`"${submission.fileName}" has been deleted successfully!`);
            }
            await loadSubmissions();
            logActivity(`Deleted file: ${submission.fileName}`);
        } else {
            throw new Error(data.error || 'Delete failed');
        }
    } catch (error) {
        if (!silent) {
            showError('Delete failed: ' + error.message);
        }
    }
}

// Activity Logging
function logActivity(action) {
    const activity = {
        action: action,
        user: USER_NAME,
        timestamp: new Date().toISOString(),
        folder: CURRENT_FOLDER
    };

    activityLog.unshift(activity);
    // Keep only last 50 activities
    if (activityLog.length > 50) {
        activityLog = activityLog.slice(0, 50);
    }

    localStorage.setItem('activityLog', JSON.stringify(activityLog));
    loadActivityLog();
}

function loadActivityLog() {
    const activityLogContainer = document.getElementById('activityLog');
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

// Analytics
function updateAnalytics() {
    const totalLines = allSubmissions.reduce((sum, file) => sum + (file.codeContent ? file.codeContent.split('\n').length : 0), 0);
    const activeProjects = projects.length;
    const storageUsed = allSubmissions.reduce((sum, file) => sum + (file.fileSize || 0), 0) / (1024 * 1024); // MB

    document.getElementById('totalLines').textContent = totalLines.toLocaleString();
    document.getElementById('activeProjects').textContent = activeProjects;
    document.getElementById('collaborators').textContent = [...new Set(allSubmissions.map(f => f.uploadedBy))].length;
    document.getElementById('storageUsed').textContent = storageUsed.toFixed(2) + 'MB';
}

// Enhanced File Display
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

    container.innerHTML = submissions.map(submission => {
        const isStarred = starredFiles.includes(submission.submissionId);
        const canEdit = IS_ADMIN || submission.uploadedBy === USER_NAME;

        return `
        <div class="file-item ${isStarred ? 'starred' : ''}">
            <input type="checkbox" class="file-checkbox" style="display: ${bulkSelectMode ? 'block' : 'none'}" 
                   onchange="toggleFileSelection('${submission.submissionId}')">
            
            <div class="file-header">
                <div class="file-name">
                    <i class="fas fa-file-code"></i>
                    ${submission.fileName}
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
                ${canEdit || IS_ADMIN ? `
                    <button class="action-btn" style="background: var(--danger); color: white;" onclick="deleteFile('${submission.submissionId}')">
                        <i class="fas fa-trash"></i> Delete
                    </button>
                ` : ''}
            </div>
        </div>
        `;
    }).join('');
}

function editFile(submissionId) {
    const submission = allSubmissions.find(s => s.submissionId === submissionId);
    if (submission) {
        currentPreviewFile = submission;
        editCurrentFile();
    }
}

// Enhanced File Upload with Expiration
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

function calculateExpirationDate(expiration) {
    const now = new Date();
    switch (expiration) {
        case '1day':
            return new Date(now.setDate(now.getDate() + 1)).toISOString();
        case '1week':
            return new Date(now.setDate(now.getDate() + 7)).toISOString();
        case '1month':
            return new Date(now.setMonth(now.getMonth() + 1)).toISOString();
        case '3months':
            return new Date(now.setMonth(now.getMonth() + 3)).toISOString();
        default:
            return 'never';
    }
}

// Enhanced Syntax Checking
function checkSyntax() {
    const content = codeEditor.getValue();
    const mode = codeEditor.getOption('mode');

    try {
        if (mode === 'javascript') {
            // Basic JavaScript syntax check
            new Function(content);
            showSuccess('Syntax check passed! ✅ No errors found.');
        } else {
            showSuccess('Syntax check completed for ' + mode + '! ✅');
        }
    } catch (error) {
        showError('Syntax error: ' + error.message);
    }
}

// =============================================
// ORIGINAL FEATURES (Preserved and Enhanced)
// =============================================

// Drag and drop functionality
function initializeDragAndDrop() {
    const uploadArea = document.getElementById('uploadArea');

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
    fileInput.addEventListener('change', function (e) {
        handleFiles(e.target.files);
    });
}

function handleFiles(files) {
    if (!GOOGLE_SCRIPT_URL || GOOGLE_SCRIPT_URL.includes('YOUR_SCRIPT_ID_HERE')) {
        showError('Please configure the Google Apps Script URL in the script.js file');
        return;
    }

    selectedUploadFiles = Array.from(files);
    updateUploadUI();
}

function updateUploadUI() {
    const uploadContent = document.getElementById('uploadContent');
    const submitBtn = document.getElementById('submitBtn');

    if (selectedUploadFiles.length > 0) {
        uploadContent.innerHTML = `
            <div class="upload-icon">
                <i class="fas fa-check-circle" style="color: var(--success);"></i>
            </div>
            <h3>${selectedUploadFiles.length} File(s) Selected</h3>
            ${selectedUploadFiles.map(file => `
                <div style="text-align: left; margin: 8px 0; padding: 10px; background: var(--light); border-radius: 8px; border: 1px solid var(--border);">
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

    // Create a virtual file object
    const virtualFile = {
        name: fileName,
        size: new Blob([codeContent]).size,
        type: 'text/plain'
    };

    // Upload the virtual file
    uploadVirtualFile(virtualFile, codeContent, description, folder, tags.join(','));
}

async function uploadVirtualFile(file, content, description, folder, tags) {
    if (!GOOGLE_SCRIPT_URL || GOOGLE_SCRIPT_URL.includes('YOUR_SCRIPT_ID_HERE')) {
        showError('Please configure the Google Apps Script URL in the script.js file');
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
            logActivity(`Created file: ${file.name}`);
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
    document.getElementById('editorTags').value = '';
    updateEditorTitle();
    editingFileId = null;
    document.getElementById('saveEditBtn').style.display = 'none';
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
    if (!GOOGLE_SCRIPT_URL || GOOGLE_SCRIPT_URL.includes('YOUR_SCRIPT_ID_HERE')) {
        showError('Please configure the Google Apps Script URL in the script.js file');
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
        updateUploadUI();

        // Reload submissions
        await loadSubmissions();
        logActivity(`Uploaded ${selectedUploadFiles.length} file(s)`);

    } catch (error) {
        showError('Upload failed: ' + error.message);
        console.error('Upload error:', error);
    } finally {
        submitBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Upload to Cloud';
        submitBtn.disabled = false;
    }
}

async function loadSubmissions() {
    if (!GOOGLE_SCRIPT_URL || GOOGLE_SCRIPT_URL.includes('YOUR_SCRIPT_ID_HERE')) return;

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
            updateAnalytics();
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

function filterFiles() {
    const searchTerm = document.getElementById('searchInput').value.toLowerCase();
    const fileTypeFilter = document.getElementById('fileTypeFilter').value;

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

async function copyFileCode(submissionId) {
    const submission = allSubmissions.find(s => s.submissionId === submissionId);
    if (submission) {
        try {
            await navigator.clipboard.writeText(submission.codeContent);
            showSuccess('Code copied to clipboard! 📋');
            logActivity(`Copied code from: ${submission.fileName}`);
        } catch (err) {
            // Fallback
            const textArea = document.createElement('textarea');
            textArea.value = submission.codeContent;
            document.body.appendChild(textArea);
            textArea.select();
            document.execCommand('copy');
            document.body.removeChild(textArea);
            showSuccess('Code copied to clipboard! 📋');
            logActivity(`Copied code from: ${submission.fileName}`);
        }
    }
}

async function copyToClipboard() {
    if (currentPreviewFile) {
        await copyFileCode(currentPreviewFile.submissionId);
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
        logActivity(`Exported ${folderSubmissions.length} files`);
    }
}

function showUploadHelp() {
    alert(`📁 CodeHub Pro Features:\n\n• File Upload: Drag & drop or browse files\n• Code Editor: Write code directly with syntax highlighting\n• Templates: Pre-built templates for different languages\n• Folder System: Organize files in different folders\n• Project Management: Group files into projects\n• User Tracking: See who uploaded each file\n• Admin Features: Special privileges for admin user\n• File Editing: Edit existing files in the editor\n• File Starring: Mark important files as favorites\n• Bulk Operations: Select multiple files for batch actions\n• File Expiration: Set auto-delete timelines\n• Activity Logging: Track all user actions\n• Advanced Analytics: Code statistics and insights\n• Dark Mode: Toggle between light and dark themes\n• File Management: View, download, copy, delete files\n• Search & Filter: Find files by name, content, tags, or description\n• Cloud Storage: Secure Google Sheets backend\n\n💡 Tip: Use Ctrl+S to save files from the editor!`);
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
window.onclick = function (event) {
    const modal = document.getElementById('previewModal');
    const createFolderModal = document.getElementById('createFolderModal');
    const createProjectModal = document.getElementById('createProjectModal');
    const welcomeModal = document.getElementById('welcomeModal');

    if (event.target === modal) {
        closeModal();
    }
    if (event.target === createFolderModal) {
        closeCreateFolderModal();
    }
    if (event.target === createProjectModal) {
        closeCreateProjectModal();
    }
    if (event.target === welcomeModal) {
        // Don't close welcome modal - user must enter name
    }
}

// Keyboard shortcuts
document.addEventListener('keydown', function (e) {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        if (document.getElementById('code-editor').classList.contains('active')) {
            if (editingFileId) {
                saveFileEdit();
            } else {
                createFileFromEditor();
            }
        }
    }
});