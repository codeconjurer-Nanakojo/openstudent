
        import { getPrograms, getProfile, signOut, getCurrentUser } from '/src/js/supabase.js';
        import { getCourses, getDocuments, countDocuments, updateDocumentStatus, deleteDocument, listPrograms, createProgram, updateProgram, deleteProgram, insertCourse, updateCourse, deleteCourse, listUniversities, insertUniversity, updateUniversity, deleteUniversity } from '/src/js/supabase2.js';
        import { getAdminAnalytics, getAllUsers, updateUserRole, updateUserActive, getAllProjects, getProjectStatusCounts, getUploadsPerProgram, getUserByEmail, getModerationHistory, logModerationAction, getAllCoursesMinimal, countProjects, getTopContributors, getTopProjects, getMetricTrend, getRisingContributors, getTrendingProjects } from '/src/js/supabase3.js';
        import { timeWindows, getSemesterRange } from '/src/js/config.js';
        import { getUniversities } from '/src/js/supabase.js';
        import { loadChartJs, renderPie, renderBar, renderTrendBadge } from '/src/js/charts.js';

        const programSelect = document.getElementById('program-select');
        const courseSelect = document.getElementById('course-select');
        const statusSelect = document.getElementById('status-select');
        const typeSelect = document.getElementById('type-select');
        const searchInput = document.getElementById('search-input');
        const applyBtn = document.getElementById('apply-filters');
        const resetBtn = document.getElementById('reset-filters');
        const grid = document.getElementById('documents-grid');
        const pageInfo = document.getElementById('page-info');
        const prevBtn = document.getElementById('prev-page');
        const nextBtn = document.getElementById('next-page');
        const messageEl = document.getElementById('message');
        const uTotal = document.getElementById('u-total');
        const uActive = document.getElementById('u-active');
        const uSuspended = document.getElementById('u-suspended');
        const dTotal = document.getElementById('d-total');
        const dApproved = document.getElementById('d-approved');
        const dPending = document.getElementById('d-pending');
        const dRejected = document.getElementById('d-rejected');
        const usersPanel = document.getElementById('users-panel');
        const usersList = document.getElementById('users-list');
        const refreshUsers = document.getElementById('refresh-users');
        const tabDocs = document.getElementById('tab-docs');
        const tabUsers = document.getElementById('tab-users');
        const tabProjects = document.getElementById('tab-projects');
        const tabLeaderboards = document.getElementById('tab-leaderboards');
        const projectsPanel = document.getElementById('projects-panel');
        const projectsList = document.getElementById('projects-list');
        const refreshProjects = document.getElementById('refresh-projects');
        const projStatus = document.getElementById('proj-status');
        const projContributor = document.getElementById('proj-contributor');
        const projCourse = document.getElementById('proj-course');
        const projUniversity = document.getElementById('proj-university');
        const exportCsv = document.getElementById('export-csv');
        const exportJson = document.getElementById('export-json');
        const historyBackdrop = document.getElementById('history-backdrop');
        const historyClose = document.getElementById('history-close');
        const historyContent = document.getElementById('history-content');
        const chartStatusEl = document.getElementById('chart-status');
        const chartProgramsEl = document.getElementById('chart-programs');
        const timeWindowSelect = document.getElementById('time-window');
        let chartStatus, chartPrograms;
        const navLogout = document.getElementById('nav-logout');
        const lbPanel = document.getElementById('leaderboards-panel');
        const lbWindow = document.getElementById('lb-window');
        const adminWindowLabel = document.getElementById('admin-window-label');
        const lbWindowLabel = document.getElementById('lb-window-label');

        const setWindowLabel = (el, key) => {
            if (!el) return;
            if (key === 'semester') { el.textContent = getSemesterRange().label; return; }
            if (key === 'all') { el.textContent = 'All time'; return; }
            el.textContent = timeWindows[key]?.label || '';
        };
        const lbContrib = document.getElementById('lb-contributors');
        const lbProjects = document.getElementById('lb-projects');
        const lbExportCsv = document.getElementById('lb-export-csv');
        const lbExportJson = document.getElementById('lb-export-json');
        const lbExportTrendsCsv = document.getElementById('lb-export-trends-csv');
        const lbExportSignalsJson = document.getElementById('lb-export-signals-json');
        const lbRisingContrib = document.getElementById('lb-rising-contributors');
        const lbTrendingProjects = document.getElementById('lb-trending-projects');

        const PAGE_SIZE = 12;
        let currentPage = 1;
        let totalCount = 0;
        const PROJ_PAGE_SIZE = 20;
        let projCurrentPage = 1;
        let projTotalCount = 0;
        // Admin or Superadmin guard and UI role flags
        let CURRENT_ROLE = null;
        let IS_SUPERADMIN = false;
        (async () => {
            const res = await getProfile();
            const role = res?.profile?.role;
            const active = res?.profile?.active;
            CURRENT_ROLE = role;
            IS_SUPERADMIN = role === 'superadmin';
            // Only allow admin/superadmin and active accounts
            if ((role !== 'admin' && role !== 'superadmin') || active === false) {
                window.location.href = '/profile.html';
                return;
            }
            // Toggle Superadmin tools section
            const saTools = document.getElementById('superadmin-tools');
            if (saTools) saTools.style.display = IS_SUPERADMIN ? 'block' : 'none';
        })();


        const showMessage = (text, type = 'error') => {
            messageEl.className = `message ${type}`;
            messageEl.innerHTML = `<i class=\"fas fa-${type === 'success' ? 'check-circle' : 'exclamation-circle'}\"></i> ${text}`;
            messageEl.style.display = 'block';
            setTimeout(() => { messageEl.style.display = 'none'; }, 5000);
        };

        const formatDate = (iso) => {
            try { return new Date(iso).toLocaleDateString(); } catch { return ''; }
        };
        const isGitHub = (url) => typeof url === 'string' && url.startsWith('https://github.com');
        const isMega = (url) => typeof url === 'string' && url.includes('mega.nz');
        const placeholderImage = 'https://via.placeholder.com/600x360.png?text=OpenStudent';

        const statusBadge = (status) => {
            const text = (status || 'pending').replace('_', ' ');
            return `<span class=\"badge ${status === 'approved' ? 'success' : status === 'rejected' ? 'error' : ''}\">${text}</span>`;
        };

        const renderCards = (docs, filterType) => {
            let items = docs || [];
            if (filterType) items = items.filter(d => Array.isArray(d.tags) && d.tags.includes(filterType));
            if (items.length === 0) {
                grid.innerHTML = '<div class="empty-state">No documents found.</div>';
                return;
            }
            grid.innerHTML = items.map(d => {
                const img = d.image_url || placeholderImage;
                const gh = isGitHub(d.file_url);
                const mg = isMega(d.file_url);
                const links = `
                    ${gh ? `<a href="${d.file_url}" target="_blank" rel="noopener" class="chip"><i class=\"fab fa-github\"></i> GitHub</a>` : ''}
                    ${mg ? `<a href="${d.file_url}" target="_blank" rel="noopener" class="chip"><i class=\"fas fa-cloud\"></i> MEGA</a>` : ''}
                    ${!gh && !mg && d.file_url ? `<a href="${d.file_url}" target="_blank" rel="noopener" class="chip"><i class=\"fas fa-link\"></i> Link</a>` : ''}
                `;
                const actions = `
                    <div class=\"btn-group\">
                        <button class=\"btn ${d.status === 'approved' ? '' : 'primary'} btn-approve\" data-id=\"${d.id}\"><i class=\"fas fa-check\"></i> Approve</button>
                        <button class=\"btn ${d.status === 'rejected' ? '' : 'warning'} btn-reject\" data-id=\"${d.id}\"><i class=\"fas fa-xmark\"></i> Reject</button>
                        <button class=\"btn danger btn-delete\" data-id=\"${d.id}\"><i class=\"fas fa-trash\"></i> Delete</button>
                    </div>`;
                return `
                <div class=\"card\">
                    <div class=\"card-media\">
                        <img src=\"${img}\" alt=\"Cover\" loading=\"lazy\" />
                        <div class=\"card-badge\">${statusBadge(d.status)}</div>
                    </div>
                    <div class=\"card-body\">
                        <h3 class=\"card-title\">${d.title}</h3>
                        <p class=\"card-desc\">${(d.description || '').slice(0, 140)}${(d.description || '').length > 140 ? '…' : ''}</p>
                        <div class=\"card-meta\">
                            <span><i class=\"fas fa-calendar\"></i> ${formatDate(d.created_at)}</span>
                            <span><i class=\"fas fa-user\"></i> ${d.contributor_id}</span>
                        </div>
                        <div class=\"card-actions\">${links}</div>
                        ${actions}
                    </div>
                </div>`;
            }).join('');

            // Bind moderation handlers
            grid.querySelectorAll('.btn-approve').forEach(btn => btn.addEventListener('click', () => handleStatus(btn, 'approved')));
            grid.querySelectorAll('.btn-reject').forEach(btn => btn.addEventListener('click', () => handleStatus(btn, 'rejected')));
            grid.querySelectorAll('.btn-delete').forEach(btn => btn.addEventListener('click', () => handleDelete(btn)));
        };

        const handleStatus = async (btn, status) => {
            const id = btn.getAttribute('data-id');
            btn.disabled = true; btn.textContent = status === 'approved' ? 'Approving…' : 'Rejecting…';
            const { error } = await updateDocumentStatus(id, status);
            if (error) showMessage(error.message || 'Failed to update status');
            else showMessage(`Marked as ${status}`, 'success');
            await loadDocuments();
        };

        const handleDelete = async (btn) => {
            const id = btn.getAttribute('data-id');
            const confirmed = window.confirm('Delete this document? This cannot be undone.');
            if (!confirmed) return;
            btn.disabled = true; btn.textContent = 'Deleting…';
            const { error } = await deleteDocument(id);
            if (error) showMessage(error.message || 'Failed to delete');
            else showMessage('Deleted', 'success');
            await loadDocuments();
        };

        const setLoading = (loading) => {
            applyBtn.disabled = loading; resetBtn.disabled = loading;
            programSelect.disabled = loading; courseSelect.disabled = loading || !programSelect.value;
            statusSelect.disabled = loading; typeSelect.disabled = loading; searchInput.disabled = loading;
        };

        const loadPrograms = async () => {
            const res = await getPrograms();
            if (!res.success) { showMessage(res.message || 'Failed to load programs'); return; }
            programSelect.innerHTML = '<option value="">All programs</option>';
            res.data.forEach(p => { const o = document.createElement('option'); o.value = p.id; o.textContent = p.name; programSelect.appendChild(o); });
        };

        const loadCourses = async (programId) => {
            courseSelect.disabled = true; courseSelect.innerHTML = '<option value="">All courses</option>';
            if (!programId) return;
            const { data, error } = await getCourses(programId, { limit: 500, offset: 0 });
            if (error) { showMessage(error.message || 'Failed to load courses'); return; }
            courseSelect.disabled = false;
            data.forEach(c => { const o = document.createElement('option'); o.value = c.id; o.textContent = `${c.code} - ${c.name}`; courseSelect.appendChild(o); });
        };

        const getFilterState = () => ({
            program_id: programSelect.value || undefined,
            course_id: courseSelect.value || undefined,
            status: statusSelect.value || undefined,
            is_public: undefined,
            search: searchInput.value.trim() || undefined,
            type: typeSelect.value || ''
        });

        const updatePagination = () => {
            const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
            pageInfo.textContent = `Page ${currentPage} of ${totalPages}`;
            prevBtn.disabled = currentPage <= 1;
            nextBtn.disabled = currentPage >= totalPages;
        };

        const refreshCount = async (filters) => {
            const { data, error } = await countDocuments({
                program_id: filters.program_id,
                course_id: filters.course_id,
                status: filters.status,
                search: filters.search
            });
            if (!error && typeof data === 'number') totalCount = data;
            updatePagination();
        };

        const loadDocuments = async () => {
            try {
                setLoading(true);
                const filters = getFilterState();
                const { data, error } = await getDocuments({
                    program_id: filters.program_id,
                    course_id: filters.course_id,
                    status: filters.status,
                    search: filters.search
                }, { page: currentPage, pageSize: PAGE_SIZE, orderBy: 'created_at', orderDir: 'desc' });
                if (error) { showMessage(error.message || 'Failed to load documents'); return; }
                renderCards(data, filters.type);
                await refreshCount(filters);
                await loadAdminAnalytics();
            } finally {
                setLoading(false);
            }
        };

        const loadAdminAnalytics = async () => {
            const { data, error } = await getAdminAnalytics();
            if (error || !data) return;
            uTotal.textContent = data.users.totalUsers;
            uActive.textContent = data.users.activeUsers;
            uSuspended.textContent = data.users.suspendedUsers;
            dTotal.textContent = data.documents.totalDocs;
            dApproved.textContent = data.documents.statusCounts.approved || 0;
            dPending.textContent = data.documents.statusCounts.pending || 0;
            dRejected.textContent = data.documents.statusCounts.rejected || 0;
            await renderAnalyticsCharts();
        };

        const renderAnalyticsCharts = async () => {
            await loadChartJs();
            const windowKey = timeWindowSelect?.value || 'all';
            setWindowLabel(adminWindowLabel, windowKey);
            const [statusRes, perProgRes] = await Promise.all([getProjectStatusCounts(windowKey), getUploadsPerProgram(windowKey)]);
            if (!statusRes.error && chartStatusEl) {
                const labels = ['Approved','Pending','Rejected'];
                const values = [statusRes.data.approved||0, statusRes.data.pending||0, statusRes.data.rejected||0];
                if (chartStatus) chartStatus.destroy();
                chartStatus = renderPie(chartStatusEl.getContext('2d'), labels, values);
            }
            if (!perProgRes.error && chartProgramsEl) {
                const labels = Object.keys(perProgRes.data||{});
                const values = Object.values(perProgRes.data||{});
                if (chartPrograms) chartPrograms.destroy();
                chartPrograms = renderBar(chartProgramsEl.getContext('2d'), labels, values, 'Uploads');
            }

            // Trend badges for uploads/views/downloads
            try {
                const [tUploads, tViews, tDownloads] = await Promise.all([
                    getMetricTrend('uploads', windowKey),
                    getMetricTrend('views', windowKey),
                    getMetricTrend('downloads', windowKey)
                ]);
                const elUploadsVal = document.getElementById('d-total');
                const elUploadsTrend = document.getElementById('d-total-trend-badge');
                const elViewsVal = document.getElementById('d-views');
                const elViewsTrend = document.getElementById('d-views-trend-badge');
                const elDownVal = document.getElementById('d-downloads');
                const elDownTrend = document.getElementById('d-downloads-trend-badge');
                if (!tUploads.error && tUploads.data && elUploadsTrend) renderTrendBadge(elUploadsTrend, tUploads.data.pct_change);
                if (!tViews.error && tViews.data) {
                    if (elViewsVal) elViewsVal.textContent = String(Math.round(Number(tViews.data.current_value||0)));
                    if (elViewsTrend) renderTrendBadge(elViewsTrend, tViews.data.pct_change);
                }
                if (!tDownloads.error && tDownloads.data) {
                    if (elDownVal) elDownVal.textContent = String(Math.round(Number(tDownloads.data.current_value||0)));
                    if (elDownTrend) renderTrendBadge(elDownTrend, tDownloads.data.pct_change);
                }
            } catch (e) { /* ignore */ }
        };

        const renderUsers = (rows) => {
            if (!rows || rows.length === 0) {
                usersList.innerHTML = '<div class="empty-state">No users found.</div>';
                return;
            }
            usersList.innerHTML = rows.map(u => `
                <div class="list-item">
                    <div>
                        <div class="item-title">${u.full_name || u.email}</div>
                        <div class="item-sub">${u.email} • Role: ${u.role || 'user'} • Active: ${u.active ? 'Yes' : 'No'} • Onboarding: ${u.onboarding_complete ? 'Yes' : 'No'}</div>
                    </div>
                    <div class="btn-group">
                        ${IS_SUPERADMIN ? `
                        <select class="btn" data-action="role" data-id="${u.id}">
                            <option value="user" ${u.role==='user'?'selected':''}>User</option>
                            <option value="contributor" ${u.role==='contributor'?'selected':''}>Contributor</option>
                            <option value="admin" ${u.role==='admin'?'selected':''}>Admin</option>
                            <option value="superadmin" ${u.role==='superadmin'?'selected':''}>Superadmin</option>
                        </select>` : ''}
                        <button class="btn ${u.active? 'warning' : 'primary'}" data-action="active" data-id="${u.id}">${u.active? 'Suspend' : 'Activate'}</button>
                        <button class="btn" data-action="view-projects" data-id="${u.id}">View Projects</button>
                    </div>
                </div>
            `).join('');

            if (IS_SUPERADMIN) {
                usersList.querySelectorAll('select[data-action="role"]').forEach(sel => {
                    sel.addEventListener('change', async () => {
                        const id = sel.getAttribute('data-id');
                        const role = sel.value;
                        const { error } = await updateUserRole(id, role);
                        if (error) showMessage(error.message || 'Failed to update role'); else showMessage('Role updated', 'success');
                    });
                });
            }

            usersList.querySelectorAll('button[data-action="active"]').forEach(btn => {
                btn.addEventListener('click', async () => {
                    const id = btn.getAttribute('data-id');
                    const active = btn.textContent.includes('Activate');
                    const { error } = await updateUserActive(id, active);
                    if (error) showMessage(error.message || 'Failed to update status'); else { showMessage('User status updated', 'success'); loadUsers(); }
                });
            });

            usersList.querySelectorAll('button[data-action="view-projects"]').forEach(btn => {
                btn.addEventListener('click', () => {
                    // Switch to documents tab and set search to user ID for admin analysis (uses search by contributor_id via filters soon)
                    tabDocs.click();
                    // Minimal: just show a message; deeper linking can be added when contributor filter is available.
                    showMessage('Use course/program/status filters to narrow to this user\'s projects.', 'success');
                });
            });
        };

        const loadUsers = async () => {
            const { data, error } = await getAllUsers();
            if (error) { showMessage(error.message || 'Failed to load users'); return; }
            renderUsers(data);
        };

        const renderProjects = (rows) => {
            if (!rows || rows.length === 0) {
                projectsList.innerHTML = '<div class="empty-state">No projects found.</div>';
                return;
            }
            projectsList.innerHTML = rows.map(p => `
                <div class="list-item">
                    <div>
                        <div class="item-title">${p.title}</div>
                        <div class="item-sub">By: ${p.contributor_id} • Status: ${p.status} • Views: ${p.views || 0} • License: ${p.license || ''} • ${new Date(p.created_at).toLocaleDateString()}</div>
                    </div>
                    <div class="btn-group">
                        <button class="btn primary" data-action="approve" data-id="${p.id}"><i class="fas fa-check"></i></button>
                        <button class="btn warning" data-action="reject" data-id="${p.id}"><i class="fas fa-xmark"></i></button>
                        <button class="btn" data-action="history" data-id="${p.id}"><i class="fas fa-clock"></i></button>
                    </div>
                </div>
            `).join('');

            projectsList.querySelectorAll('button[data-action="approve"]').forEach(btn => btn.addEventListener('click', async () => {
                const id = btn.getAttribute('data-id');
                const { error } = await updateDocumentStatus(id, 'approved');
                if (error) showMessage(error.message || 'Failed'); else { await logModerationAction(id, 'approved'); showMessage('Approved', 'success'); loadProjects(); }
            }));
            projectsList.querySelectorAll('button[data-action="reject"]').forEach(btn => btn.addEventListener('click', async () => {
                const id = btn.getAttribute('data-id');
                const { error } = await updateDocumentStatus(id, 'rejected');
                if (error) showMessage(error.message || 'Failed'); else { await logModerationAction(id, 'rejected'); showMessage('Rejected', 'success'); loadProjects(); }
            }));
            projectsList.querySelectorAll('button[data-action="history"]').forEach(btn => btn.addEventListener('click', async () => {
                const id = btn.getAttribute('data-id');
                historyBackdrop.style.display = 'flex';
                const { data, error } = await getModerationHistory(id);
                if (error) { historyContent.innerHTML = 'Failed to load history'; return; }
                historyContent.innerHTML = (data||[]).map(h => `<div class=\"list-item\"><div class=\"item-sub\">${new Date(h.created_at).toLocaleString()} • ${h.action} • ${h.actor_id || ''} ${h.reason? '• '+h.reason : ''}</div></div>`).join('') || 'No history';
            }));
        };

        const loadProjects = async () => {
            let status = projStatus.value || undefined;
            let contributor_id;
            if (projContributor.value) {
                const res = await getUserByEmail(projContributor.value.trim());
                contributor_id = res?.data?.id;
            }
            const course_id = projCourse.value || undefined;
            const university_id = projUniversity.value || undefined;
            const { data, error } = await getAllProjects({ status, contributor_id, course_id, university_id }, { page: projCurrentPage, pageSize: PROJ_PAGE_SIZE });
            if (error) { showMessage(error.message || 'Failed to load projects'); return; }
            renderProjects(data);
            const countRes = await countProjects({ status, contributor_id, course_id, university_id });
            if (!countRes.error && typeof countRes.data === 'number') {
                projTotalCount = countRes.data;
                updateProjPagination();
            }
        };

        const updateProjPagination = () => {
            const info = document.getElementById('proj-page-info');
            const prev = document.getElementById('proj-prev-page');
            const next = document.getElementById('proj-next-page');
            const totalPages = Math.max(1, Math.ceil(projTotalCount / PROJ_PAGE_SIZE));
            if (info) info.textContent = `Page ${projCurrentPage} of ${totalPages}`;
            if (prev) prev.disabled = projCurrentPage <= 1;
            if (next) next.disabled = projCurrentPage >= totalPages;
        };

        programSelect.addEventListener('change', () => loadCourses(programSelect.value));
        applyBtn.addEventListener('click', (e) => { e.preventDefault(); currentPage = 1; loadDocuments(); });
        resetBtn.addEventListener('click', (e) => { e.preventDefault(); programSelect.value=''; courseSelect.innerHTML='<option value="">All courses</option>'; courseSelect.disabled=true; statusSelect.value=''; typeSelect.value=''; searchInput.value=''; currentPage = 1; loadDocuments(); });
        prevBtn.addEventListener('click', () => { if (currentPage > 1) { currentPage -= 1; loadDocuments(); } });
        nextBtn.addEventListener('click', () => { const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE)); if (currentPage < totalPages) { currentPage += 1; loadDocuments(); } });
        refreshUsers.addEventListener('click', () => loadUsers());
        tabDocs.addEventListener('click', () => { document.getElementById('docs-filters').style.display='grid'; document.getElementById('documents-grid').style.display='grid'; usersPanel.style.display='none'; });
        tabUsers.addEventListener('click', () => { document.getElementById('docs-filters').style.display='none'; document.getElementById('documents-grid').style.display='none'; projectsPanel.style.display='none'; document.getElementById('catalog-panel').style.display='none'; usersPanel.style.display='block'; loadUsers(); });
        tabProjects.addEventListener('click', () => { document.getElementById('docs-filters').style.display='none'; document.getElementById('documents-grid').style.display='none'; usersPanel.style.display='none'; document.getElementById('catalog-panel').style.display='none'; projectsPanel.style.display='block'; loadProjects(); });
        document.getElementById('tab-catalog').addEventListener('click', () => { document.getElementById('docs-filters').style.display='none'; document.getElementById('documents-grid').style.display='none'; usersPanel.style.display='none'; projectsPanel.style.display='none'; document.getElementById('catalog-panel').style.display='block'; loadCatalog(); });
        tabLeaderboards.addEventListener('click', () => { document.getElementById('docs-filters').style.display='none'; document.getElementById('documents-grid').style.display='none'; usersPanel.style.display='none'; projectsPanel.style.display='none'; document.getElementById('catalog-panel').style.display='none'; lbPanel.style.display='block'; loadLeaderboards(); });
        refreshProjects.addEventListener('click', () => loadProjects());
        projStatus.addEventListener('change', () => loadProjects());
        projContributor.addEventListener('change', () => { projCurrentPage = 1; loadProjects(); });
        projCourse.addEventListener('change', () => { projCurrentPage = 1; loadProjects(); });
        projUniversity.addEventListener('change', () => { projCurrentPage = 1; loadProjects(); });
        document.getElementById('proj-prev-page').addEventListener('click', () => { if (projCurrentPage > 1) { projCurrentPage -= 1; loadProjects(); } });
        document.getElementById('proj-next-page').addEventListener('click', () => { const totalPages = Math.max(1, Math.ceil(projTotalCount / PROJ_PAGE_SIZE)); if (projCurrentPage < totalPages) { projCurrentPage += 1; loadProjects(); } });
        timeWindowSelect?.addEventListener('change', () => renderAnalyticsCharts());
        exportCsv.addEventListener('click', async () => {
            const { data } = await getAllProjects({}, { page:1, pageSize:500 });
            if (!data) return;
            const headers = ['id','title','contributor_id','status','views','license','created_at'];
            const rows = [headers.join(',')].concat(data.map(p => headers.map(h => (''+(p[h]??'')).replace(/,/g,' ')).join(',')));
            const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
            const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'projects.csv'; a.click();
        });
        exportJson.addEventListener('click', async () => {
            const { data } = await getAllProjects({}, { page:1, pageSize:500 });
            if (!data) return;
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'projects.json'; a.click();
        });
        historyClose.addEventListener('click', () => { historyBackdrop.style.display = 'none'; });

        loadPrograms();
        loadDocuments();
        // Load course/university filter options
        (async () => {
            const coursesRes = await getAllCoursesMinimal();
            if (!coursesRes.error) {
                (coursesRes.data||[]).forEach(c => { const o=document.createElement('option'); o.value=c.id; o.textContent=c.code? c.code: c.name; projCourse.appendChild(o); });
            }
            const uniRes = await getUniversities();
            if (uniRes.success) {
                (uniRes.data||[]).forEach(u => { const o=document.createElement('option'); o.value=u.id; o.textContent=u.name; projUniversity.appendChild(o); });
            }
        })();
        const renderLeaderboardRows = (rows, cols) => rows.map(r => `<div class="list-item">${cols.map(c => `<div class="item-sub">${r[c] ?? ''}</div>`).join('')}</div>`).join('');

        const loadLeaderboards = async () => {
            const windowKey = lbWindow?.value || '7d';
            const [tc, tp] = await Promise.all([getTopContributors(10, windowKey), getTopProjects(10, windowKey)]);
            if (!tc.error) lbContrib.innerHTML = renderLeaderboardRows((tc.data||[]).map(x => ({ user_id: x.id, uploads: x.uploads, views: x.views, downloads: x.downloads })), ['user_id','uploads','views','downloads']);
            if (!tp.error) lbProjects.innerHTML = renderLeaderboardRows((tp.data||[]).map(x => ({ title: x.title, views: x.views, downloads: x.download_count })), ['title','views','downloads']);

            // Community signals
            const [rc, tr] = await Promise.all([
                getRisingContributors(10, windowKey, 'views'),
                getTrendingProjects(10, windowKey, 'views')
            ]);
            if (lbRisingContrib) {
                lbRisingContrib.innerHTML = rc.error ? '<div class="empty-state">Failed to load</div>' : renderLeaderboardRows((rc.data||[]).map(x => ({ user_id: x.id, pct: x.pct_change + '%', views: x.views })), ['user_id','pct','views']);
            }
            if (lbTrendingProjects) {
                lbTrendingProjects.innerHTML = tr.error ? '<div class="empty-state">Failed to load</div>' : renderLeaderboardRows((tr.data||[]).map(x => ({ title: x.title, pct: x.pct_change + '%', views: x.views })), ['title','pct','views']);
            }
        };

        lbWindow?.addEventListener('change', () => { setWindowLabel(lbWindowLabel, lbWindow.value); loadLeaderboards(); });
        timeWindowSelect?.addEventListener('change', () => { setWindowLabel(adminWindowLabel, timeWindowSelect.value); });

        // Initialize labels on load
        setWindowLabel(adminWindowLabel, timeWindowSelect?.value || 'all');
        setWindowLabel(lbWindowLabel, lbWindow?.value || '7d');
        lbExportCsv?.addEventListener('click', async () => {
            const windowKey = lbWindow?.value || '7d';
            const tc = await getTopContributors(50, windowKey);
            if (tc.error) return; const data = tc.data||[];
            const headers = ['user_id','uploads','views','downloads'];
            const rows = [headers.join(',')].concat(data.map(p => headers.map(h => (''+(p[h]??'')).replace(/,/g,' ')).join(',')));
            const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
            const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'top_contributors.csv'; a.click();
        });
        lbExportJson?.addEventListener('click', async () => {
            const windowKey = lbWindow?.value || '7d';
            const tc = await getTopContributors(50, windowKey);
            if (tc.error) return; const data = tc.data||[];
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'top_contributors.json'; a.click();
        });

        // Exports for trends/signals
        lbExportTrendsCsv?.addEventListener('click', async () => {
            const windowKey = lbWindow?.value || '7d';
            const [tU, tV, tD] = await Promise.all([
                getMetricTrend('uploads', windowKey),
                getMetricTrend('views', windowKey),
                getMetricTrend('downloads', windowKey)
            ]);
            const rows = [
                ['metric','current_value','previous_value','pct_change'].join(','),
                ['uploads', tU.data?.current_value||0, tU.data?.previous_value||0, tU.data?.pct_change??''].join(','),
                ['views', tV.data?.current_value||0, tV.data?.previous_value||0, tV.data?.pct_change??''].join(','),
                ['downloads', tD.data?.current_value||0, tD.data?.previous_value||0, tD.data?.pct_change??''].join(',')
            ];
            const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
            const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'trends.csv'; a.click();
        });
        lbExportSignalsJson?.addEventListener('click', async () => {
            const windowKey = lbWindow?.value || '7d';
            const [rc, tr] = await Promise.all([
                getRisingContributors(20, windowKey, 'views'),
                getTrendingProjects(20, windowKey, 'views')
            ]);
            const data = { risingContributors: rc.data||[], trendingProjects: tr.data||[] };
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'community_signals.json'; a.click();
        });

        // Auth-aware logout button
        (async () => {
            const u = await getCurrentUser();
            if (u?.success) {
                navLogout?.classList.remove('hidden');
                navLogout?.addEventListener('click', async (e) => {
                    e.preventDefault();
                    await signOut();
                    window.location.href = '/index.html';
                });
            } else {
                navLogout?.classList.add('hidden');
            }
        })();

        // =========================
        // Catalog (Programs & Courses) UI wiring
        // =========================
        const programsList = document.getElementById('programs-list');
        const coursesList = document.getElementById('courses-list');
        const addProgramBtn = document.getElementById('add-program');
        const newProgramInput = document.getElementById('new-program-name');
        const addCourseBtn = document.getElementById('add-course');
        const courseCodeInput = document.getElementById('course-code');
        const courseNameInput = document.getElementById('course-name');
        const courseLevelInput = document.getElementById('course-level');
        const courseSemesterInput = document.getElementById('course-semester');
        let selectedProgramId = null;

        const renderPrograms = (rows) => {
            programsList.innerHTML = (rows||[]).map(p => `
                <div class="list-item">
                    <div class="item-title">${p.name}</div>
                    <div class="btn-group">
                        <button class="btn" data-action="select" data-id="${p.id}">View Courses</button>
                        <button class="btn" data-action="rename" data-id="${p.id}">Rename</button>
                        <button class="btn danger" data-action="delete" data-id="${p.id}">Delete</button>
                    </div>
                </div>
            `).join('');
            programsList.querySelectorAll('button[data-action="select"]').forEach(b => b.addEventListener('click', async () => { selectedProgramId = b.getAttribute('data-id'); await loadCoursesForProgram(selectedProgramId); }));
            programsList.querySelectorAll('button[data-action="rename"]').forEach(b => b.addEventListener('click', async () => { const id = b.getAttribute('data-id'); const name = prompt('New program name?'); if (!name) return; const res = await updateProgram(id, name); if (res.error) showMessage(res.error.message||'Failed'); else { showMessage('Program updated','success'); await loadProgramsList(); } }));
            programsList.querySelectorAll('button[data-action="delete"]').forEach(b => b.addEventListener('click', async () => { const id = b.getAttribute('data-id'); if (!confirm('Delete this program?')) return; const res = await deleteProgram(id); if (res.error) showMessage(res.error.message||'Failed'); else { showMessage('Program deleted','success'); await loadProgramsList(); coursesList.innerHTML=''; } }));
        };

        const renderCoursesList = (rows) => {
            if (!rows || rows.length === 0) { coursesList.innerHTML = '<div class="empty-state">No courses</div>'; return; }
            coursesList.innerHTML = rows.map(c => `
                <div class="list-item">
                    <div>
                        <div class="item-title">${c.code || ''} ${c.name}</div>
                        <div class="item-sub">Level ${c.level || ''} • Sem ${c.semester || ''}</div>
                    </div>
                    <div class="btn-group">
                        <button class="btn" data-action="edit" data-id="${c.id}">Edit</button>
                        <button class="btn danger" data-action="delete" data-id="${c.id}">Delete</button>
                    </div>
                </div>
            `).join('');
            coursesList.querySelectorAll('button[data-action="edit"]').forEach(b => b.addEventListener('click', async () => {
                const id = b.getAttribute('data-id');
                const code = prompt('Code?');
                const name = prompt('Name?');
                const level = parseInt(prompt('Level?')||'');
                const semester = parseInt(prompt('Semester?')||'');
                const res = await updateCourse(id, { code, name, level, semester });
                if (res.error) showMessage(res.error.message||'Failed'); else { showMessage('Course updated','success'); if (selectedProgramId) await loadCoursesForProgram(selectedProgramId); }
            }));
            coursesList.querySelectorAll('button[data-action="delete"]').forEach(b => b.addEventListener('click', async () => {
                const id = b.getAttribute('data-id'); if (!confirm('Delete this course?')) return; const res = await deleteCourse(id); if (res.error) showMessage(res.error.message||'Failed'); else { showMessage('Course deleted','success'); if (selectedProgramId) await loadCoursesForProgram(selectedProgramId); }
            }));
        };

        const loadProgramsList = async () => {
            const res = await listPrograms();
            if (res.error) { showMessage(res.error.message||'Failed to load programs'); return; }
            renderPrograms(res.data);
        };

        const loadCoursesForProgram = async (programId) => {
            const res = await getCourses(programId, { limit: 500, offset: 0 });
            if (res.error) { showMessage(res.error.message||'Failed to load courses'); return; }
            renderCoursesList(res.data);
        };

        const loadCatalog = async () => {
            await Promise.all([loadProgramsList(), loadUniversitiesList()]);
            coursesList.innerHTML = '<div class="empty-state">Select a program to view courses</div>';
        };

        addProgramBtn?.addEventListener('click', async () => {
            const name = (newProgramInput?.value || '').trim();
            if (!name) return;
            const res = await createProgram(name);
            if (res.error) showMessage(res.error.message||'Failed to add program'); else { showMessage('Program added','success'); newProgramInput.value=''; await loadProgramsList(); }
        });

        addCourseBtn?.addEventListener('click', async () => {
            if (!selectedProgramId) { showMessage('Select a program first'); return; }
            const code = (courseCodeInput?.value||'').trim();
            const name = (courseNameInput?.value||'').trim();
            const level = parseInt(courseLevelInput?.value||'');
            const semester = parseInt(courseSemesterInput?.value||'');
            const res = await insertCourse({ code, name, program_id: selectedProgramId, level, semester });
            if (res.error) showMessage(res.error.message||'Failed to add course'); else { showMessage('Course added','success'); courseCodeInput.value=''; courseNameInput.value=''; courseLevelInput.value=''; courseSemesterInput.value=''; await loadCoursesForProgram(selectedProgramId); }
        });

        // =========================
        // Universities UI wiring
        // =========================
        const universitiesList = document.getElementById('universities-list');
        const addUniversityBtn = document.getElementById('add-university');
        const universityNameInput = document.getElementById('university-name');
        const universityShortInput = document.getElementById('university-short');

        const renderUniversities = (rows) => {
            if (!universitiesList) return;
            if (!rows || rows.length === 0) { universitiesList.innerHTML = '<div class="empty-state">No universities</div>'; return; }
            universitiesList.innerHTML = rows.map(u => `
                <div class="list-item">
                    <div>
                        <div class="item-title">${u.name} ${u.short_name ? `(<span class=\"muted\">${u.short_name}</span>)` : ''}</div>
                        <div class="item-sub">${u.is_active ? 'Active' : 'Inactive'} • ${new Date(u.created_at).toLocaleDateString()}</div>
                    </div>
                    <div class="btn-group">
                        <button class="btn" data-action="toggle" data-id="${u.id}" data-active="${u.is_active? '1':'0'}">${u.is_active ? 'Deactivate' : 'Activate'}</button>
                        <button class="btn" data-action="edit" data-id="${u.id}" data-name="${u.name}" data-short="${u.short_name||''}">Edit</button>
                        <button class="btn danger" data-action="delete" data-id="${u.id}">Delete</button>
                    </div>
                </div>
            `).join('');

            universitiesList.querySelectorAll('button[data-action="toggle"]').forEach(b => b.addEventListener('click', async () => {
                const id = b.getAttribute('data-id');
                const active = b.getAttribute('data-active') === '1';
                const res = await updateUniversity(id, { is_active: !active });
                if (res.error) showMessage(res.error.message||'Failed'); else { showMessage('University updated','success'); await loadUniversitiesList(); }
            }));

            universitiesList.querySelectorAll('button[data-action="edit"]').forEach(b => b.addEventListener('click', async () => {
                const id = b.getAttribute('data-id');
                const currentName = b.getAttribute('data-name') || '';
                const currentShort = b.getAttribute('data-short') || '';
                const name = prompt('University name:', currentName);
                if (name === null) return;
                const short_name = prompt('Short name (optional):', currentShort);
                const res = await updateUniversity(id, { name: name.trim(), short_name: (short_name||'').trim() || null });
                if (res.error) showMessage(res.error.message||'Failed'); else { showMessage('University updated','success'); await loadUniversitiesList(); }
            }));

            universitiesList.querySelectorAll('button[data-action="delete"]').forEach(b => b.addEventListener('click', async () => {
                const id = b.getAttribute('data-id');
                if (!confirm('Delete this university?')) return;
                const res = await deleteUniversity(id);
                if (res.error) showMessage(res.error.message||'Failed'); else { showMessage('University deleted','success'); await loadUniversitiesList(); }
            }));
        };

        const loadUniversitiesList = async () => {
            const res = await listUniversities();
            if (res.error) { showMessage(res.error.message||'Failed to load universities'); return; }
            renderUniversities(res.data || []);
        };

        addUniversityBtn?.addEventListener('click', async () => {
            const name = (universityNameInput?.value||'').trim();
            const short_name = (universityShortInput?.value||'').trim();
            if (!name) { showMessage('Enter university name'); return; }
            const res = await insertUniversity({ name, short_name: short_name || null });
            if (res.error) showMessage(res.error.message||'Failed to add university'); else {
                showMessage('University added','success');
                if (universityNameInput) universityNameInput.value = '';
                if (universityShortInput) universityShortInput.value = '';
                await loadUniversitiesList();
            }
        });
