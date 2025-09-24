// profile.js
import { getProfile, updateProfile, logout, uploadProfilePictureToImageKit, getUniversities, getPrograms, insertProgram } from '/src/js/supabase.js';
import { getCurrentUser, getAvatarUrl } from '/src/js/supabase.js';
import { supabase } from '/src/js/supabase.js';
import { getDocuments, deleteDocument } from '/src/js/supabase2.js';
import { getContributorAnalytics, getContributorBadges, getContributorUploadsByCourse, getCourseNames, getContributorProgression, computeMostViewedAndDownloaded, getTopContributors } from '/src/js/supabase3.js';
import { timeWindows } from '/src/js/config.js';
import { loadChartJs, renderLine, renderPie, renderTrendBadge } from '/src/js/charts.js';
import { getTimeWindowStart } from '/src/js/config.js';

// DOM Elements for Advanced Profile Page
const profileForm = document.getElementById('profile-form');
const saveBtn = document.getElementById('saveBtn');
const logoutBtn = document.getElementById('logoutBtn');
const submitLoading = document.getElementById('submitLoading');
const alertSuccess = document.getElementById('alertSuccess');
const alertError = document.getElementById('alertError');
const errorText = document.getElementById('errorText');
const reminderBanner = document.getElementById('reminderBanner');
const reminderText = document.getElementById('reminderText');
const avatarImage = document.getElementById('avatar');
const avatarUpload = document.getElementById('avatarUpload');
const customProgramContainer = document.getElementById('customProgramContainer');
const customProgramInput = document.getElementById('customProgramInput');

// Profile Header Elements
const displayName = document.getElementById('display-name');
const displayEmail = document.getElementById('display-email');
const messageEl = document.getElementById('message');

// Analytics Elements
const statTotal = document.getElementById('stat-total');
const statViews = document.getElementById('stat-views');
const statTypes = document.getElementById('stat-types');
const statDownloads = document.getElementById('stat-downloads');
const badgesEl = document.getElementById('badges');
const mostViewedEl = document.getElementById('most-viewed');
const mostDownloadedEl = document.getElementById('most-downloaded');
const progressionEl = document.getElementById('progression');
const chartViewsEl = document.getElementById('chart-views');
const chartCoursesEl = document.getElementById('chart-courses');
const timeWindowSelect = document.getElementById('contrib-time-window');
const topContribList = document.getElementById('top-contrib-list');

// Uploads Elements
const grid = document.getElementById('uploads-grid');
const refreshBtn = document.getElementById('refresh-btn');
const prevBtn = document.getElementById('prev-page');
const nextBtn = document.getElementById('next-page');
const pageInfo = document.getElementById('page-info');

// Form fields
const fullNameInput = document.getElementById('fullName');
const emailInput = document.getElementById('email');
const universitySelect = document.getElementById('university');
const programSelect = document.getElementById('program');
const editProfileBtn = document.getElementById('edit-profile-btn');
const profileEditForm = document.getElementById('profile-edit-form');
const cancelEditBtn = document.getElementById('cancel-edit-btn');

// Track reminder display
const PROFILE_REMINDER_KEY = 'profileReminderShown';
const REMINDER_FREQUENCY = 3;

// Store current profile data
let currentProfile = null;
let currentUser = null;
let avatarFile = null;
let chartViews, chartCourses;

// Pagination
const PAGE_SIZE = 12;
let currentPage = 1;

// Utility Functions
const showMessage = (text, type = 'error') => {
    if (messageEl) {
        messageEl.className = `message ${type}`;
        messageEl.innerHTML = `<i class="fas fa-${type === 'success' ? 'check-circle' : 'exclamation-circle'}"></i> ${text}`;
        messageEl.style.display = 'block';
        setTimeout(() => { messageEl.style.display = 'none'; }, 5000);
    }
};

// ==============================
// Personal Trend Badges
// ==============================
async function loadPersonalTrends() {
    try {
        if (!currentUser) return;
        const windowKey = timeWindowSelect?.value || 'all';
        const start = getTimeWindowStart(windowKey);
        const end = new Date();
        if (!start) { // no trend for 'all'
            renderTrendBadge(document.getElementById('stat-total-trend'), null);
            renderTrendBadge(document.getElementById('stat-views-trend'), null);
            renderTrendBadge(document.getElementById('stat-downloads-trend'), null);
            return;
        }
        const duration = end.getTime() - start.getTime();
        const prevEnd = start;
        const prevStart = new Date(start.getTime() - duration);

        // Fetch current period docs for user
        const { data: currDocs, error: currErr } = await supabase
            .from('projects')
            .select('id, views, download_count, created_at')
            .eq('contributor_id', currentUser.id)
            .gte('created_at', start.toISOString())
            .lt('created_at', end.toISOString());
        if (currErr) throw currErr;

        // Fetch previous period docs for user
        const { data: prevDocs, error: prevErr } = await supabase
            .from('projects')
            .select('id, views, download_count, created_at')
            .eq('contributor_id', currentUser.id)
            .gte('created_at', prevStart.toISOString())
            .lt('created_at', prevEnd.toISOString());
        if (prevErr) throw prevErr;

        const sum = (arr, key) => (arr||[]).reduce((a,b)=> a + (Number(b[key]||0)), 0);
        const currUploads = (currDocs||[]).length;
        const prevUploads = (prevDocs||[]).length;
        const currViews = sum(currDocs, 'views');
        const prevViews = sum(prevDocs, 'views');
        const currDownloads = sum(currDocs, 'download_count');
        const prevDownloads = sum(prevDocs, 'download_count');

        const pct = (curr, prev) => (prev === 0 ? (curr > 0 ? 100 : 0) : ((curr - prev) / prev) * 100);

        renderTrendBadge(document.getElementById('stat-total-trend'), Number(pct(currUploads, prevUploads).toFixed(2)));
        renderTrendBadge(document.getElementById('stat-views-trend'), Number(pct(currViews, prevViews).toFixed(2)));
        renderTrendBadge(document.getElementById('stat-downloads-trend'), Number(pct(currDownloads, prevDownloads).toFixed(2)));
    } catch (e) {
        // Fail silently for trends
    }
}

const formatDate = (iso) => {
    try { return new Date(iso).toLocaleDateString(); } catch { return ''; }
};

const statusBadge = (status) => {
    const text = (status || 'pending').replace('_', ' ');
    return `<span class="badge ${status === 'approved' ? 'success' : status === 'rejected' ? 'error' : ''}">${text}</span>`;
};

// Form validation
function validateForm() {
    let isValid = true;
    const fullName = fullNameInput.value.trim();
    const university = universitySelect.value;
    const program = programSelect.value;
    const customProgram = programSelect.value === 'other' ? customProgramInput.value.trim() : null;

    // Reset error messages
    document.querySelectorAll('.error-message').forEach(el => {
        el.style.display = 'none';
    });

    // Validate full name
    if (!fullName) {
        document.getElementById('nameError').style.display = 'block';
        isValid = false;
    }

    // Validate university
    if (!university) {
        document.getElementById('universityError').style.display = 'block';
        isValid = false;
    }

    // Validate program
    if (!program) {
        document.getElementById('programError').style.display = 'block';
        isValid = false;
    }

    // Validate custom program if "Other" is selected
    if (program === 'other' && !customProgram) {
        document.getElementById('customProgramError').style.display = 'block';
        isValid = false;
    }

    return isValid;
}

// Check if profile is complete
function isProfileComplete(profile) {
    return profile &&
           profile.full_name &&
           profile.university_id &&
           profile.program_id;
}

// Show reminder banner if needed
function checkAndShowReminder(profile) {
    if (!reminderBanner) return;

    if (isProfileComplete(profile)) {
        reminderBanner.style.display = 'none';
        return;
    }

    // Check if we should show the reminder
    let reminderCount = parseInt(localStorage.getItem(PROFILE_REMINDER_KEY) || '0');
    reminderCount++;

    if (reminderCount % REMINDER_FREQUENCY === 0) {
        reminderBanner.style.display = 'flex';
        reminderText.textContent = 'Please complete your profile to unlock full contributor features.';
    }

    localStorage.setItem(PROFILE_REMINDER_KEY, reminderCount.toString());
}

// Add "Other" option to programs dropdown
function addOtherOptionToPrograms() {
    const otherOption = document.createElement('option');
    otherOption.value = 'other';
    otherOption.textContent = 'Other (please specify)';
    programSelect.appendChild(otherOption);
}

// Handle program selection change
function setupProgramSelectionHandler() {
    if (!programSelect) return;

    programSelect.addEventListener('change', () => {
        if (programSelect.value === 'other') {
            customProgramContainer.style.display = 'block';
            customProgramInput.setAttribute('required', 'true');
        } else {
            customProgramContainer.style.display = 'none';
            customProgramInput.removeAttribute('required');
        }
    });
}

// Load universities dropdown
async function loadUniversities() {
    try {
        const result = await getUniversities();

        if (result.success) {
            // Clear existing options
            universitySelect.innerHTML = '<option value="">Select your university</option>';

            // Add universities to dropdown
            result.data.forEach(university => {
                const option = document.createElement('option');
                option.value = university.id;
                option.textContent = university.name;
                universitySelect.appendChild(option);
            });

            // Set selected value if user has a university
            if (currentProfile && currentProfile.university_id) {
                universitySelect.value = currentProfile.university_id;
            }
        } else {
            console.error('Failed to load universities:', result.message);
            showMessage('Failed to load universities. Please refresh the page.', 'error');
        }
    } catch (error) {
        console.error('Error loading universities:', error);
        showMessage('An error occurred while loading universities.', 'error');
    }
}

// Load programs dropdown
async function loadPrograms() {
    try {
        const result = await getPrograms();

        if (result.success) {
            // Clear existing options
            programSelect.innerHTML = '<option value="">Select your program</option>';

            // Add programs to dropdown
            result.data.forEach(program => {
                const option = document.createElement('option');
                option.value = program.id;
                option.textContent = program.name;
                programSelect.appendChild(option);
            });

            // Add "Other" option
            addOtherOptionToPrograms();

            // Set selected value if user has a program
            if (currentProfile && currentProfile.program_id) {
                programSelect.value = currentProfile.program_id;
            }
        } else {
            console.error('Failed to load programs:', result.message);
            showMessage('Failed to load programs. Please refresh the page.', 'error');
        }
    } catch (error) {
        console.error('Error loading programs:', error);
        showMessage('An error occurred while loading programs.', 'error');
    }
}

// Handle avatar upload
function setupAvatarUploadHandler() {
    if (!avatarUpload) return;

    avatarUpload.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        // Validate file size (max 5MB)
        if (file.size > 5 * 1024 * 1024) {
            showMessage('File size must be less than 5MB', 'error');
            return;
        }

        // Validate file type
        if (!file.type.match('image.*')) {
            showMessage('Please select an image file', 'error');
            return;
        }

        // Store file for later upload
        avatarFile = file;

        // Preview image
        const reader = new FileReader();
        reader.onload = (e) => {
            avatarImage.src = e.target.result;
        };
        reader.readAsDataURL(file);
    });
}

// Uploads Management - Updated to use getDocuments from supabase2.js
const renderUploads = (docs) => {
    if (!grid) return;

    if (!docs || docs.length === 0) {
        grid.innerHTML = '<div class="empty-state"><i class="fas fa-file-upload"></i><p>You have not uploaded any documents yet.</p></div>';
        return;
    }

    grid.innerHTML = docs.map(d => {
        const gh = d.file_url && d.file_url.startsWith('https://github.com');
        const mg = d.file_url && d.file_url.includes('mega.nz');
        const links = `
            ${gh ? `<a href="${d.file_url}" target="_blank" rel="noopener" class="chip"><i class="fab fa-github"></i> GitHub</a>` : ''}
            ${mg ? `<a href="${d.file_url}" target="_blank" rel="noopener" class="chip"><i class="fas fa-cloud"></i> MEGA</a>` : ''}
            ${!gh && !mg && d.file_url ? `<a href="${d.file_url}" target="_blank" rel="noopener" class="chip"><i class="fas fa-link"></i> Link</a>` : ''}
        `;
        const licenseHtml = d.license ? `<span class="badge">${d.license}</span>` : '';
        return `
        <div class="list-item">
            <div>
                <div class="item-title">${d.title} ${statusBadge(d.status)}</div>
                <div class="item-sub">Views: ${d.views || 0} • Downloads: ${d.download_count || 0} • ${licenseHtml} • ${formatDate(d.created_at)}</div>
            </div>
            <div class="btn-group">
                ${links}
                <button class="btn danger btn-delete" data-id="${d.id}"><i class="fas fa-trash"></i> Delete</button>
            </div>
        </div>`;
    }).join('');

    // Add delete event listeners
    grid.querySelectorAll('.btn-delete').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const id = e.currentTarget.getAttribute('data-id');
            if (!id) return;
            const confirmed = window.confirm('Are you sure you want to delete this upload? This action cannot be undone.');
            if (!confirmed) return;
            e.currentTarget.disabled = true;
            const { data, error } = await deleteDocument(id);
            if (error) {
                showMessage(error.message || 'Failed to delete document');
                e.currentTarget.disabled = false;
                return;
            }
            showMessage('Document deleted successfully', 'success');
            await loadUploads();
        });
    });
};

const updatePagination = (receivedCount) => {
    if (!pageInfo || !prevBtn || !nextBtn) return;

    pageInfo.textContent = `Page ${currentPage}`;
    prevBtn.disabled = currentPage <= 1;
    nextBtn.disabled = receivedCount < PAGE_SIZE;
};

// Updated to use getDocuments with user_id filter
const loadUploads = async () => {
    if (!currentUser) return;

    try {
        const filters = {
            user_id: currentUser.id,
            is_public: true // Only show public documents
        };

        const options = {
            page: currentPage,
            pageSize: PAGE_SIZE,
            orderBy: 'created_at',
            orderDir: 'desc'
        };

        const { data, error } = await getDocuments(filters, options);

        if (error) {
            showMessage(error.message || 'Failed to load uploads');
            return;
        }

        renderUploads(data);
        updatePagination((data || []).length);

        // Update insights
        const md = computeMostViewedAndDownloaded(data || []);
        if (mostViewedEl) {
            mostViewedEl.textContent = md.mostViewed ?
                `Most viewed: ${md.mostViewed.title} (${md.mostViewed.views || 0} views)` :
                'Most viewed: -';
        }

        if (mostDownloadedEl) {
            mostDownloadedEl.textContent = md.mostDownloaded ?
                `Most downloaded: ${md.mostDownloaded.title} (${md.mostDownloaded.download_count || 0} downloads)` :
                'Most downloaded: -';
        }
    } catch (error) {
        console.error('Error loading uploads:', error);
        showMessage('Failed to load uploads', 'error');
    }
};

// Analytics and Charts
const loadAnalytics = async () => {
    if (!currentUser) return;

    try {
        const windowKey = timeWindowSelect?.value || 'all';
        const { data, error } = await getContributorAnalytics(currentUser.id, windowKey);
        if (error) {
            console.error('Error loading analytics:', error);
            return;
        }

        // Update stats
        if (statTotal) statTotal.textContent = data.totalUploads || 0;
        if (statViews) statViews.textContent = data.totalViews || 0;
        if (statDownloads) statDownloads.textContent = data.totalDownloads || 0;

        const breakdown = Object.entries(data.byType || {})
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3)
            .map(([k, v]) => `${k}: ${v}`)
            .join(', ') || '-';

        if (statTypes) statTypes.textContent = breakdown;

        // Update badges
        const badgeList = getContributorBadges(data);
        if (badgesEl) {
            badgesEl.innerHTML = badgeList.map(b => `<span class="badge">${b}</span>`).join('');
        }

        // Update progression
        const prog = getContributorProgression(data);
        const parts = [];
        if (prog.remainingUploads > 0) parts.push(`${prog.remainingUploads} uploads away from Top Contributor`);
        if (prog.remainingViews > 0) parts.push(`${prog.remainingViews} views away from Popular Contributor`);
        if (prog.remainingDiversity > 0) parts.push(`${prog.remainingDiversity} courses away from Diverse Contributor`);

        if (progressionEl) {
            progressionEl.textContent = parts.length ? parts.join(' • ') : 'All top badges achieved!';
        }

        // Load charts
        await loadChartJs();

        // Views over time chart
        if (chartViewsEl) {
            const labels = Object.keys(data.uploadsOverTime || {}).sort();
            const values = labels.map(k => data.uploadsOverTime[k]);
            if (chartViews) chartViews.destroy();
            chartViews = renderLine(chartViewsEl.getContext('2d'), labels, values, 'Uploads');
        }

        // Uploads by course chart
        if (chartCoursesEl) {
            const byCourseRes = await getContributorUploadsByCourse(currentUser.id, windowKey);
            if (!byCourseRes.error) {
                const ids = Object.keys(byCourseRes.data || {});
                const namesRes = await getCourseNames(ids);
                if (!namesRes.error) {
                    const labels = ids.map(id => namesRes.data[id] || id);
                    const values = ids.map(id => byCourseRes.data[id] || 0);
                    if (chartCourses) chartCourses.destroy();
                    chartCourses = renderPie(chartCoursesEl.getContext('2d'), labels, values);
                }
            }
        }
    } catch (error) {
        console.error('Error loading analytics:', error);
    }
};

// Profile Edit Functions
const toggleEditForm = () => {
    if (!profileEditForm || !editProfileBtn) return;

    const isVisible = profileEditForm.style.display === 'block';
    profileEditForm.style.display = isVisible ? 'none' : 'block';
    editProfileBtn.innerHTML = isVisible ?
        '<i class="fas fa-edit"></i> Edit Profile' :
        '<i class="fas fa-times"></i> Close Edit';
};

// Handle form submission
function setupFormSubmissionHandler() {
    if (!profileForm) return;

    profileForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        if (!validateForm()) return;

        // Show loading state
        if (saveBtn) {
            saveBtn.disabled = true;
            submitLoading.style.display = 'inline-block';
        }

        if (alertError) alertError.style.display = 'none';

        const fullName = fullNameInput.value.trim();
        const universityId = universitySelect.value;
        let programId = programSelect.value;
        const customProgram = programSelect.value === 'other' ? customProgramInput.value.trim() : null;

        try {
            // Handle custom program if selected
            if (programSelect.value === 'other' && customProgram) {
                console.log('➕ Adding new program:', customProgram);
                const programResult = await insertProgram(customProgram);

                if (programResult.success) {
                    programId = programResult.programId;
                    console.log('✅ New program added with ID:', programId);
                } else {
                    throw new Error(programResult.message);
                }
            }

            // First upload avatar if selected
            let profilePictureUrl = currentProfile?.profile_picture;
            if (avatarFile) {
                console.log('📤 Uploading profile picture...');
                const uploadResult = await uploadProfilePictureToImageKit(avatarFile);

                if (uploadResult.success) {
                    profilePictureUrl = uploadResult.url;
                    console.log('✅ Profile picture uploaded:', profilePictureUrl);
                } else {
                    console.log('❌ Profile picture upload failed:', uploadResult.message);
                    // Continue with profile update even if avatar upload fails
                }
            }

            // Update profile
            console.log('💾 Saving profile...');
            const updateData = {
                full_name: fullName,
                university_id: universityId,
                program_id: programId
            };

            // Only include profile_picture if we have a new URL
            if (profilePictureUrl) {
                updateData.profile_picture = profilePictureUrl;
            }

            const result = await updateProfile(updateData);

            if (result.success) {
                console.log('✅ Profile updated');
                currentProfile = result.profile;

                // Update profile header
                if (displayName) displayName.textContent = result.profile.full_name || 'My Profile';
                if (avatarImage && result.profile.profile_picture) {
                    avatarImage.src = result.profile.profile_picture;
                }

                // Clear avatar file
                avatarFile = null;

                // Show success message
                showMessage('Profile updated successfully', 'success');

                // Hide reminder banner if profile is now complete
                if (isProfileComplete(result.profile)) {
                    if (reminderBanner) reminderBanner.style.display = 'none';
                }

                // Close edit form
                toggleEditForm();
            } else {
                console.log('❌ Profile update failed:', result.message);
                showMessage(result.message, 'error');
            }
        } catch (error) {
            console.error('💥 Unexpected error updating profile:', error);
            showMessage(error.message || 'Failed to update profile. Please try again.', 'error');
        } finally {
            // Reset loading state
            if (saveBtn) {
                saveBtn.disabled = false;
                submitLoading.style.display = 'none';
            }
        }
    });
}

// Handle logout
function setupLogoutHandler() {
    if (!logoutBtn) return;

    logoutBtn.addEventListener('click', async () => {
        try {
            const result = await logout();

            if (result.success) {
                // Clear any stored profile data
                localStorage.removeItem('userProfile');
                localStorage.removeItem(PROFILE_REMINDER_KEY);

                // Redirect to login page
                window.location.href = 'login.html';
            } else {
                showMessage(result.message, 'error');
            }
        } catch (error) {
            console.error('💥 Logout error:', error);
            showMessage('Failed to logout. Please try again.', 'error');
        }
    });
}

// Load profile data
async function loadProfile() {
    console.log('👤 Fetching profile...');

    try {
        const userRes = await getCurrentUser();
        if (!userRes.success) {
            window.location.href = '/login.html';
            return;
        }

        currentUser = userRes.user;

        const result = await getProfile();

        if (result.success) {
            console.log('✅ Profile loaded', result.profile);
            currentProfile = result.profile;

            // Update profile header
            if (displayName) displayName.textContent = result.profile.full_name || 'My Profile';
            if (displayEmail) displayEmail.textContent = result.profile.email || '';

            if (avatarImage) {
                const avatarUrl = getAvatarUrl(result.profile);
                avatarImage.src = avatarUrl;
            }

            // Populate form fields
            if (fullNameInput) fullNameInput.value = result.profile.full_name || '';
            if (emailInput) emailInput.value = result.profile.email || '';

            // Load dropdowns
            await loadUniversities();
            await loadPrograms();

            // Load analytics and uploads
            await loadAnalytics();
            await loadPersonalTrends();
            await loadUploads();

            // Check if we need to show the reminder banner
            checkAndShowReminder(result.profile);
        } else {
            console.log('❌ Failed to load profile:', result.message);
            showMessage(result.message, 'error');
        }
    } catch (error) {
        console.error('💥 Unexpected error loading profile:', error);
        showMessage('Failed to load profile. Please try again.', 'error');
    }
}

// Pagination handlers
function setupPaginationHandlers() {
    if (prevBtn) {
        prevBtn.addEventListener('click', () => {
            if (currentPage > 1) {
                currentPage -= 1;
                loadUploads();
            }
        });
    }

    if (nextBtn) {
        nextBtn.addEventListener('click', () => {
            currentPage += 1;
            loadUploads();
        });
    }

    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => {
            loadUploads();
            showMessage('Uploads refreshed', 'success');
        });
    }
}

// Edit profile button handler
function setupEditProfileHandler() {
    if (editProfileBtn) {
        editProfileBtn.addEventListener('click', toggleEditForm);
    }

    if (cancelEditBtn) {
        cancelEditBtn.addEventListener('click', toggleEditForm);
    }
}

// ==============================
// Top Contributors This Week Widget
// ==============================
async function loadTopContributorsWidget() {
    if (!topContribList) return;
    try {
        // Loading state
        topContribList.innerHTML = '<div class="empty-state">Loading…</div>';

        const { data, error } = await getTopContributors(5, '7d');
        if (error) {
            topContribList.innerHTML = '<div class="empty-state">Failed to load</div>';
            return;
        }
        const rows = data || [];

        // Resolve display names for users
        const ids = rows.map(r => r.id).filter(Boolean);
        const nameMap = {};
        if (ids.length > 0) {
            const { data: users, error: uErr } = await supabase
                .from('users')
                .select('id, full_name, email')
                .in('id', ids);
            if (!uErr && Array.isArray(users)) {
                users.forEach(u => { nameMap[u.id] = u.full_name || u.email || u.id; });
            }
        }

        // Render
        if (rows.length === 0) {
            topContribList.innerHTML = '<div class="empty-state">No data for this week yet.</div>';
            return;
        }

        topContribList.innerHTML = rows.map((r, idx) => `
            <div class="list-item">
                <div>
                    <div class="item-title">#${idx + 1} ${nameMap[r.id] || r.id}</div>
                    <div class="item-sub">Uploads: ${r.uploads || 0} • Views: ${r.views || 0} • Downloads: ${r.downloads || 0}</div>
                </div>
            </div>
        `).join('');
    } catch (e) {
        console.error('loadTopContributorsWidget error', e);
        topContribList.innerHTML = '<div class="empty-state">Failed to load</div>';
    }
}

// Initialize the page
function initProfilePage() {
    // Set up event handlers
    setupProgramSelectionHandler();
    setupAvatarUploadHandler();
    setupFormSubmissionHandler();
    setupLogoutHandler();
    setupPaginationHandlers();
    setupEditProfileHandler();

    // Load profile data
    loadProfile();

    // Load sidebar leaderboard widget
    loadTopContributorsWidget();

    // Time window change
    timeWindowSelect?.addEventListener('change', () => { loadAnalytics(); loadPersonalTrends(); });
}

// Start when DOM is loaded
document.addEventListener('DOMContentLoaded', initProfilePage);