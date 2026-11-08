// ====================== SUPABASE ======================
const SUPABASE_URL = 'https://vaocsboltekfjknovpih.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_kctB4Az-JC9la65xOcLHmg_1n9XAufj';

let supabaseClient = null;
if (window.supabase) {
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

let fenData = {
    '5': { units: [], activities: [], branches: {} },
    '6': { units: [], activities: [], branches: {} },
    '7': { units: [], activities: [], branches: {} },
    '8': { units: [], activities: [], branches: {} }
};

function normTR(str) {
    return (str || '').toString().trim().toUpperCase()
        .replace(/İ/g, 'I').replace(/I/g, 'I')
        .replace(/Ş/g, 'S').replace(/Ğ/g, 'G')
        .replace(/Ü/g, 'U').replace(/Ö/g, 'O').replace(/Ç/g, 'C')
        .replace(/ı/g, 'I').replace(/ş/g, 'S').replace(/ğ/g, 'G')
        .replace(/ü/g, 'U').replace(/ö/g, 'O').replace(/ç/g, 'C');
}

async function loadAllDataFromSupabase() {
    if (!supabaseClient) return;
    try {
        ['5','6','7','8'].forEach(function(g) {
            fenData[g].units = [];
            fenData[g].activities = [];
            fenData[g].branches = {};
        });

        const { data: branchRows } = await supabaseClient.from('branches').select('*');
        if (branchRows) {
            branchRows.forEach(function(row) {
                if (!row.grade || !row.branch_name) return;
                if (!fenData[row.grade]) fenData[row.grade] = { units:[], activities:[], branches:{} };
                if (!fenData[row.grade].branches[row.branch_name]) {
                    fenData[row.grade].branches[row.branch_name] = [];
                }
            });
        }

        const { data: studentRows } = await supabaseClient.from('students').select('*');
        if (studentRows) {
            studentRows.forEach(function(row) {
                if (!row.grade || !row.branch) return;
                if (!fenData[row.grade]) fenData[row.grade] = { units:[], activities:[], branches:{} };
                if (!fenData[row.grade].branches[row.branch]) fenData[row.grade].branches[row.branch] = [];
                fenData[row.grade].branches[row.branch].push({
                    no: row.school_no,
                    name: row.name,
                    plus: row.plus || 0,
                    minus: row.minus || 0,
                    quiz: row.quiz || {},
                    scale: row.scale || {}
                });
            });
            Object.keys(fenData).forEach(function(g) {
                Object.keys(fenData[g].branches).forEach(function(b) {
                    fenData[g].branches[b].sort(function(a, b) { return parseInt(a.no) - parseInt(b.no); });
                });
            });
        }

        const { data: unitRows } = await supabaseClient.from('units_sections').select('*');
        if (unitRows) {
            const unitMap = {};
            unitRows.forEach(function(row) {
                if (!row.grade || !row.unit_name) return;
                if (!unitMap[row.grade]) unitMap[row.grade] = {};
                if (!unitMap[row.grade][row.unit_name]) unitMap[row.grade][row.unit_name] = [];
                if (row.section_name && row.section_name !== 'Genel' && unitMap[row.grade][row.unit_name].indexOf(row.section_name) < 0) {
                    unitMap[row.grade][row.unit_name].push(row.section_name);
                }
            });
            Object.keys(unitMap).forEach(function(g) {
                Object.keys(unitMap[g]).forEach(function(uName) {
                    fenData[g].units.push({ name: uName, sections: unitMap[g][uName] });
                });
            });
        }

        const { data: actRows } = await supabaseClient.from('activities').select('*');
        if (actRows) {
            actRows.forEach(function(row) {
                if (!row.grade) return;
                if (!fenData[row.grade].activities) fenData[row.grade].activities = [];
                fenData[row.grade].activities.push({
                    name: (row.activity_name || '').trim(),
                    unit: (row.unit_name || '').trim(),
                    section: (row.section_name || '').trim(),
                    criteria: row.criteria || ['1. Kriter','2. Kriter','3. Kriter','4. Kriter'],
                    scale_type: row.scale_type || '1-4'
                });
            });
        }
    } catch (err) {
        console.error('Veri yukleme hatasi:', err);
    }
}

function getScoreBadge(score) {
    if (score === 'G') return '<span class="badge badge-neutral">G</span>';
    if (score === '-' || score === '' || score == null) return '<span class="badge badge-neutral">-</span>';
    var num = parseFloat(score);
    if (isNaN(num)) return '<span class="badge badge-neutral">' + score + '</span>';
    if (num >= 85) return '<span class="badge badge-high">' + num + '</span>';
    if (num >= 50) return '<span class="badge badge-mid">' + num + '</span>';
    return '<span class="badge badge-low">' + num + '</span>';
}

function getScaleBadge(score) {
    if (score === 'G') return '<span class="badge badge-neutral">G</span>';
    if (score === '-' || score === '' || score == null) return '<span class="badge badge-neutral">-</span>';
    var num = parseFloat(score);
    if (isNaN(num)) return '<span class="badge badge-neutral">' + score + '</span>';
    if (num >= 85) return '<span class="badge badge-high">%' + num + '</span>';
    if (num >= 50) return '<span class="badge badge-mid">%' + num + '</span>';
    return '<span class="badge badge-low">%' + num + '</span>';
}

function validateScoreInput(el) {
    var val = el.value.trim().toUpperCase();
    if (val === 'G' || val === '') return;
    var num = parseFloat(val);
    if (!isNaN(num)) {
        if (num > 100) el.value = '100';
        if (num < 0) el.value = '0';
    }
}

function getJsPDF() {
    if (window.jspdf && window.jspdf.jsPDF) return window.jspdf.jsPDF;
    if (window.jsPDF) return window.jsPDF;
    return null;
}

// ====================== HISTORY (DUZELTILMIS) ======================
function saveState(state) {
    sessionStorage.setItem('fen_app_state', JSON.stringify(state));
    try {
        history.pushState(state, '', '#' + (state.type || 'giris'));
    } catch (e) {
        console.log('pushState hatasi', e);
    }
}

function restoreStateFromSession() {
    var saved = sessionStorage.getItem('fen_app_state');
    if (!saved) { renderAuthScreenView(false); return; }
    try { applyState(JSON.parse(saved), false); } catch (e) { renderAuthScreenView(false); }
}

function applyState(state, push) {
    if (!state || !state.type) {
        renderAuthScreenView(false);
        return;
    }
    sessionStorage.setItem('fen_app_state', JSON.stringify(state));
    switch (state.type) {
        case 'teacher':
            renderTeacherPanelView(false);
            break;
        case 'grade-mgmt':
            openGradeManagement(state.grade, false);
            break;
        case 'branch-menu':
            openBranchMenu(state.grade, state.branchName, false);
            break;
        case 'branch-detail':
            openBranchDetail(state.grade, state.branchName, state.tab || 'students', false);
            break;
        case 'student':
            renderStudentPanelView(state.grade, state.branch, state.student, false);
            break;
        default:
            renderAuthScreenView(false);
    }
}

window.addEventListener('popstate', function(event) {
    if (event.state && event.state.type) {
        applyState(event.state, false);
        return;
    }
    var saved = sessionStorage.getItem('fen_app_state');
    if (saved) {
        try {
            applyState(JSON.parse(saved), false);
            return;
        } catch (e) {}
    }
    renderAuthScreenView(false);
});

// ====================== AUTH ======================
function switchAuthTab(role) {
    var sBtn = document.getElementById('btn-student-tab');
    var tBtn = document.getElementById('btn-teacher-tab');
    var sForm = document.getElementById('student-auth-form');
    var tForm = document.getElementById('teacher-auth-form');
    if (!sBtn || !tBtn || !sForm || !tForm) return;
    if (role === 'student') {
        sBtn.classList.add('active'); tBtn.classList.remove('active');
        sForm.style.display = 'block'; tForm.style.display = 'none';
        updateStudentBranches();
    } else {
        tBtn.classList.add('active'); sBtn.classList.remove('active');
        tForm.style.display = 'block'; sForm.style.display = 'none';
    }
}

function updateStudentBranches() {
    var gradeSel = document.getElementById('student-grade');
    var branchSel = document.getElementById('student-branch');
    if (!gradeSel || !branchSel) return;
    var grade = gradeSel.value;
    branchSel.innerHTML = '<option value="">-- Sube Secin --</option>';
    if (!grade || !fenData[grade] || !fenData[grade].branches) return;
    var branches = Object.keys(fenData[grade].branches);
    if (branches.length === 0) {
        branchSel.innerHTML += '<option value="" disabled>Sube bulunamadi</option>';
        return;
    }
    branches.forEach(function(b) {
        var short = b.indexOf('/') >= 0 ? b.split('/')[1] : b;
        var opt = document.createElement('option');
        opt.value = b;
        opt.textContent = short + ' Subesi';
        branchSel.appendChild(opt);
    });
}

async function teacherLogin() {
    var email = document.getElementById('teacher-email')?.value.trim();
    var password = document.getElementById('teacher-password')?.value.trim();
    if (!email || !password) return alert('E-posta ve sifre girin.');
    try {
        if (supabaseClient) {
            var res = await supabaseClient.auth.signInWithPassword({ email: email, password: password });
            if (res.error) return alert('Giris basarisiz: ' + res.error.message);
        }
        await loadAllDataFromSupabase();
        renderTeacherPanelView(true);
    } catch (e) { alert('Giris hatasi'); }
}

async function studentLogin() {
    var grade = document.getElementById('student-grade')?.value;
    var branch = document.getElementById('student-branch')?.value;
    var no = parseInt(document.getElementById('student-number')?.value);
    var nameRaw = document.getElementById('student-name')?.value.trim();
    if (!grade || !branch || !no || !nameRaw) return alert('Tum alanlari doldurun.');
    await loadAllDataFromSupabase();
    var list = fenData[grade]?.branches?.[branch] || [];
    var name = normTR(nameRaw);
    var found = list.find(function(s) {
        return parseInt(s.no) === no && normTR(s.name) === name;
    });
    if (!found) {
        console.log('Aranan:', no, name, 'Branch:', branch);
        console.log('Liste:', list.map(function(s) { return s.no + ' - ' + s.name; }));
        return alert('Ogrenci bulunamadi.');
    }
    renderStudentPanelView(grade, branch, found, true);
}

function logout() {
    if (supabaseClient) supabaseClient.auth.signOut();
    sessionStorage.removeItem('fen_app_state');
    history.pushState({ type: 'auth' }, '', '#giris');
    renderAuthScreenView(false);
}

function logoutStudent() {
    sessionStorage.removeItem('fen_app_state');
    history.pushState({ type: 'auth' }, '', '#giris');
    renderAuthScreenView(false);
}

function renderAuthScreenView(push) {
    if (push) saveState({ type: 'auth' });
    document.getElementById('auth-screen').style.display = 'flex';
    document.getElementById('teacher-panel').style.display = 'none';
    document.getElementById('grade-detail-panel').style.display = 'none';
    document.getElementById('student-panel').style.display = 'none';
    closeModal();
}

function renderTeacherPanelView(push) {
    if (push) saveState({ type: 'teacher' });
    document.getElementById('auth-screen').style.display = 'none';
    document.getElementById('grade-detail-panel').style.display = 'none';
    document.getElementById('student-panel').style.display = 'none';
    document.getElementById('teacher-panel').style.display = 'flex';
    closeModal();
}

function toggleTeacherActionsCard() {
    var cont = document.getElementById('teacher-actions-container');
    var icon = document.getElementById('teacher-actions-toggle-icon');
    if (!cont) return;
    var open = cont.style.display !== 'none';
    cont.style.display = open ? 'none' : 'block';
    if (icon) icon.style.transform = open ? 'rotate(0deg)' : 'rotate(180deg)';
}

function openModal(title, html, onConfirm) {
    document.getElementById('modal-title').innerText = title;
    document.getElementById('modal-body').innerHTML = html;
    var btn = document.getElementById('modal-confirm-btn');
    var newBtn = btn.cloneNode(true);
    btn.parentNode.replaceChild(newBtn, btn);
    if (onConfirm) { newBtn.style.display = 'inline-block'; newBtn.onclick = onConfirm; }
    else { newBtn.style.display = 'none'; }
    document.getElementById('app-modal').style.display = 'flex';
}

function closeModal() {
    document.getElementById('app-modal').style.display = 'none';
}

// ====================== SINIF & SUBE ======================
function openGradeManagement(grade, push) {
    if (push) saveState({ type: 'grade-mgmt', grade: grade });
    var panel = document.getElementById('grade-detail-panel');
    document.getElementById('teacher-panel').style.display = 'none';
    document.getElementById('auth-screen').style.display = 'none';
    document.getElementById('student-panel').style.display = 'none';
    panel.style.display = 'flex';

    var cards = '';
    var branches = fenData[grade]?.branches || {};
    Object.keys(branches).forEach(function(bName) {
        cards += '<div class="grade-card" style="position:relative; border-top-color:#3b82f6;">' +
            '<div onclick="openBranchMenu(\'' + grade + '\',\'' + bName + '\')" style="cursor:pointer;">' +
                '<h3>' + bName + ' Subesi</h3>' +
                '<p>' + branches[bName].length + ' Ogrenci</p>' +
                '<span class="card-action">Subeye Git</span>' +
            '</div>' +
            '<button onclick="event.stopPropagation(); deleteBranch(\'' + grade + '\',\'' + bName + '\')" ' +
                'style="position:absolute; top:8px; right:8px; background:#ef4444; color:white; border:none; border-radius:4px; padding:2px 6px; font-size:11px; cursor:pointer;">Sil</button>' +
            '</div>';
    });

    panel.innerHTML =
        '<header class="teacher-header">' +
            '<div class="header-brand"><h1>' + grade + '. Siniflar</h1></div>' +
            '<div>' +
                '<button onclick="renderTeacherPanelView(false)" class="logout-btn" style="background:#3b82f6; margin-right:6px;">Geri</button>' +
                '<button onclick="logout()" class="logout-btn">Cikis</button>' +
            '</div>' +
        '</header>' +
        '<section class="dashboard-content">' +
            '<button onclick="addNewBranchModal(\'' + grade + '\')" class="auth-btn" style="width:auto; padding:8px 16px; background:#059669; margin-bottom:14px;">+ Yeni Sube Ekle</button>' +
            '<div class="grade-cards-grid">' + (cards || '<p style="color:#94a3b8;">Henuz sube yok.</p>') + '</div>' +
        '</section>';
}

function addNewBranchModal(grade) {
    openModal('Yeni Sube Ekle',
        '<label style="font-size:13px; color:#cbd5e1;">Sube Adi (A, B, C...)</label>' +
        '<input type="text" id="modal-branch-name" class="auth-input" placeholder="A">',
    async function() {
        var name = document.getElementById('modal-branch-name').value.trim().toUpperCase();
        if (!name) return;
        var full = grade + '/' + name;
        if (supabaseClient) {
            var res = await supabaseClient.from('branches').insert([{ grade: grade, branch_name: full }]);
            if (res.error) return alert(res.error.message);
        }
        await loadAllDataFromSupabase();
        closeModal();
        openGradeManagement(grade, false);
    });
}

async function deleteBranch(grade, bName) {
    if (!confirm(bName + ' subesini silmek istediginize emin misiniz?')) return;
    if (supabaseClient) {
        await supabaseClient.from('branches').delete().eq('grade', grade).eq('branch_name', bName);
        await supabaseClient.from('students').delete().eq('grade', grade).eq('branch', bName);
    }
    await loadAllDataFromSupabase();
    openGradeManagement(grade, false);
}

function openBranchMenu(grade, branchName, push) {
    if (push !== false) saveState({ type: 'branch-menu', grade: grade, branchName: branchName });
    var panel = document.getElementById('grade-detail-panel');
    panel.style.display = 'flex';
    document.getElementById('teacher-panel').style.display = 'none';
    document.getElementById('auth-screen').style.display = 'none';
    document.getElementById('student-panel').style.display = 'none';

    panel.innerHTML =
        '<header class="teacher-header">' +
            '<div class="header-brand"><h1>' + grade + '. Sinif - ' + branchName + '</h1></div>' +
            '<div>' +
                '<button onclick="openGradeManagement(\'' + grade + '\', false)" class="logout-btn" style="background:#3b82f6; margin-right:6px;">Geri</button>' +
                '<button onclick="logout()" class="logout-btn">Cikis</button>' +
            '</div>' +
        '</header>' +
        '<section class="dashboard-content">' +
            '<div class="grade-cards-grid">' +
                '<div class="grade-card" onclick="openBranchDetail(\'' + grade + '\',\'' + branchName + '\',\'students\', true)" style="border-top-color:#3b82f6;">' +
                    '<div style="font-size:24px; margin-bottom:6px;">1</div><h3>Sinif Listesi</h3><span class="card-action">Git</span>' +
                '</div>' +
                '<div class="grade-card" onclick="openBranchDetail(\'' + grade + '\',\'' + branchName + '\',\'quizzes\', true)" style="border-top-color:#8b5cf6;">' +
                    '<div style="font-size:24px; margin-bottom:6px;">2</div><h3>Quiz Sonuclari</h3><span class="card-action">Git</span>' +
                '</div>' +
                '<div class="grade-card" onclick="openBranchDetail(\'' + grade + '\',\'' + branchName + '\',\'activities\', true)" style="border-top-color:#10b981;">' +
                    '<div style="font-size:24px; margin-bottom:6px;">3</div><h3>Etkinlik Olcekleri</h3><span class="card-action">Git</span>' +
                '</div>' +
                '<div class="grade-card" onclick="openBranchDetail(\'' + grade + '\',\'' + branchName + '\',\'reports\', true)" style="border-top-color:#f59e0b;">' +
                    '<div style="font-size:24px; margin-bottom:6px;">4</div><h3>Raporlar</h3><span class="card-action">Git</span>' +
                '</div>' +
            '</div>' +
        '</section>';
}

function openBranchDetail(grade, branchName, tab, push) {
    if (push !== false) saveState({ type: 'branch-detail', grade: grade, branchName: branchName, tab: tab });
    var panel = document.getElementById('grade-detail-panel');
    panel.style.display = 'flex';
    document.getElementById('teacher-panel').style.display = 'none';
    document.getElementById('auth-screen').style.display = 'none';
    document.getElementById('student-panel').style.display = 'none';

    panel.innerHTML =
        '<header class="teacher-header">' +
            '<div class="header-brand"><h1>' + grade + '. Sinif - ' + branchName + '</h1></div>' +
            '<div>' +
                '<button onclick="openBranchMenu(\'' + grade + '\',\'' + branchName + '\', false)" class="logout-btn" style="background:#3b82f6; margin-right:6px;">Menu</button>' +
                '<button onclick="logout()" class="logout-btn">Cikis</button>' +
            '</div>' +
        '</header>' +
        '<section class="dashboard-content">' +
            '<div id="branch-tab-content" style="background:rgba(30,41,59,0.7); padding:16px; border-radius:12px; border:1px solid rgba(255,255,255,0.08);"></div>' +
        '</section>';
    loadBranchTabContent(tab, grade, branchName);
}

function loadBranchTabContent(tab, grade, branchName) {
    var content = document.getElementById('branch-tab-content');
    if (!content) return;
    var units = fenData[grade]?.units || [];
    var unitOpts = '<option value="">-- Unite Secin --</option>';
    units.forEach(function(u) {
        unitOpts += '<option value="' + u.name + '">' + u.name + '</option>';
    });

    if (tab === 'students') {
        var students = fenData[grade]?.branches[branchName] || [];
        var rows = '';
        students.forEach(function(s, idx) {
            rows += '<tr>' +
                '<td style="white-space:nowrap;">' + s.no + '</td>' +
                '<td style="white-space:nowrap; text-align:left; min-width:150px;">' + s.name + '</td>' +
                '<td style="white-space:nowrap;">' +
                    '<button class="btn-pastel-green" onclick="updatePoint(\'' + grade + '\',\'' + branchName + '\',' + idx + ',\'plus\')">+</button>' +
                    '<span style="margin:0 6px; font-weight:600;">' + s.plus + '</span>' +
                '</td>' +
                '<td style="white-space:nowrap;">' +
                    '<button class="btn-pastel-red" onclick="updatePoint(\'' + grade + '\',\'' + branchName + '\',' + idx + ',\'minus\')">-</button>' +
                    '<span style="margin:0 6px; font-weight:600;">' + s.minus + '</span>' +
                '</td>' +
                '<td><button class="btn-pastel-gray" onclick="deleteStudent(\'' + grade + '\',\'' + branchName + '\',' + idx + ')">Sil</button></td>' +
            '</tr>';
        });
        content.innerHTML =
            '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; flex-wrap:wrap; gap:8px;">' +
                '<h3 style="margin:0; font-size:15px;">Ogrenci Listesi</h3>' +
                '<div style="display:flex; gap:6px;">' +
                    '<button onclick="openBulkStudentModal(\'' + grade + '\',\'' + branchName + '\')" class="auth-btn" style="width:auto; padding:6px 10px; background:#059669; font-size:12px;">e-Okul</button>' +
                    '<button onclick="addStudentModal(\'' + grade + '\',\'' + branchName + '\')" class="auth-btn" style="width:auto; padding:6px 10px; background:#2563eb; font-size:12px;">+ Ogrenci</button>' +
                '</div>' +
            '</div>' +
            '<div style="overflow-x:auto;">' +
                '<table class="data-table" id="export-students">' +
                    '<thead><tr><th>No</th><th>Ad Soyad</th><th>Arti</th><th>Eksi</th><th>Islem</th></tr></thead>' +
                    '<tbody>' + (rows || '<tr><td colspan="5">Ogrenci yok</td></tr>') + '</tbody>' +
                '</table>' +
            '</div>' +
            '<div style="margin-top:12px; display:flex; gap:8px; flex-wrap:wrap;">' +
                '<button onclick="exportTableToWord(\'export-students\',\'' + branchName + '_Ogrenci\')" class="auth-btn" style="background:#2563eb; width:auto; padding:7px 12px;">Word</button>' +
                '<button onclick="exportTableToPDF(\'export-students\',\'' + branchName + '_Ogrenci\')" class="auth-btn" style="background:#dc2626; width:auto; padding:7px 12px;">PDF</button>' +
            '</div>';
    }
    else if (tab === 'quizzes') {
        content.innerHTML =
            '<h3 style="margin-bottom:8px; font-size:15px;">Quiz Sonuclari</h3>' +
            '<select id="quiz-unit-sel" class="auth-input" onchange="loadQuizSections(\'' + grade + '\',\'' + branchName + '\')">' + unitOpts + '</select>' +
            '<select id="quiz-section-sel" class="auth-input" onchange="renderQuizTable(\'' + grade + '\',\'' + branchName + '\')">' +
                '<option value="">-- Bolum Secin --</option>' +
            '</select>' +
            '<div id="quiz-table-container" style="margin-top:14px;"></div>';
    }
    else if (tab === 'activities') {
        content.innerHTML =
            '<h3 style="margin-bottom:8px; font-size:15px;">Etkinlik Olcekleri</h3>' +
            '<select id="act-unit-sel" class="auth-input" onchange="loadActSections(\'' + grade + '\',\'' + branchName + '\')">' + unitOpts + '</select>' +
            '<select id="act-section-sel" class="auth-input" onchange="loadActNames(\'' + grade + '\',\'' + branchName + '\')">' +
                '<option value="">-- Bolum Secin --</option>' +
            '</select>' +
            '<select id="act-name-sel" class="auth-input" onchange="loadSubScales(\'' + grade + '\',\'' + branchName + '\')">' +
                '<option value="">-- Etkinlik Secin --</option>' +
            '</select>' +
            '<select id="sub-scale-sel" class="auth-input" onchange="renderActivityTable(\'' + grade + '\',\'' + branchName + '\')">' +
                '<option value="--TUM--">-- Tum Olcekler --</option>' +
            '</select>' +
            '<div id="activity-table-container" style="margin-top:14px;"></div>';
    }
    else if (tab === 'reports') {
        content.innerHTML =
            '<h3 style="margin-bottom:8px; font-size:15px;">Raporlar</h3>' +
            '<select id="rep-unit-sel" class="auth-input" onchange="loadRepSections(\'' + grade + '\',\'' + branchName + '\')">' + unitOpts + '</select>' +
            '<select id="rep-section-sel" class="auth-input" onchange="renderReport(\'' + grade + '\',\'' + branchName + '\')">' +
                '<option value="">-- Bolum Secin --</option>' +
            '</select>' +
            '<div id="report-container" style="margin-top:14px;"></div>';
    }
}

function addStudentModal(grade, branchName) {
    openModal('Ogrenci Ekle',
        '<input type="number" id="s-no" class="auth-input" placeholder="Okul No">' +
        '<input type="text" id="s-name" class="auth-input" placeholder="Ad Soyad">',
    async function() {
        var no = parseInt(document.getElementById('s-no').value);
        var name = document.getElementById('s-name').value.trim().toUpperCase();
        if (!no || !name) return alert('Alanlari doldurun');
        if (supabaseClient) {
            await supabaseClient.from('students').insert([{
                grade: grade, branch: branchName, school_no: no, name: name, plus: 0, minus: 0, quiz: {}, scale: {}
            }]);
        }
        await loadAllDataFromSupabase();
        closeModal();
        openBranchDetail(grade, branchName, 'students', false);
    });
}

function openBulkStudentModal(grade, branchName) {
    openModal('Toplu Ogrenci (e-Okul)',
        '<p style="font-size:12px; color:#94a3b8; margin-bottom:8px;">Okul No + Tab + Ad Soyad seklinde yapistirin</p>' +
        '<textarea id="bulk-text" class="auth-input" style="height:140px; font-family:monospace;"></textarea>',
    async function() {
        var text = document.getElementById('bulk-text').value.trim();
        if (!text) return;
        var lines = text.split('\n');
        var count = 0;
        for (var i = 0; i < lines.length; i++) {
            var parts = lines[i].split('\t');
            if (parts.length < 2) parts = lines[i].trim().split(/\s{2,}/);
            if (parts.length >= 2) {
                var no = parseInt(parts[0]);
                var name = parts[1].trim().toUpperCase();
                if (!isNaN(no) && name && supabaseClient) {
                    await supabaseClient.from('students').insert([{
                        grade: grade, branch: branchName, school_no: no, name: name, plus: 0, minus: 0, quiz: {}, scale: {}
                    }]);
                    count++;
                }
            }
        }
        await loadAllDataFromSupabase();
        alert(count + ' ogrenci eklendi');
        closeModal();
        openBranchDetail(grade, branchName, 'students', false);
    });
}

async function updatePoint(grade, branchName, idx, type) {
    var s = fenData[grade].branches[branchName][idx];
    if (type === 'plus') s.plus++;
    else s.minus++;
    if (supabaseClient) {
        await supabaseClient.from('students').update({ plus: s.plus, minus: s.minus })
            .eq('grade', grade).eq('branch', branchName).eq('school_no', s.no);
    }
    await loadAllDataFromSupabase();
    openBranchDetail(grade, branchName, 'students', false);
}

async function deleteStudent(grade, branchName, idx) {
    var s = fenData[grade].branches[branchName][idx];
    if (!confirm(s.name + ' silinsin mi?')) return;
    if (supabaseClient) {
        await supabaseClient.from('students').delete()
            .eq('grade', grade).eq('branch', branchName).eq('school_no', s.no);
    }
    await loadAllDataFromSupabase();
    openBranchDetail(grade, branchName, 'students', false);
}

function loadQuizSections(grade, branchName) {
    var unit = document.getElementById('quiz-unit-sel')?.value;
    var sel = document.getElementById('quiz-section-sel');
    if (!sel) return;
    sel.innerHTML = '<option value="">-- Bolum Secin --</option>';
    if (!unit) return;
    var u = (fenData[grade]?.units || []).find(function(x) { return x.name === unit; });
    if (u && u.sections && u.sections.length > 0) {
        u.sections.forEach(function(s) {
            sel.innerHTML += '<option value="' + s + '">' + s + '</option>';
        });
    } else {
        sel.innerHTML += '<option value="Genel">Genel</option>';
    }
    renderQuizTable(grade, branchName);
}

function renderQuizTable(grade, branchName) {
    var unit = document.getElementById('quiz-unit-sel')?.value;
    var section = document.getElementById('quiz-section-sel')?.value;
    var cont = document.getElementById('quiz-table-container');
    if (!cont) return;
    if (!unit || !section) {
        cont.innerHTML = '<p style="color:#94a3b8; font-size:13px;">Unite ve bolum secin.</p>';
        return;
    }
    var students = fenData[grade]?.branches[branchName] || [];
    var key = unit + '_' + section;
    var rows = '';
    students.forEach(function(s, idx) {
        var val = s.quiz?.[key] ?? '';
        rows += '<tr>' +
            '<td style="white-space:nowrap;">' + s.no + '</td>' +
            '<td style="white-space:nowrap; text-align:left; min-width:150px;">' + s.name + '</td>' +
            '<td><input type="text" id="quiz-' + idx + '" class="auth-input" style="width:70px; padding:6px; text-align:center; margin:0 auto;" value="' + val + '" placeholder="0-100 / G" oninput="validateScoreInput(this)"></td>' +
        '</tr>';
    });
    cont.innerHTML =
        '<div id="quiz-print" class="print-area">' +
            '<div class="print-header"><h2>FENOMENAL FEN BILIMLERI</h2><h3>' + grade + '. Sinif (' + branchName + ') - Quiz</h3></div>' +
            '<div class="print-info">' +
                '<p><b>Sube:</b> ' + grade + '. Sinif - ' + branchName + '</p>' +
                '<p><b>Unite:</b> ' + unit + '</p>' +
                '<p><b>Bolum:</b> ' + section + '</p>' +
            '</div>' +
            '<div style="overflow-x:auto;">' +
                '<table class="data-table">' +
                    '<thead><tr><th>No</th><th>Ad Soyad</th><th>Quiz Notu</th></tr></thead>' +
                    '<tbody>' + rows + '</tbody>' +
                '</table>' +
            '</div>' +
        '</div>' +
        '<div style="margin-top:12px; display:flex; gap:8px; flex-wrap:wrap;">' +
            '<button onclick="saveQuiz(\'' + grade + '\',\'' + branchName + '\')" class="auth-btn" style="width:auto; padding:8px 14px;">Kaydet</button>' +
            '<button onclick="exportTableToWord(\'quiz-print\',\'' + branchName + '_Quiz\')" class="auth-btn" style="background:#2563eb; width:auto; padding:8px 14px;">Word</button>' +
            '<button onclick="exportTableToPDF(\'quiz-print\',\'' + branchName + '_Quiz\')" class="auth-btn" style="background:#dc2626; width:auto; padding:8px 14px;">PDF</button>' +
        '</div>';
}

async function saveQuiz(grade, branchName) {
    var unit = document.getElementById('quiz-unit-sel').value;
    var section = document.getElementById('quiz-section-sel').value;
    var key = unit + '_' + section;
    var students = fenData[grade].branches[branchName];
    for (var i = 0; i < students.length; i++) {
        var input = document.getElementById('quiz-' + i);
        if (!input) continue;
        var val = input.value.trim().toUpperCase();
        if (val !== 'G' && val !== '') {
            var n = parseFloat(val);
            if (!isNaN(n)) {
                if (n < 0) n = 0;
                if (n > 100) n = 100;
                val = n.toString();
            }
        }
        if (!students[i].quiz) students[i].quiz = {};
        students[i].quiz[key] = val;
        if (supabaseClient) {
            await supabaseClient.from('students').update({ quiz: students[i].quiz })
                .eq('grade', grade).eq('branch', branchName).eq('school_no', students[i].no);
        }
    }
    await loadAllDataFromSupabase();
    alert('Quiz notlari kaydedildi!');
}

function loadActSections(grade, branchName) {
    var unit = document.getElementById('act-unit-sel').value;
    var sel = document.getElementById('act-section-sel');
    sel.innerHTML = '<option value="">-- Bolum Secin --</option>';
    var u = fenData[grade]?.units.find(function(x) { return x.name === unit; });
    if (u) u.sections.forEach(function(s) {
        sel.innerHTML += '<option value="' + s + '">' + s + '</option>';
    });
    loadActNames(grade, branchName);
}

function loadActNames(grade, branchName) {
    var unit = document.getElementById('act-unit-sel').value;
    var section = document.getElementById('act-section-sel').value;
    var sel = document.getElementById('act-name-sel');
    sel.innerHTML = '<option value="">-- Etkinlik Secin --</option>';
    var acts = (fenData[grade]?.activities || []).filter(function(a) {
        return a.unit === unit && a.section === section;
    });
    var bases = new Set();
    acts.forEach(function(a) {
        var parts = a.name.split(' - ');
        bases.add(parts.length >= 2 ? parts[0] + ' - ' + parts[1] : a.name);
    });
    bases.forEach(function(b) {
        sel.innerHTML += '<option value="' + b + '">' + b + '</option>';
    });
    loadSubScales(grade, branchName);
}

function loadSubScales(grade, branchName) {
    var unit = document.getElementById('act-unit-sel').value;
    var section = document.getElementById('act-section-sel').value;
    var base = document.getElementById('act-name-sel').value;
    var sel = document.getElementById('sub-scale-sel');
    sel.innerHTML = '<option value="--TUM--">-- Tum Olcekler --</option>';
    if (!base) { renderActivityTable(grade, branchName); return; }
    var subs = (fenData[grade]?.activities || []).filter(function(a) {
        return a.unit === unit && a.section === section && (a.name === base || a.name.indexOf(base + ' -') === 0);
    });
    subs.forEach(function(s) {
        var short = s.name.replace(base, '').replace(/^[\s-]+/, '') || s.name;
        sel.innerHTML += '<option value="' + s.name + '">' + short + '</option>';
    });
    renderActivityTable(grade, branchName);
}

function renderActivityTable(grade, branchName) {
    var unit = document.getElementById('act-unit-sel')?.value;
    var section = document.getElementById('act-section-sel')?.value;
    var base = document.getElementById('act-name-sel')?.value;
    var selected = document.getElementById('sub-scale-sel')?.value;
    var cont = document.getElementById('activity-table-container');
    if (!cont) return;
    if (!base) {
        cont.innerHTML = '<p style="color:#94a3b8; font-size:13px;">Etkinlik secin.</p>';
        return;
    }
    var allActs = fenData[grade]?.activities || [];
    var subScales = allActs.filter(function(a) {
        return a.unit === unit && a.section === section && (a.name === base || a.name.indexOf(base + ' -') === 0);
    });
    var students = fenData[grade]?.branches[branchName] || [];

    if (selected && selected !== '--TUM--') {
        var scale = subScales.find(function(a) { return a.name === selected; });
        if (!scale) return;
        var criteria = scale.criteria || ['1. Kriter','2. Kriter','3. Kriter','4. Kriter'];
        var head = '<th style="width:50px;">No</th><th style="min-width:140px; text-align:left;">Ad Soyad</th>';
        criteria.forEach(function(c) {
            head += '<th style="min-width:65px; max-width:90px; font-size:10px; white-space:normal; word-break:break-word; line-height:1.25;">' + c + '</th>';
        });
        head += '<th style="min-width:60px;">Toplam</th>';
        var body = '';
        students.forEach(function(s, sIdx) {
            var stored = s.scale?.[selected] || {};
            var cells = '<td style="white-space:nowrap;">' + s.no + '</td><td style="white-space:nowrap; text-align:left;">' + s.name + '</td>';
            criteria.forEach(function(_, cIdx) {
                var val = stored[cIdx] !== undefined ? stored[cIdx] : '';
                cells += '<td><input type="text" id="crit-' + sIdx + '-' + cIdx + '" class="auth-input" style="width:45px; padding:5px; text-align:center; font-size:12px;" value="' + val + '" oninput="validateScoreInput(this)"></td>';
            });
            var total = stored.totalScore !== undefined ? stored.totalScore : '-';
            cells += '<td id="total-' + sIdx + '">' + getScaleBadge(total) + '</td>';
            body += '<tr>' + cells + '</tr>';
        });
        cont.innerHTML =
            '<div id="act-print" class="print-area">' +
                '<div class="print-header"><h2>FENOMENAL FEN BILIMLERI</h2><h3>Tekil Olcek</h3></div>' +
                '<div class="print-info"><p><b>Olcek:</b> ' + scale.name + '</p></div>' +
                '<div style="overflow-x:auto;"><table class="data-table"><thead><tr>' + head + '</tr></thead><tbody>' + body + '</tbody></table></div>' +
            '</div>' +
            '<div style="margin-top:12px; display:flex; gap:8px; flex-wrap:wrap;">' +
                '<button onclick="saveSingleScale(\'' + grade + '\',\'' + branchName + '\',\'' + selected + '\',' + criteria.length + ')" class="auth-btn" style="width:auto; padding:8px 14px;">Kaydet</button>' +
                '<button onclick="exportTableToWord(\'act-print\',\'' + branchName + '_Tekil\')" class="auth-btn" style="background:#2563eb; width:auto; padding:8px 14px;">Word</button>' +
                '<button onclick="exportTableToPDF(\'act-print\',\'' + branchName + '_Tekil\')" class="auth-btn" style="background:#dc2626; width:auto; padding:8px 14px;">PDF</button>' +
            '</div>';
        return;
    }

    var head2 = '<th style="width:50px;">No</th><th style="min-width:140px; text-align:left;">Ad Soyad</th><th style="min-width:60px;">Hizli</th>';
    subScales.forEach(function(sc) {
        var short = sc.name.replace(base, '').replace(/^[\s-]+/, '') || sc.name;
        if (short.length > 9) short = short.substring(0, 7) + '..';
        head2 += '<th style="min-width:55px; font-size:11px;">' + short + '</th>';
    });
    var body2 = '';
    students.forEach(function(s, sIdx) {
        var first = subScales[0]?.name;
        var quick = (first && s.scale?.[first]?.totalScore !== undefined) ? s.scale[first].totalScore : '';
        var cells = '<td style="white-space:nowrap;">' + s.no + '</td><td style="white-space:nowrap; text-align:left;">' + s.name + '</td>';
        cells += '<td><input type="text" id="quick-' + sIdx + '" class="auth-input" style="width:55px; padding:5px; text-align:center;" value="' + quick + '" placeholder="85" oninput="validateScoreInput(this); applyQuick(' + sIdx + ',' + subScales.length + ')"></td>';
        subScales.forEach(function(sc, i) {
            var val = s.scale?.[sc.name]?.totalScore !== undefined ? s.scale[sc.name].totalScore : '-';
            cells += '<td id="badge-' + sIdx + '-' + i + '">' + getScaleBadge(val) + '</td>';
        });
        body2 += '<tr>' + cells + '</tr>';
    });
    cont.innerHTML =
        '<div id="act-print" class="print-area">' +
            '<div class="print-header"><h2>FENOMENAL FEN BILIMLERI</h2><h3>Tum Olcekler</h3></div>' +
            '<div style="overflow-x:auto;"><table class="data-table"><thead><tr>' + head2 + '</tr></thead><tbody>' + body2 + '</tbody></table></div>' +
        '</div>' +
        '<div style="margin-top:12px; display:flex; gap:8px; flex-wrap:wrap;">' +
            '<button onclick="saveGroupScales(\'' + grade + '\',\'' + branchName + '\',\'' + base + '\')" class="auth-btn" style="width:auto; padding:8px 14px;">Kaydet</button>' +
            '<button onclick="exportTableToWord(\'act-print\',\'' + branchName + '_Tum\')" class="auth-btn" style="background:#2563eb; width:auto; padding:8px 14px;">Word</button>' +
            '<button onclick="exportTableToPDF(\'act-print\',\'' + branchName + '_Tum\')" class="auth-btn" style="background:#dc2626; width:auto; padding:8px 14px;">PDF</button>' +
        '</div>';
}

function applyQuick(sIdx, count) {
    var val = document.getElementById('quick-' + sIdx)?.value.trim().toUpperCase() || '';
    for (var i = 0; i < count; i++) {
        var el = document.getElementById('badge-' + sIdx + '-' + i);
        if (el) el.innerHTML = getScaleBadge(val);
    }
}

async function saveSingleScale(grade, branchName, scaleName, critCount) {
    var students = fenData[grade].branches[branchName];
    var scaleObj = (fenData[grade].activities || []).find(function(a) { return a.name === scaleName; });
    var type = scaleObj?.scale_type || '1-4';
    for (var i = 0; i < students.length; i++) {
        var s = students[i];
        if (!s.scale) s.scale = {};
        if (!s.scale[scaleName]) s.scale[scaleName] = {};
        var sum = 0, has = false;
        for (var c = 0; c < critCount; c++) {
            var input = document.getElementById('crit-' + i + '-' + c);
            if (!input) continue;
            var v = input.value.trim();
            if (v === '') continue;
            has = true;
            var n = parseFloat(v) || 0;
            s.scale[scaleName][c] = n;
            sum += n;
        }
        if (has) {
            var max = type === '1-4' ? critCount * 4 : critCount;
            s.scale[scaleName].totalScore = Math.round((sum / max) * 100);
        }
        if (supabaseClient) {
            await supabaseClient.from('students').update({ scale: s.scale })
                .eq('grade', grade).eq('branch', branchName).eq('school_no', s.no);
        }
    }
    await loadAllDataFromSupabase();
    alert('Tekil olcek kaydedildi!');
    renderActivityTable(grade, branchName);
}

async function saveGroupScales(grade, branchName, baseName) {
    var unit = document.getElementById('act-unit-sel').value;
    var section = document.getElementById('act-section-sel').value;
    var subScales = (fenData[grade].activities || []).filter(function(a) {
        return a.unit === unit && a.section === section && (a.name === baseName || a.name.indexOf(baseName + ' -') === 0);
    });
    var students = fenData[grade].branches[branchName];
    for (var i = 0; i < students.length; i++) {
        var input = document.getElementById('quick-' + i);
        if (!input || input.value === '') continue;
        var valText = input.value.trim().toUpperCase();
        var s = students[i];
        if (!s.scale) s.scale = {};
        subScales.forEach(function(sc) {
            if (!s.scale[sc.name]) s.scale[sc.name] = {};
            var critCount = sc.criteria?.length || 4;
            if (valText === 'G') {
                for (var c = 0; c < critCount; c++) s.scale[sc.name][c] = 0;
                s.scale[sc.name].totalScore = 'G';
            } else {
                var target = parseFloat(valText);
                if (isNaN(target)) return;
                if (target < 0) target = 0;
                if (target > 100) target = 100;
                if (sc.scale_type === '1-4') {
                    var max = critCount * 4;
                    var score = Math.round((target / 100) * max);
                    var baseVal = Math.floor(score / critCount);
                    var rem = score % critCount;
                    for (var c2 = 0; c2 < critCount; c2++) {
                        var v2 = baseVal + (c2 < rem ? 1 : 0);
                        if (v2 < 1) v2 = 1; if (v2 > 4) v2 = 4;
                        s.scale[sc.name][c2] = v2;
                    }
                } else {
                    var score2 = Math.round((target / 100) * critCount);
                    for (var c3 = 0; c3 < critCount; c3++) s.scale[sc.name][c3] = c3 < score2 ? 1 : 0;
                }
                s.scale[sc.name].totalScore = Math.round(target);
            }
        });
        if (supabaseClient) {
            await supabaseClient.from('students').update({ scale: s.scale })
                .eq('grade', grade).eq('branch', branchName).eq('school_no', s.no);
        }
    }
    await loadAllDataFromSupabase();
    alert('Olcek puanlari kaydedildi!');
    renderActivityTable(grade, branchName);
}

function loadRepSections(grade, branchName) {
    var unit = document.getElementById('rep-unit-sel').value;
    var sel = document.getElementById('rep-section-sel');
    sel.innerHTML = '<option value="">-- Bolum Secin --</option>';
    var u = fenData[grade]?.units.find(function(x) { return x.name === unit; });
    if (u) u.sections.forEach(function(s) {
        sel.innerHTML += '<option value="' + s + '">' + s + '</option>';
    });
    renderReport(grade, branchName);
}

async function renderReport(grade, branchName) {
    var unit = document.getElementById('rep-unit-sel')?.value;
    var section = document.getElementById('rep-section-sel')?.value;
    var cont = document.getElementById('report-container');
    if (!cont) return;
    if (!unit || !section) {
        cont.innerHTML = '<p style="color:#94a3b8;">Unite ve bolum secin.</p>';
        return;
    }
    var reportText = 'Bu bolum icin henuz rapor sablonu eklenmemis.';
    if (supabaseClient) {
        var res = await supabaseClient.from('report_templates')
            .select('report_text').eq('grade', grade).eq('unit_name', unit).eq('section_name', section).single();
        if (res.data?.report_text) reportText = res.data.report_text;
    }
    var students = fenData[grade]?.branches[branchName] || [];
    var acts = (fenData[grade]?.activities || []).filter(function(a) {
        return a.unit === unit && a.section === section;
    });
    var rows = '';
    var quizSum = 0, quizCnt = 0, scaleSum = 0, scaleCnt = 0, genList = [];
    students.forEach(function(s) {
        var qKey = unit + '_' + section;
        var rawQ = s.quiz?.[qKey];
        var qVal = '-', qNum = null;
        if (rawQ === 'G') qVal = 'G';
        else if (rawQ !== undefined && rawQ !== '') {
            qNum = parseFloat(rawQ);
            if (!isNaN(qNum)) { qVal = qNum; quizSum += qNum; quizCnt++; }
        }
        var sSum = 0, sCnt = 0;
        acts.forEach(function(a) {
            var sc = s.scale?.[a.name]?.totalScore;
            if (sc !== undefined && sc !== 'G') {
                var n = parseFloat(sc);
                if (!isNaN(n)) { sSum += n; sCnt++; }
            }
        });
        var scaleAvg = sCnt > 0 ? Math.round(sSum / sCnt) : null;
        if (scaleAvg !== null) { scaleSum += scaleAvg; scaleCnt++; }
        var gen = null;
        if (qNum !== null && scaleAvg !== null) gen = Math.round(qNum * 0.5 + scaleAvg * 0.5);
        else if (qNum !== null) gen = Math.round(qNum);
        else if (scaleAvg !== null) gen = scaleAvg;
        if (gen !== null) genList.push(gen);
        rows += '<tr>' +
            '<td style="white-space:nowrap;">' + s.no + '</td>' +
            '<td style="white-space:nowrap; text-align:left;">' + s.name + '</td>' +
            '<td>' + getScoreBadge(qVal) + '</td>' +
            '<td>' + (scaleAvg !== null ? getScaleBadge(scaleAvg) : getScoreBadge('-')) + '</td>' +
            '<td>' + (gen !== null ? getScoreBadge(gen) : getScoreBadge('-')) + '</td>' +
        '</tr>';
    });
    var qAvg = quizCnt ? Math.round(quizSum / quizCnt) : '-';
    var sAvg = scaleCnt ? '%' + Math.round(scaleSum / scaleCnt) : '-';
    var low = genList.filter(function(g) { return g < 45; }).length;
    var mid = genList.filter(function(g) { return g >= 45 && g < 70; }).length;
    var high = genList.filter(function(g) { return g >= 70; }).length;
    cont.innerHTML =
        '<div id="report-print" class="print-area">' +
            '<div class="print-header"><h2>FENOMENAL FEN BILIMLERI</h2><h3>Analiz Raporu</h3></div>' +
            '<div class="print-info">' +
                '<p><b>Sube:</b> ' + grade + '. Sinif - ' + branchName + '</p>' +
                '<p><b>Unite:</b> ' + unit + '</p>' +
                '<p><b>Bolum:</b> ' + section + '</p>' +
                '<p><b>Mevcut:</b> ' + students.length + ' | <b>Quiz Ort:</b> ' + qAvg + ' | <b>Olcek Ort:</b> ' + sAvg + '</p>' +
            '</div>' +
            '<div style="overflow-x:auto;"><table class="data-table"><thead><tr><th>No</th><th>Ad Soyad</th><th>Quiz</th><th>Olcek</th><th>Genel</th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
        '</div>' +
        '<div id="report-page2" class="print-area" style="margin-top:16px;">' +
            '<div style="border:1px solid rgba(255,255,255,0.1); border-radius:8px; padding:14px; background:rgba(15,23,42,0.4);">' +
                '<h4 style="margin:0 0 10px; font-size:14px;">Bolum Sonu Resmi Degerlendirme Raporu</h4>' +
                '<div style="font-size:13px; line-height:1.5; white-space:pre-wrap;">' + reportText + '</div>' +
            '</div>' +
            '<div style="display:flex; justify-content:space-around; margin-top:12px; padding:10px; border:1px solid rgba(255,255,255,0.1); border-radius:8px;">' +
                '<span class="badge badge-low">0-45: ' + low + '</span>' +
                '<span class="badge badge-mid">45-70: ' + mid + '</span>' +
                '<span class="badge badge-high">70-100: ' + high + '</span>' +
            '</div>' +
        '</div>' +
        '<div style="margin-top:12px; display:flex; gap:8px; flex-wrap:wrap;">' +
            '<button onclick="exportReportToWord(\'' + branchName + '_Rapor\')" class="auth-btn" style="background:#2563eb; width:auto; padding:8px 14px;">Word</button>' +
            '<button onclick="exportFullReportPDF(\'' + branchName + '_Rapor\')" class="auth-btn" style="background:#dc2626; width:auto; padding:8px 14px;">PDF</button>' +
        '</div>';
}

function exportTableToWord(elementId, filename) {
    var element = document.getElementById(elementId);
    if (!element) return alert('Icerik bulunamadi!');
    var clone = element.cloneNode(true);
    var originalInputs = element.querySelectorAll('input');
    var clonedInputs = clone.querySelectorAll('input');
    for (var i = 0; i < originalInputs.length; i++) {
        var span = document.createElement('span');
        span.innerText = originalInputs[i].value || '-';
        span.style.color = '#000';
        span.style.fontWeight = 'bold';
        if (clonedInputs[i]) clonedInputs[i].parentNode.replaceChild(span, clonedInputs[i]);
    }
    clone.querySelectorAll('button').forEach(function(b) { b.remove(); });
    var styles = '<style>@page{size:A4;margin:1.5cm;}body{font-family:Times New Roman,serif;color:#000;}table{width:100%;border-collapse:collapse;margin-top:10px;}th,td{border:1px solid #000;padding:6px 4px;font-size:11px;text-align:center;}th{background:#f2f2f2;font-weight:bold;}td:nth-child(2){text-align:left;}.print-header{text-align:center;border-bottom:2px solid #000;margin-bottom:10px;}.print-info{border:1px solid #666;padding:8px;margin-bottom:10px;font-size:12px;}</style>';
    var html = '<html><head><meta charset="utf-8"><title>Rapor</title>' + styles + '</head><body>' + clone.outerHTML + '</body></html>';
    saveAs(new Blob(['\ufeff' + html], { type: 'application/msword' }), filename + '.doc');
}

function exportReportToWord(filename) {
    var part1 = document.getElementById('report-print');
    var part2 = document.getElementById('report-page2');
    if (!part1) return alert('Icerik bulunamadi!');
    var reportHtml = '';
    if (part2) {
        var textDiv = part2.querySelector('div[style*="white-space"]') || part2.querySelector('div');
        var rawText = textDiv ? (textDiv.innerText || textDiv.textContent) : '';
        var lines = rawText.split(/\n/).map(function(l) { return l.trim(); }).filter(function(l) { return l.length > 0; });
        lines.forEach(function(line) {
            if (line === line.toUpperCase() && line.length > 8 && line.charAt(0) !== '-' && line.charAt(0) !== '*') {
                reportHtml += '<p style="margin:14px 0 6px 0; font-weight:bold; font-size:13pt;">' + line + '</p>';
            } else if (line.charAt(0) === '-' || line.charAt(0) === '*' || line.charAt(0) === '\u2022') {
                reportHtml += '<p style="margin:3px 0 3px 18px; font-size:11pt;">- ' + line.replace(/^[•\-\*]\s*/, '') + '</p>';
            } else {
                reportHtml += '<p style="margin:6px 0; font-size:11pt;">' + line + '</p>';
            }
        });
    }
    var styles = '<style>@page{size:A4;margin:1.8cm;}body{font-family:Times New Roman,serif;color:#000;font-size:11pt;}table{width:100%;border-collapse:collapse;margin:12px 0;}th,td{border:1px solid #000;padding:6px 5px;font-size:10.5pt;text-align:center;}th{background:#f0f0f0;}td:nth-child(2){text-align:left;}h2{text-align:center;font-size:14pt;}</style>';
    var tableClone = part1.cloneNode(true);
    tableClone.querySelectorAll('button').forEach(function(b) { b.remove(); });
    var html = '<html><head><meta charset="utf-8"><title>Rapor</title>' + styles + '</head><body>' + tableClone.innerHTML + '<br><h2>Bolum Sonu Resmi Degerlendirme Raporu</h2>' + reportHtml + '</body></html>';
    saveAs(new Blob(['\ufeff' + html], { type: 'application/msword' }), filename + '.doc');
}

async function exportTableToPDF(elementId, filename) {
    var el = document.getElementById(elementId);
    if (!el) return alert('Icerik bulunamadi');
    var jsPDF = getJsPDF();
    if (!jsPDF) return alert('jsPDF yuklenemedi');
    var clone = el.cloneNode(true);
    el.querySelectorAll('input').forEach(function(inp, i) {
        var span = document.createElement('span');
        span.textContent = inp.value || '-';
        span.style.cssText = 'color:#000;font-weight:bold;';
        var target = clone.querySelectorAll('input')[i];
        if (target) target.parentNode.replaceChild(span, target);
    });
    clone.querySelectorAll('button').forEach(function(b) { b.remove(); });
    var table = clone.querySelector('table');
    var cols = table ? table.querySelectorAll('th').length : 0;
    var isWide = cols > 5 || filename.indexOf('Olcek') >= 0 || filename.indexOf('Tum') >= 0 || filename.indexOf('Tekil') >= 0;
    var container = document.createElement('div');
    container.style.cssText = 'position:fixed;left:-9999px;top:0;width:' + (isWide ? '1200px' : '850px') + ';background:#ffffff;color:#000;padding:20px;font-family:Arial,sans-serif;z-index:99999;';
    var style = document.createElement('style');
    style.textContent = '*{color:#000!important;background:#ffffff!important;}table{width:100%!important;border-collapse:collapse!important;}th,td{border:1px solid #222!important;padding:7px 5px!important;font-size:12px!important;text-align:center;font-weight:600!important;}th{background:#e8e8e8!important;}td:nth-child(2){text-align:left!important;}.badge,span{background:transparent!important;color:#000!important;font-weight:700!important;}.print-header{text-align:center;border-bottom:2px solid #000;margin-bottom:10px;}.print-info{border:1px solid #555;padding:8px;margin-bottom:10px;font-size:11px;background:#f8f8f8!important;}';
    container.appendChild(style);
    container.appendChild(clone);
    document.body.appendChild(container);
    await new Promise(function(r) { setTimeout(r, 400); });
    try {
        var canvas = await html2canvas(container, { scale: 2.5, useCORS: true, backgroundColor: '#ffffff', logging: false });
        var pdf = new jsPDF({ orientation: isWide ? 'landscape' : 'portrait', unit: 'mm', format: 'a4' });
        var pw = pdf.internal.pageSize.getWidth();
        var ph = pdf.internal.pageSize.getHeight();
        var margin = 10;
        var imgW = pw - margin * 2;
        var imgH = (canvas.height * imgW) / canvas.width;
        if (imgH > ph - margin * 2) {
            imgH = ph - margin * 2;
            imgW = (canvas.width * imgH) / canvas.height;
        }
        pdf.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', (pw - imgW) / 2, (ph - imgH) / 2, imgW, imgH);
        pdf.save(filename + '.pdf');
    } catch (e) {
        alert('PDF hatasi: ' + e.message);
    } finally {
        document.body.removeChild(container);
    }
}

async function exportFullReportPDF(filename) {
    var p1 = document.getElementById('report-print');
    var p2 = document.getElementById('report-page2');
    if (!p1) return alert('Icerik yok');
    var jsPDF = getJsPDF();
    if (!jsPDF) return alert('jsPDF yok');
    var pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    var pw = pdf.internal.pageSize.getWidth();
    var ph = pdf.internal.pageSize.getHeight();
    var margin = 12;
    var usable = ph - margin * 2;
    var c1 = document.createElement('div');
    c1.style.cssText = 'position:fixed;left:-9999px;width:850px;background:#ffffff;padding:20px;font-family:Arial;z-index:99999;';
    c1.innerHTML = '<style>*{color:#000!important;background:#ffffff!important;}table{width:100%;border-collapse:collapse;}th,td{border:1px solid #333;padding:5px;font-size:10px;text-align:center;font-weight:600;}th{background:#e8e8e8;}td:nth-child(2){text-align:left;}.print-header{text-align:center;border-bottom:2px solid #000;margin-bottom:8px;}.print-info{border:1px solid #666;padding:7px;margin-bottom:8px;font-size:10px;background:#f8f8f8;}.badge{background:transparent!important;color:#000!important;font-weight:700;}</style>';
    c1.appendChild(p1.cloneNode(true));
    document.body.appendChild(c1);
    await new Promise(function(r) { setTimeout(r, 350); });
    var canvas1 = await html2canvas(c1, { scale: 2.5, backgroundColor: '#ffffff', logging: false });
    var imgW = pw - margin * 2;
    var imgH = (canvas1.height * imgW) / canvas1.width;
    if (imgH > usable) {
        var sc = usable / imgH;
        pdf.addImage(canvas1.toDataURL('image/jpeg', 0.95), 'JPEG', margin, margin, imgW * sc, usable);
    } else {
        pdf.addImage(canvas1.toDataURL('image/jpeg', 0.95), 'JPEG', margin, margin, imgW, imgH);
    }
    document.body.removeChild(c1);
    if (p2) {
        pdf.addPage();
        var c2 = document.createElement('div');
        c2.style.cssText = 'position:fixed;left:-9999px;width:850px;background:#ffffff;padding:20px;font-family:Arial;z-index:99999;';
        c2.innerHTML = '<style>*{color:#000!important;background:#ffffff!important;}h4{font-size:13px;margin:0 0 8px;}p,div{font-size:11px;line-height:1.45;}.badge{background:transparent!important;color:#000!important;font-weight:700;}</style>';
        c2.appendChild(p2.cloneNode(true));
        document.body.appendChild(c2);
        await new Promise(function(r) { setTimeout(r, 350); });
        var canvas2 = await html2canvas(c2, { scale: 2.5, backgroundColor: '#ffffff', logging: false });
        imgH = (canvas2.height * imgW) / canvas2.width;
        if (imgH > usable) {
            var sc2 = Math.min(0.88, usable / imgH);
            pdf.addImage(canvas2.toDataURL('image/jpeg', 0.95), 'JPEG', (pw - imgW * sc2) / 2, margin, imgW * sc2, imgH * sc2);
        } else {
            pdf.addImage(canvas2.toDataURL('image/jpeg', 0.95), 'JPEG', margin, margin, imgW, imgH);
        }
        document.body.removeChild(c2);
    }
    pdf.save(filename + '.pdf');
}

function globalAddUnit() {
    openModal('Unite Ekle',
        '<select id="m-grade" class="auth-input"><option value="5">5. Sinif</option><option value="6">6. Sinif</option><option value="7">7. Sinif</option><option value="8">8. Sinif</option></select>' +
        '<input type="text" id="m-unit" class="auth-input" placeholder="Unite adi">',
    async function() {
        var g = document.getElementById('m-grade').value;
        var name = document.getElementById('m-unit').value.trim();
        if (!name) return;
        if (supabaseClient) await supabaseClient.from('units_sections').insert([{ grade: g, unit_name: name, section_name: 'Genel' }]);
        await loadAllDataFromSupabase();
        closeModal();
        alert('Unite eklendi');
    });
}

function globalAddSection() {
    openModal('Bolum Ekle',
        '<select id="m-grade" class="auth-input" onchange="fillModalUnits(this.value)"><option value="5">5. Sinif</option><option value="6" selected>6. Sinif</option><option value="7">7. Sinif</option><option value="8">8. Sinif</option></select>' +
        '<select id="m-unit" class="auth-input"><option value="">Unite secin</option></select>' +
        '<input type="text" id="m-section" class="auth-input" placeholder="Bolum adi">',
    async function() {
        var g = document.getElementById('m-grade').value;
        var u = document.getElementById('m-unit').value;
        var s = document.getElementById('m-section').value.trim();
        if (!u || !s) return alert('Unite ve bolum girin');
        if (supabaseClient) await supabaseClient.from('units_sections').insert([{ grade: g, unit_name: u, section_name: s }]);
        await loadAllDataFromSupabase();
        closeModal();
        alert('Bolum eklendi');
    });
    fillModalUnits('6');
}

function fillModalUnits(grade) {
    var sel = document.getElementById('m-unit');
    if (!sel) return;
    sel.innerHTML = '<option value="">Unite secin</option>';
    (fenData[grade]?.units || []).forEach(function(u) {
        sel.innerHTML += '<option value="' + u.name + '">' + u.name + '</option>';
    });
}

function globalAddActivity() {
    openModal('Excel Olcek Yukle',
        '<select id="m-grade" class="auth-input" onchange="fillModalUnitsAct(this.value)"><option value="5">5. Sinif</option><option value="6" selected>6. Sinif</option><option value="7">7. Sinif</option><option value="8">8. Sinif</option></select>' +
        '<select id="m-unit" class="auth-input" onchange="fillModalSectionsAct()"><option value="">Unite</option></select>' +
        '<select id="m-section" class="auth-input"><option value="">Bolum</option></select>' +
        '<input type="file" id="m-file" class="auth-input" accept=".xlsx,.xls">',
    function() {
        var g = document.getElementById('m-grade').value;
        var u = document.getElementById('m-unit').value;
        var s = document.getElementById('m-section').value;
        var file = document.getElementById('m-file').files[0];
        if (!u || !s || !file) return alert('Tum alanlari doldurun');
        var reader = new FileReader();
        reader.onload = async function(e) {
            try {
                var wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
                var count = 0;
                for (var si = 0; si < wb.SheetNames.length; si++) {
                    var sheet = wb.SheetNames[si];
                    var rows = XLSX.utils.sheet_to_json(wb.Sheets[sheet], { header: 1 });
                    var title = sheet.trim();
                    var type = '1-4';
                    var crits = [];
                    for (var ri = 0; ri < rows.length; ri++) {
                        var row = rows[ri];
                        if (!row) continue;
                        for (var ci = 0; ci < row.length; ci++) {
                            var cell = row[ci];
                            if (typeof cell === 'string') {
                                if (cell.indexOf('RUBRIK') >= 0 || cell.indexOf('1-4') >= 0) type = '1-4';
                                if (cell.indexOf('KONTROL') >= 0 || cell.indexOf('VAR') >= 0) type = 'var-yok';
                                if (cell.indexOf('FORMU') >= 0 || cell.indexOf('EVET') >= 0) type = 'evet-hayir';
                                if (cell.indexOf('RUBRIK') >= 0 || cell.indexOf('FORMU') >= 0 || cell.indexOf('OLCEGI') >= 0) {
                                    title = sheet + ' - ' + cell.trim();
                                }
                            }
                        }
                        if (row.some(function(c) { return c && (String(c).indexOf('Okul No') >= 0 || String(c).indexOf('Adi Soyadi') >= 0); })) {
                            crits = row.filter(function(c) {
                                return c && String(c).indexOf('Okul No') < 0 && String(c).indexOf('Adi Soyadi') < 0 && String(c).indexOf('TOPLAM') < 0 && String(c).indexOf('BASARI') < 0;
                            });
                            if (crits.length && supabaseClient) {
                                await supabaseClient.from('activities').insert([{
                                    grade: g, unit_name: u, section_name: s, activity_name: title,
                                    criteria: crits, scale_type: type
                                }]);
                                count++;
                                crits = [];
                            }
                        }
                    }
                    if (count === 0 && rows.length) {
                        await supabaseClient.from('activities').insert([{
                            grade: g, unit_name: u, section_name: s, activity_name: sheet,
                            criteria: ['1. Kriter','2. Kriter','3. Kriter','4. Kriter'], scale_type: '1-4'
                        }]);
                        count++;
                    }
                }
                await loadAllDataFromSupabase();
                closeModal();
                alert(count + ' olcek yuklendi');
            } catch (err) {
                alert('Hata: ' + err.message);
            }
        };
        reader.readAsArrayBuffer(file);
    });
    fillModalUnitsAct('6');
}

function fillModalUnitsAct(grade) {
    var sel = document.getElementById('m-unit');
    if (!sel) return;
    sel.innerHTML = '<option value="">Unite</option>';
    (fenData[grade]?.units || []).forEach(function(u) {
        sel.innerHTML += '<option value="' + u.name + '">' + u.name + '</option>';
    });
    fillModalSectionsAct();
}

function fillModalSectionsAct() {
    var g = document.getElementById('m-grade')?.value;
    var u = document.getElementById('m-unit')?.value;
    var sel = document.getElementById('m-section');
    if (!sel) return;
    sel.innerHTML = '<option value="">Bolum</option>';
    var unit = fenData[g]?.units.find(function(x) { return x.name === u; });
    if (unit) unit.sections.forEach(function(s) {
        sel.innerHTML += '<option value="' + s + '">' + s + '</option>';
    });
}

function globalAddReportTemplate() {
    openModal('Rapor Sablonu Ekle',
        '<select id="r-grade" class="auth-input" onchange="fillRepUnits(this.value)"><option value="5">5. Sinif</option><option value="6">6. Sinif</option><option value="7" selected>7. Sinif</option><option value="8">8. Sinif</option></select>' +
        '<select id="r-unit" class="auth-input" onchange="fillRepSections()"><option value="">Unite</option></select>' +
        '<select id="r-section" class="auth-input"><option value="">Bolum</option></select>' +
        '<textarea id="r-text" class="auth-input" style="height:120px;" placeholder="Rapor metni..."></textarea>',
    async function() {
        var g = document.getElementById('r-grade').value;
        var u = document.getElementById('r-unit').value;
        var s = document.getElementById('r-section').value;
        var t = document.getElementById('r-text').value.trim();
        if (!u || !s || !t) return alert('Tum alanlari doldurun');
        if (supabaseClient) {
            await supabaseClient.from('report_templates').insert([{ grade: g, unit_name: u, section_name: s, report_text: t }]);
        }
        closeModal();
        alert('Rapor sablonu kaydedildi');
    });
    fillRepUnits('7');
}

function fillRepUnits(grade) {
    var sel = document.getElementById('r-unit');
    if (!sel) return;
    sel.innerHTML = '<option value="">Unite</option>';
    (fenData[grade]?.units || []).forEach(function(u) {
        sel.innerHTML += '<option value="' + u.name + '">' + u.name + '</option>';
    });
}

function fillRepSections() {
    var g = document.getElementById('r-grade')?.value;
    var u = document.getElementById('r-unit')?.value;
    var sel = document.getElementById('r-section');
    if (!sel) return;
    sel.innerHTML = '<option value="">Bolum</option>';
    var unit = fenData[g]?.units.find(function(x) { return x.name === u; });
    if (unit) unit.sections.forEach(function(s) {
        sel.innerHTML += '<option value="' + s + '">' + s + '</option>';
    });
}

function globalDeleteManagement() {
    openModal('Silme Yonetimi',
        '<select id="d-grade" class="auth-input" onchange="fillDelUnits(this.value)"><option value="5">5. Sinif</option><option value="6" selected>6. Sinif</option><option value="7">7. Sinif</option><option value="8">8. Sinif</option></select>' +
        '<select id="d-type" class="auth-input" onchange="toggleDel()"><option value="unit">Unite Sil</option><option value="section">Bolum Sil</option><option value="activity">Etkinlik Sil</option><option value="report">Rapor Sil</option></select>' +
        '<div id="d-unit-box"><select id="d-unit" class="auth-input" onchange="fillDelSections()"><option value="">Unite</option></select></div>' +
        '<div id="d-sec-box" style="display:none;"><select id="d-section" class="auth-input"><option value="">Bolum</option></select></div>' +
        '<div id="d-act-box" style="display:none;"><select id="d-act" class="auth-input"><option value="">Etkinlik</option></select></div>',
    async function() {
        var g = document.getElementById('d-grade').value;
        var type = document.getElementById('d-type').value;
        if (type === 'unit') {
            var u = document.getElementById('d-unit').value;
            if (!u || !confirm('Unite ve bagli her sey silinsin mi?')) return;
            if (supabaseClient) {
                await supabaseClient.from('units_sections').delete().eq('grade', g).eq('unit_name', u);
                await supabaseClient.from('activities').delete().eq('grade', g).eq('unit_name', u);
                await supabaseClient.from('report_templates').delete().eq('grade', g).eq('unit_name', u);
            }
        } else if (type === 'section') {
            var u2 = document.getElementById('d-unit').value;
            var s = document.getElementById('d-section').value;
            if (!u2 || !s || !confirm('Bolum silinsin mi?')) return;
            if (supabaseClient) {
                await supabaseClient.from('units_sections').delete().eq('grade', g).eq('unit_name', u2).eq('section_name', s);
                await supabaseClient.from('activities').delete().eq('grade', g).eq('unit_name', u2).eq('section_name', s);
                await supabaseClient.from('report_templates').delete().eq('grade', g).eq('unit_name', u2).eq('section_name', s);
            }
        } else if (type === 'activity') {
            var a = document.getElementById('d-act').value;
            if (!a || !confirm('Etkinlik silinsin mi?')) return;
            if (supabaseClient) {
                await supabaseClient.from('activities').delete().eq('grade', g).eq('activity_name', a);
                await supabaseClient.from('activities').delete().eq('grade', g).ilike('activity_name', a + ' -%');
            }
        } else if (type === 'report') {
            var u3 = document.getElementById('d-unit').value;
            var s2 = document.getElementById('d-section').value;
            if (!u3 || !s2 || !confirm('Rapor silinsin mi?')) return;
            if (supabaseClient) {
                await supabaseClient.from('report_templates').delete().eq('grade', g).eq('unit_name', u3).eq('section_name', s2);
            }
        }
        await loadAllDataFromSupabase();
        closeModal();
        alert('Silindi');
    });
    fillDelUnits('6');
    toggleDel();
}

function fillDelUnits(grade) {
    var sel = document.getElementById('d-unit');
    if (!sel) return;
    sel.innerHTML = '<option value="">Unite</option>';
    (fenData[grade]?.units || []).forEach(function(u) {
        sel.innerHTML += '<option value="' + u.name + '">' + u.name + '</option>';
    });
}

function fillDelSections() {
    var g = document.getElementById('d-grade')?.value;
    var u = document.getElementById('d-unit')?.value;
    var sel = document.getElementById('d-section');
    if (!sel) return;
    sel.innerHTML = '<option value="">Bolum</option>';
    var unit = fenData[g]?.units.find(function(x) { return x.name === u; });
    if (unit) unit.sections.forEach(function(s) {
        sel.innerHTML += '<option value="' + s + '">' + s + '</option>';
    });
    var actSel = document.getElementById('d-act');
    if (actSel) {
        actSel.innerHTML = '<option value="">Etkinlik</option>';
        var acts = (fenData[g]?.activities || []).filter(function(a) { return a.unit === u; });
        var bases = new Set();
        acts.forEach(function(a) {
            var p = a.name.split(' - ');
            bases.add(p.length >= 2 ? p[0] + ' - ' + p[1] : a.name);
        });
        bases.forEach(function(b) {
            actSel.innerHTML += '<option value="' + b + '">' + b + '</option>';
        });
    }
}

function toggleDel() {
    var type = document.getElementById('d-type')?.value;
    document.getElementById('d-sec-box').style.display = (type === 'section' || type === 'activity' || type === 'report') ? 'block' : 'none';
    document.getElementById('d-act-box').style.display = type === 'activity' ? 'block' : 'none';
}

function renderStudentPanelView(grade, branch, student, push) {
    if (push) saveState({ type: 'student', grade: grade, branch: branch, student: student });
    document.getElementById('auth-screen').style.display = 'none';
    document.getElementById('teacher-panel').style.display = 'none';
    document.getElementById('grade-detail-panel').style.display = 'none';
    var panel = document.getElementById('student-panel');
    panel.style.display = 'flex';

    var units = fenData[grade]?.units || [];
    var quizRows = '', qSum = 0, qCnt = 0;
    var chartLabels = [];
    var chartValues = [];

    units.forEach(function(u) {
        (u.sections || []).forEach(function(sec) {
            var key = u.name + '_' + sec;
            if (student.quiz?.[key] !== undefined && student.quiz[key] !== '') {
                var sc = student.quiz[key];
                quizRows += '<tr><td style="text-align:left; line-height:1.35;"><b>' + u.name + '</b><br><span style="font-size:12px; color:#94a3b8;">' + sec + '</span></td><td>' + getScoreBadge(sc) + '</td></tr>';
                if (sc !== 'G') {
                    var num = parseFloat(sc);
                    if (!isNaN(num)) {
                        qSum += num;
                        qCnt++;
                        var shortLabel = sec.length > 18 ? sec.substring(0, 16) + '...' : sec;
                        chartLabels.push(shortLabel);
                        chartValues.push(num);
                    }
                }
            }
        });
    });
    var qAvg = qCnt ? Math.round(qSum / qCnt) : 0;

    var scaleRows = '', sSum = 0, sCnt = 0;
    units.forEach(function(u) {
        (u.sections || []).forEach(function(sec) {
            var acts = (fenData[grade]?.activities || []).filter(function(a) {
                return a.unit === u.name && a.section === sec;
            });
            var activityGroups = {};
            acts.forEach(function(a) {
                var baseName = a.name;
                if (baseName.indexOf(' - ') >= 0) {
                    var parts = baseName.split(' - ');
                    if (parts.length >= 2) baseName = parts[0] + ' - ' + parts[1];
                }
                if (!activityGroups[baseName]) {
                    activityGroups[baseName] = { scores: [], unit: u.name, section: sec };
                }
                var sc = student.scale?.[a.name]?.totalScore;
                if (sc !== undefined && sc !== '' && sc !== null && sc !== 'G') {
                    var num = parseFloat(sc);
                    if (!isNaN(num)) activityGroups[baseName].scores.push(num);
                }
            });
            Object.keys(activityGroups).forEach(function(baseName) {
                var group = activityGroups[baseName];
                if (group.scores.length === 0) return;
                var avg = Math.round(group.scores.reduce(function(a, b) { return a + b; }, 0) / group.scores.length);
                scaleRows += '<tr>' +
                    '<td style="text-align:left; line-height:1.35; padding:8px 6px;">' +
                        '<b style="font-size:13px;">' + group.unit + '</b><br>' +
                        '<span style="font-size:12px; color:#94a3b8;">' + group.section + '</span><br>' +
                        '<span style="font-size:12px; color:#60a5fa;">' + baseName + '</span>' +
                    '</td>' +
                    '<td>' + getScaleBadge(avg) + '</td>' +
                '</tr>';
                sSum += avg;
                sCnt++;
            });
        });
    });
    var sAvg = sCnt ? Math.round(sSum / sCnt) : 0;
    var gen = 0;
    if (qCnt && sCnt) gen = Math.round(qAvg * 0.5 + sAvg * 0.5);
    else if (qCnt) gen = qAvg;
    else if (sCnt) gen = sAvg;
    var safeName = (student.name || 'Ogrenci').replace(/\s+/g, '_');

    var badgeTitle = '', badgeEmoji = '', badgeColor = '';
    if (gen >= 90) { badgeTitle = 'Fen Yildizi'; badgeEmoji = '*'; badgeColor = '#fbbf24'; }
    else if (gen >= 80) { badgeTitle = 'Bilim Meraklisi'; badgeEmoji = '*'; badgeColor = '#34d399'; }
    else if (gen >= 70) { badgeTitle = 'Iyi Gidiyorsun'; badgeEmoji = '*'; badgeColor = '#60a5fa'; }
    else if (gen >= 50) { badgeTitle = 'Gelisiyor'; badgeEmoji = '*'; badgeColor = '#a78bfa'; }
    else { badgeTitle = 'Desteklenmeli'; badgeEmoji = '*'; badgeColor = '#f87171'; }

    var plusBadge = '';
    if (student.plus >= 5) {
        plusBadge = '<div style="margin-top:8px;"><span style="display:inline-block; background:#166534; color:#86efac; padding:4px 12px; border-radius:20px; font-size:12px; font-weight:600;">Aktif Katilimci (+' + student.plus + ')</span></div>';
    }

    var chartHtml = '';
    if (chartValues.length > 0) {
        var w = 280, h = 160, pad = 28;
        var maxY = 100;
        var stepX = chartValues.length > 1 ? (w - pad * 2) / (chartValues.length - 1) : 0;
        var points = '';
        var circles = '';
        chartValues.forEach(function(v, i) {
            var x = pad + i * stepX;
            var y = h - pad - (v / maxY) * (h - pad * 2);
            points += (i === 0 ? '' : ' ') + x + ',' + y;
            circles += '<circle cx="' + x + '" cy="' + y + '" r="4" fill="#3b82f6" stroke="#fff" stroke-width="1.5"/>';
            circles += '<text x="' + x + '" y="' + (y - 10) + '" text-anchor="middle" fill="#e2e8f0" font-size="10" font-weight="600">' + v + '</text>';
        });
        var xLabels = '';
        chartLabels.forEach(function(lab, i) {
            var x = pad + i * stepX;
            xLabels += '<text x="' + x + '" y="' + (h - 6) + '" text-anchor="middle" fill="#94a3b8" font-size="8">' + lab + '</text>';
        });
        chartHtml =
            '<div style="flex:1; min-width:260px; background:rgba(15,23,42,0.5); border:1px solid rgba(255,255,255,0.08); border-radius:12px; padding:12px;">' +
                '<div style="font-size:12px; color:#94a3b8; margin-bottom:6px; text-align:center;">Quiz Gelisim Grafigi</div>' +
                '<svg width="100%" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '" style="display:block;">' +
                    '<line x1="' + pad + '" y1="' + pad + '" x2="' + (w-pad) + '" y2="' + pad + '" stroke="#334155" stroke-width="1"/>' +
                    '<line x1="' + pad + '" y1="' + (h/2) + '" x2="' + (w-pad) + '" y2="' + (h/2) + '" stroke="#334155" stroke-width="1" stroke-dasharray="4"/>' +
                    '<line x1="' + pad + '" y1="' + (h-pad) + '" x2="' + (w-pad) + '" y2="' + (h-pad) + '" stroke="#334155" stroke-width="1"/>' +
                    '<text x="4" y="' + (pad+4) + '" fill="#64748b" font-size="9">100</text>' +
                    '<text x="4" y="' + (h/2+3) + '" fill="#64748b" font-size="9">50</text>' +
                    '<text x="8" y="' + (h-pad+3) + '" fill="#64748b" font-size="9">0</text>' +
                    '<polyline points="' + points + '" fill="none" stroke="#3b82f6" stroke-width="2.5" stroke-linejoin="round"/>' +
                    circles + xLabels +
                '</svg>' +
            '</div>';
    }

    panel.innerHTML =
        '<header class="teacher-header">' +
            '<div class="header-brand"><h1>' + student.name + '</h1></div>' +
            '<button onclick="logoutStudent()" class="logout-btn">Cikis</button>' +
        '</header>' +
        '<section class="dashboard-content" style="max-width:900px; margin:0 auto;">' +
            '<div id="student-print" class="print-area">' +
                '<div class="print-header">' +
                    '<h2>FENOMENAL FEN BILIMLERI</h2>' +
                    '<h3>Ogrenci Karnesi</h3>' +
                '</div>' +
                '<div style="display:flex; gap:14px; flex-wrap:wrap; align-items:stretch; margin-bottom:8px;">' +
                    '<div class="print-info" style="flex:1; min-width:220px;">' +
                        '<p><b>Ad:</b> ' + student.name + '</p>' +
                        '<p><b>No / Sube:</b> ' + student.no + ' | ' + grade + '. Sinif - ' + branch + '</p>' +
                        '<p><b>Quiz Ort:</b> ' + (qCnt ? qAvg : '-') + '</p>' +
                        '<p><b>Olcek Ort:</b> ' + (sCnt ? '%' + sAvg : '-') + '</p>' +
                        '<p><b>Genel:</b> ' + getScoreBadge(gen) + '</p>' +
                        '<p><b>Arti / Eksi:</b> ' + student.plus + ' / ' + student.minus + '</p>' +
                        '<div style="margin-top:12px;">' +
                            '<span style="display:inline-flex; align-items:center; gap:8px; background:rgba(255,255,255,0.07); padding:7px 14px; border-radius:20px; border:1px solid ' + badgeColor + ';">' +
                                '<span style="font-size:20px;">' + badgeEmoji + '</span>' +
                                '<span style="font-weight:600; color:' + badgeColor + '; font-size:14px;">' + badgeTitle + '</span>' +
                            '</span>' +
                        '</div>' +
                        plusBadge +
                    '</div>' +
                    chartHtml +
                '</div>' +
                '<h4 style="margin:16px 0 6px; font-size:14px;">Quiz Sonuclari</h4>' +
                '<table class="data-table">' +
                    '<thead><tr><th style="text-align:left;">Unite / Bolum</th><th>Not</th></tr></thead>' +
                    '<tbody>' + (quizRows || '<tr><td colspan="2">Yok</td></tr>') + '</tbody>' +
                '</table>' +
                '<h4 style="margin:18px 0 6px; font-size:14px;">Olcek Ortalamalari</h4>' +
                '<table class="data-table">' +
                    '<thead><tr><th style="text-align:left;">Unite / Bolum / Etkinlik</th><th>Ort</th></tr></thead>' +
                    '<tbody>' + (scaleRows || '<tr><td colspan="2">Yok</td></tr>') + '</tbody>' +
                '</table>' +
            '</div>' +
            '<div style="text-align:center; margin-top:18px; display:flex; gap:10px; justify-content:center; flex-wrap:wrap;">' +
                '<button onclick="exportTableToWord(\'student-print\', \'' + safeName + '_Karne\')" class="auth-btn" style="background:#2563eb; width:auto; padding:10px 18px;">Word</button>' +
                '<button onclick="exportTableToPDF(\'student-print\', \'' + safeName + '_Karne\')" class="auth-btn" style="background:#dc2626; width:auto; padding:10px 18px;">PDF</button>' +
            '</div>' +
        '</section>';
}

document.addEventListener('DOMContentLoaded', async function() {
    try {
        await loadAllDataFromSupabase();
        console.log('Veri yuklendi', fenData);
    } catch (e) {
        console.error('Veri yukleme hatasi:', e);
    }
    var gradeSel = document.getElementById('student-grade');
    if (gradeSel) {
        gradeSel.addEventListener('change', function() {
            updateStudentBranches();
        });
    }
    ['teacher-email', 'teacher-password'].forEach(function(id) {
        var el = document.getElementById(id);
        if (el) {
            el.addEventListener('keydown', function(e) {
                if (e.key === 'Enter') teacherLogin();
            });
        }
    });
    restoreStateFromSession();
});
