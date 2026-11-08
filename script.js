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

// ====================== VERİ YÜKLEME ======================
async function loadAllDataFromSupabase() {
    if (!supabaseClient) return;
    try {
        ['5','6','7','8'].forEach(g => {
            fenData[g].units = [];
            fenData[g].activities = [];
            fenData[g].branches = {};
        });

        const { data: branchRows } = await supabaseClient.from('branches').select('*');
        if (branchRows) {
            branchRows.forEach(row => {
                if (!row.grade || !row.branch_name) return;
                if (!fenData[row.grade]) fenData[row.grade] = { units:[], activities:[], branches:{} };
                if (!fenData[row.grade].branches[row.branch_name]) {
                    fenData[row.grade].branches[row.branch_name] = [];
                }
            });
        }

        const { data: studentRows } = await supabaseClient.from('students').select('*');
        if (studentRows) {
            studentRows.forEach(row => {
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
            Object.keys(fenData).forEach(g => {
                Object.keys(fenData[g].branches).forEach(b => {
                    fenData[g].branches[b].sort((a, b) => parseInt(a.no) - parseInt(b.no));
                });
            });
        }

        const { data: unitRows } = await supabaseClient.from('units_sections').select('*');
        if (unitRows) {
            const unitMap = {};
            unitRows.forEach(row => {
                if (!row.grade || !row.unit_name) return;
                if (!unitMap[row.grade]) unitMap[row.grade] = {};
                if (!unitMap[row.grade][row.unit_name]) unitMap[row.grade][row.unit_name] = [];
                if (row.section_name && row.section_name !== 'Genel' && !unitMap[row.grade][row.unit_name].includes(row.section_name)) {
                    unitMap[row.grade][row.unit_name].push(row.section_name);
                }
            });
            Object.keys(unitMap).forEach(g => {
                Object.keys(unitMap[g]).forEach(uName => {
                    fenData[g].units.push({ name: uName, sections: unitMap[g][uName] });
                });
            });
        }

        const { data: actRows } = await supabaseClient.from('activities').select('*');
        if (actRows) {
            actRows.forEach(row => {
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
        console.error('Veri yükleme hatası:', err);
    }
}

// ====================== YARDIMCI ======================
function getScoreBadge(score) {
    if (score === 'G') return '<span class="badge badge-neutral">G</span>';
    if (score === '-' || score === '' || score == null) return '<span class="badge badge-neutral">-</span>';
    const num = parseFloat(score);
    if (isNaN(num)) return '<span class="badge badge-neutral">' + score + '</span>';
    if (num >= 85) return '<span class="badge badge-high">' + num + '</span>';
    if (num >= 50) return '<span class="badge badge-mid">' + num + '</span>';
    return '<span class="badge badge-low">' + num + '</span>';
}

function getScaleBadge(score) {
    if (score === 'G') return '<span class="badge badge-neutral">G</span>';
    if (score === '-' || score === '' || score == null) return '<span class="badge badge-neutral">-</span>';
    const num = parseFloat(score);
    if (isNaN(num)) return '<span class="badge badge-neutral">' + score + '</span>';
    if (num >= 85) return '<span class="badge badge-high">%' + num + '</span>';
    if (num >= 50) return '<span class="badge badge-mid">%' + num + '</span>';
    return '<span class="badge badge-low">%' + num + '</span>';
}

function validateScoreInput(el) {
    let val = el.value.trim().toUpperCase();
    if (val === 'G' || val === '') return;
    let num = parseFloat(val);
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

// ====================== HISTORY ======================
function saveState(state) {
    sessionStorage.setItem('fen_app_state', JSON.stringify(state));
    history.pushState(state, '', '#' + (state.type || 'giris'));
}

function restoreStateFromSession() {
    const saved = sessionStorage.getItem('fen_app_state');
    if (!saved) {
        renderAuthScreenView(false);
        return;
    }
    try {
        const state = JSON.parse(saved);
        applyState(state, false);
    } catch (e) {
        renderAuthScreenView(false);
    }
}

function applyState(state, push) {
    if (!state || !state.type) {
        renderAuthScreenView(push);
        return;
    }
    switch (state.type) {
        case 'teacher':
            renderTeacherPanelView(push);
            break;
        case 'grade-mgmt':
            openGradeManagement(state.grade, push);
            break;
        case 'branch-menu':
            openBranchMenu(state.grade, state.branchName, push);
            break;
        case 'branch-detail':
            openBranchDetail(state.grade, state.branchName, state.tab || 'students', push);
            break;
        case 'student':
            renderStudentPanelView(state.grade, state.branch, state.student, push);
            break;
        default:
            renderAuthScreenView(push);
    }
}

window.addEventListener('popstate', (event) => {
    if (event.state) {
        applyState(event.state, false);
    } else {
        restoreStateFromSession();
    }
});

// ====================== AUTH ======================
function switchAuthTab(role) {
    const sBtn = document.getElementById('btn-student-tab');
    const tBtn = document.getElementById('btn-teacher-tab');
    const sForm = document.getElementById('student-auth-form');
    const tForm = document.getElementById('teacher-auth-form');
    if (!sBtn || !tBtn || !sForm || !tForm) return;

    if (role === 'student') {
        sBtn.classList.add('active');
        tBtn.classList.remove('active');
        sForm.style.display = 'block';
        tForm.style.display = 'none';
        updateStudentBranches();
    } else {
        tBtn.classList.add('active');
        sBtn.classList.remove('active');
        tForm.style.display = 'block';
        sForm.style.display = 'none';
    }
}

function updateStudentBranches() {
    const grade = document.getElementById('student-grade')?.value;
    const branchSel = document.getElementById('student-branch');
    if (!branchSel) return;
    branchSel.innerHTML = '<option value="">-- Şube Seçin --</option>';
    if (grade && fenData[grade]?.branches) {
        Object.keys(fenData[grade].branches).forEach(b => {
            const short = b.split('/')[1] || b;
            branchSel.innerHTML += '<option value="' + b + '">' + short + ' Şubesi</option>';
        });
    }
}

async function teacherLogin() {
    const email = document.getElementById('teacher-email')?.value.trim();
    const password = document.getElementById('teacher-password')?.value.trim();
    if (!email || !password) return alert('E-posta ve şifre girin.');
    try {
        if (supabaseClient) {
            const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
            if (error) return alert('Giriş başarısız: ' + error.message);
        }
        await loadAllDataFromSupabase();
        renderTeacherPanelView(true);
    } catch (e) {
        alert('Giriş hatası');
    }
}

async function studentLogin() {
    const grade = document.getElementById('student-grade')?.value;
    const branch = document.getElementById('student-branch')?.value;
    const no = parseInt(document.getElementById('student-number')?.value);
    const name = document.getElementById('student-name')?.value.trim().toUpperCase();

    if (!grade || !branch || !no || !name) return alert('Tüm alanları doldurun.');

    await loadAllDataFromSupabase();
    const list = fenData[grade]?.branches?.[branch] || [];
    const found = list.find(s => parseInt(s.no) === no && s.name.trim().toUpperCase() === name);
    if (!found) return alert('Öğrenci bulunamadı.');

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

function renderAuthScreenView(push = true) {
    if (push) saveState({ type: 'auth' });
    document.getElementById('auth-screen').style.display = 'flex';
    document.getElementById('teacher-panel').style.display = 'none';
    document.getElementById('grade-detail-panel').style.display = 'none';
    document.getElementById('student-panel').style.display = 'none';
    closeModal();
}

function renderTeacherPanelView(push = true) {
    if (push) saveState({ type: 'teacher' });
    document.getElementById('auth-screen').style.display = 'none';
    document.getElementById('grade-detail-panel').style.display = 'none';
    document.getElementById('student-panel').style.display = 'none';
    document.getElementById('teacher-panel').style.display = 'flex';
    closeModal();
}

function toggleTeacherActionsCard() {
    const cont = document.getElementById('teacher-actions-container');
    const icon = document.getElementById('teacher-actions-toggle-icon');
    if (!cont) return;
    const open = cont.style.display !== 'none';
    cont.style.display = open ? 'none' : 'block';
    if (icon) icon.style.transform = open ? 'rotate(0deg)' : 'rotate(180deg)';
}

// ====================== MODAL ======================
function openModal(title, html, onConfirm) {
    document.getElementById('modal-title').innerText = title;
    document.getElementById('modal-body').innerHTML = html;
    const btn = document.getElementById('modal-confirm-btn');
    const newBtn = btn.cloneNode(true);
    btn.parentNode.replaceChild(newBtn, btn);
    if (onConfirm) {
        newBtn.style.display = 'inline-block';
        newBtn.onclick = onConfirm;
    } else {
        newBtn.style.display = 'none';
    }
    document.getElementById('app-modal').style.display = 'flex';
}

function closeModal() {
    document.getElementById('app-modal').style.display = 'none';
}

// ====================== SINIF & ŞUBE ======================
function openGradeManagement(grade, push = true) {
    if (push) saveState({ type: 'grade-mgmt', grade: grade });
    const panel = document.getElementById('grade-detail-panel');
    document.getElementById('teacher-panel').style.display = 'none';
    document.getElementById('auth-screen').style.display = 'none';
    document.getElementById('student-panel').style.display = 'none';
    panel.style.display = 'flex';

    let cards = '';
    const branches = fenData[grade]?.branches || {};
    Object.keys(branches).forEach(bName => {
        cards += `
            <div class="grade-card" style="position:relative; border-top-color:#3b82f6;">
                <div onclick="openBranchMenu('${grade}','${bName}')" style="cursor:pointer;">
                    <h3>${bName} Şubesi</h3>
                    <p>${branches[bName].length} Öğrenci</p>
                    <span class="card-action">Şubeye Git →</span>
                </div>
                <button onclick="event.stopPropagation(); deleteBranch('${grade}','${bName}')" 
                    style="position:absolute; top:8px; right:8px; background:#ef4444; color:white; border:none; border-radius:4px; padding:2px 6px; font-size:11px; cursor:pointer;">Sil</button>
            </div>`;
    });

    panel.innerHTML = `
        <header class="teacher-header">
            <div class="header-brand"><h1>${grade}. Sınıflar</h1></div>
            <div>
                <button onclick="renderTeacherPanelView(true)" class="logout-btn" style="background:#3b82f6; margin-right:6px;">Geri</button>
                <button onclick="logout()" class="logout-btn">Çıkış</button>
            </div>
        </header>
        <section class="dashboard-content">
            <button onclick="addNewBranchModal('${grade}')" class="auth-btn" style="width:auto; padding:8px 16px; background:#059669; margin-bottom:14px;">+ Yeni Şube Ekle</button>
            <div class="grade-cards-grid">${cards || '<p style="color:#94a3b8;">Henüz şube yok.</p>'}</div>
        </section>`;
}

function addNewBranchModal(grade) {
    openModal('Yeni Şube Ekle', `
        <label style="font-size:13px; color:#cbd5e1;">Şube Adı (A, B, C...)</label>
        <input type="text" id="modal-branch-name" class="auth-input" placeholder="A">
    `, async () => {
        const name = document.getElementById('modal-branch-name').value.trim().toUpperCase();
        if (!name) return;
        const full = grade + '/' + name;
        if (supabaseClient) {
            const { error } = await supabaseClient.from('branches').insert([{ grade: grade, branch_name: full }]);
            if (error) return alert(error.message);
        }
        await loadAllDataFromSupabase();
        closeModal();
        openGradeManagement(grade, false);
    });
}

async function deleteBranch(grade, bName) {
    if (!confirm(bName + ' şubesini silmek istediğinize emin misiniz?')) return;
    if (supabaseClient) {
        await supabaseClient.from('branches').delete().eq('grade', grade).eq('branch_name', bName);
        await supabaseClient.from('students').delete().eq('grade', grade).eq('branch', bName);
    }
    await loadAllDataFromSupabase();
    openGradeManagement(grade, false);
}

function openBranchMenu(grade, branchName, push = true) {
    if (push) saveState({ type: 'branch-menu', grade: grade, branchName: branchName });
    const panel = document.getElementById('grade-detail-panel');
    panel.style.display = 'flex';
    document.getElementById('teacher-panel').style.display = 'none';
    document.getElementById('auth-screen').style.display = 'none';
    document.getElementById('student-panel').style.display = 'none';

    panel.innerHTML = `
        <header class="teacher-header">
            <div class="header-brand"><h1>${grade}. Sınıf - ${branchName}</h1></div>
            <div>
                <button onclick="openGradeManagement('${grade}', true)" class="logout-btn" style="background:#3b82f6; margin-right:6px;">Geri</button>
                <button onclick="logout()" class="logout-btn">Çıkış</button>
            </div>
        </header>
        <section class="dashboard-content">
            <div class="grade-cards-grid">
                <div class="grade-card" onclick="openBranchDetail('${grade}','${branchName}','students', true)" style="border-top-color:#3b82f6;">
                    <div style="font-size:24px; margin-bottom:6px;">👥</div>
                    <h3>Sınıf Listesi & Artı/Eksi</h3>
                    <span class="card-action">Git →</span>
                </div>
                <div class="grade-card" onclick="openBranchDetail('${grade}','${branchName}','quizzes', true)" style="border-top-color:#8b5cf6;">
                    <div style="font-size:24px; margin-bottom:6px;">📝</div>
                    <h3>Quiz Sonuçları</h3>
                    <span class="card-action">Git →</span>
                </div>
                <div class="grade-card" onclick="openBranchDetail('${grade}','${branchName}','activities', true)" style="border-top-color:#10b981;">
                    <div style="font-size:24px; margin-bottom:6px;">🧪</div>
                    <h3>Etkinlik Ölçekleri</h3>
                    <span class="card-action">Git →</span>
                </div>
                <div class="grade-card" onclick="openBranchDetail('${grade}','${branchName}','reports', true)" style="border-top-color:#f59e0b;">
                    <div style="font-size:24px; margin-bottom:6px;">📊</div>
                    <h3>Raporlar & Analiz</h3>
                    <span class="card-action">Git →</span>
                </div>
            </div>
        </section>`;
}

function openBranchDetail(grade, branchName, tab, push = true) {
    if (push) saveState({ type: 'branch-detail', grade: grade, branchName: branchName, tab: tab });
    const panel = document.getElementById('grade-detail-panel');
    panel.style.display = 'flex';
    document.getElementById('teacher-panel').style.display = 'none';
    document.getElementById('auth-screen').style.display = 'none';
    document.getElementById('student-panel').style.display = 'none';

    panel.innerHTML = `
        <header class="teacher-header">
            <div class="header-brand"><h1>${grade}. Sınıf - ${branchName}</h1></div>
            <div>
                <button onclick="openBranchMenu('${grade}','${branchName}', true)" class="logout-btn" style="background:#3b82f6; margin-right:6px;">Menü</button>
                <button onclick="logout()" class="logout-btn">Çıkış</button>
            </div>
        </header>
        <section class="dashboard-content">
            <div id="branch-tab-content" style="background:rgba(30,41,59,0.7); padding:16px; border-radius:12px; border:1px solid rgba(255,255,255,0.08);"></div>
        </section>`;
    loadBranchTabContent(tab, grade, branchName);
}

// ====================== ÖĞRENCİ LİSTESİ ======================
function loadBranchTabContent(tab, grade, branchName) {
    const content = document.getElementById('branch-tab-content');
    if (!content) return;

    const units = fenData[grade]?.units || [];
    let unitOpts = '<option value="">-- Ünite Seçin --</option>';
    units.forEach(u => unitOpts += '<option value="' + u.name + '">' + u.name + '</option>');

    if (tab === 'students') {
        const students = fenData[grade]?.branches[branchName] || [];
        let rows = '';
        students.forEach((s, idx) => {
            rows += `
                <tr>
                    <td style="white-space:nowrap;">${s.no}</td>
                    <td style="white-space:nowrap; text-align:left; min-width:150px;">${s.name}</td>
                    <td style="white-space:nowrap;">
                        <button class="btn-pastel-green" onclick="updatePoint('${grade}','${branchName}',${idx},'plus')">+</button>
                        <span style="margin:0 6px; font-weight:600;">${s.plus}</span>
                    </td>
                    <td style="white-space:nowrap;">
                        <button class="btn-pastel-red" onclick="updatePoint('${grade}','${branchName}',${idx},'minus')">-</button>
                        <span style="margin:0 6px; font-weight:600;">${s.minus}</span>
                    </td>
                    <td><button class="btn-pastel-gray" onclick="deleteStudent('${grade}','${branchName}',${idx})">Sil</button></td>
                </tr>`;
        });

        content.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; flex-wrap:wrap; gap:8px;">
                <h3 style="margin:0; font-size:15px;">Öğrenci Listesi</h3>
                <div style="display:flex; gap:6px;">
                    <button onclick="openBulkStudentModal('${grade}','${branchName}')" class="auth-btn" style="width:auto; padding:6px 10px; background:#059669; font-size:12px;">📋 e-Okul</button>
                    <button onclick="addStudentModal('${grade}','${branchName}')" class="auth-btn" style="width:auto; padding:6px 10px; background:#2563eb; font-size:12px;">+ Öğrenci</button>
                </div>
            </div>
            <div style="overflow-x:auto;">
                <table class="data-table" id="export-students">
                    <thead><tr><th>No</th><th>Ad Soyad</th><th>Artı</th><th>Eksi</th><th>İşlem</th></tr></thead>
                    <tbody>${rows || '<tr><td colspan="5">Öğrenci yok</td></tr>'}</tbody>
                </table>
            </div>
            <div style="margin-top:12px; display:flex; gap:8px; flex-wrap:wrap;">
                <button onclick="exportTableToWord('export-students','${branchName}_Ogrenci')" class="auth-btn" style="background:#2563eb; width:auto; padding:7px 12px;">📥 Word</button>
                <button onclick="exportTableToPDF('export-students','${branchName}_Ogrenci')" class="auth-btn" style="background:#dc2626; width:auto; padding:7px 12px;">📄 PDF</button>
            </div>`;
    }
    else if (tab === 'quizzes') {
        content.innerHTML = `
            <h3 style="margin-bottom:8px; font-size:15px;">📝 Quiz Sonuçları</h3>
            <select id="quiz-unit-sel" class="auth-input" onchange="loadQuizSections('${grade}','${branchName}')">${unitOpts}</select>
            <select id="quiz-section-sel" class="auth-input" onchange="renderQuizTable('${grade}','${branchName}')">
                <option value="">-- Bölüm Seçin --</option>
            </select>
            <div id="quiz-table-container" style="margin-top:14px;"></div>`;
    }
    else if (tab === 'activities') {
        content.innerHTML = `
            <h3 style="margin-bottom:8px; font-size:15px;">🧪 Etkinlik Ölçekleri</h3>
            <select id="act-unit-sel" class="auth-input" onchange="loadActSections('${grade}','${branchName}')">${unitOpts}</select>
            <select id="act-section-sel" class="auth-input" onchange="loadActNames('${grade}','${branchName}')">
                <option value="">-- Bölüm Seçin --</option>
            </select>
            <select id="act-name-sel" class="auth-input" onchange="loadSubScales('${grade}','${branchName}')">
                <option value="">-- Etkinlik Seçin --</option>
            </select>
            <select id="sub-scale-sel" class="auth-input" onchange="renderActivityTable('${grade}','${branchName}')">
                <option value="--TUM--">-- Tüm Ölçekler --</option>
            </select>
            <div id="activity-table-container" style="margin-top:14px;"></div>`;
    }
    else if (tab === 'reports') {
        content.innerHTML = `
            <h3 style="margin-bottom:8px; font-size:15px;">📊 Raporlar</h3>
            <select id="rep-unit-sel" class="auth-input" onchange="loadRepSections('${grade}','${branchName}')">${unitOpts}</select>
            <select id="rep-section-sel" class="auth-input" onchange="renderReport('${grade}','${branchName}')">
                <option value="">-- Bölüm Seçin --</option>
            </select>
            <div id="report-container" style="margin-top:14px;"></div>`;
    }
}

// ====================== ÖĞRENCİ EKLEME ======================
function addStudentModal(grade, branchName) {
    openModal('Öğrenci Ekle', `
        <input type="number" id="s-no" class="auth-input" placeholder="Okul No">
        <input type="text" id="s-name" class="auth-input" placeholder="Ad Soyad">
    `, async () => {
        const no = parseInt(document.getElementById('s-no').value);
        const name = document.getElementById('s-name').value.trim().toUpperCase();
        if (!no || !name) return alert('Alanları doldurun');
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
    openModal('Toplu Öğrenci (e-Okul)', `
        <p style="font-size:12px; color:#94a3b8; margin-bottom:8px;">Okul No + Tab + Ad Soyad şeklinde yapıştırın</p>
        <textarea id="bulk-text" class="auth-input" style="height:140px; font-family:monospace;"></textarea>
    `, async () => {
        const text = document.getElementById('bulk-text').value.trim();
        if (!text) return;
        const lines = text.split('\n');
        let count = 0;
        for (const line of lines) {
            let parts = line.split('\t');
            if (parts.length < 2) parts = line.trim().split(/\s{2,}/);
            if (parts.length >= 2) {
                const no = parseInt(parts[0]);
                const name = parts[1].trim().toUpperCase();
                if (!isNaN(no) && name && supabaseClient) {
                    await supabaseClient.from('students').insert([{
                        grade: grade, branch: branchName, school_no: no, name: name, plus: 0, minus: 0, quiz: {}, scale: {}
                    }]);
                    count++;
                }
            }
        }
        await loadAllDataFromSupabase();
        alert(count + ' öğrenci eklendi');
        closeModal();
        openBranchDetail(grade, branchName, 'students', false);
    });
}

async function updatePoint(grade, branchName, idx, type) {
    const s = fenData[grade].branches[branchName][idx];
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
    const s = fenData[grade].branches[branchName][idx];
    if (!confirm(s.name + ' silinsin mi?')) return;
    if (supabaseClient) {
        await supabaseClient.from('students').delete()
            .eq('grade', grade).eq('branch', branchName).eq('school_no', s.no);
    }
    await loadAllDataFromSupabase();
    openBranchDetail(grade, branchName, 'students', false);
}

// ====================== QUIZ ======================
function loadQuizSections(grade, branchName) {
    const unit = document.getElementById('quiz-unit-sel').value;
    const sel = document.getElementById('quiz-section-sel');
    sel.innerHTML = '<option value="">-- Bölüm Seçin --</option>';
    const u = fenData[grade]?.units.find(x => x.name === unit);
    if (u) u.sections.forEach(s => sel.innerHTML += '<option value="' + s + '">' + s + '</option>');
    renderQuizTable(grade, branchName);
}

function renderQuizTable(grade, branchName) {
    const unit = document.getElementById('quiz-unit-sel')?.value;
    const section = document.getElementById('quiz-section-sel')?.value;
    const cont = document.getElementById('quiz-table-container');
    if (!cont) return;
    if (!unit || !section) {
        cont.innerHTML = '<p style="color:#94a3b8; font-size:13px;">Ünite ve bölüm seçin.</p>';
        return;
    }

    const students = fenData[grade]?.branches[branchName] || [];
    const key = unit + '_' + section;

    let rows = '';
    students.forEach((s, idx) => {
        const val = s.quiz?.[key] ?? '';
        rows += `
            <tr>
                <td style="white-space:nowrap;">${s.no}</td>
                <td style="white-space:nowrap; text-align:left; min-width:150px;">${s.name}</td>
                <td>
                    <input type="text" id="quiz-${idx}" class="auth-input" 
                        style="width:70px; padding:6px; text-align:center; margin:0 auto;"
                        value="${val}" placeholder="0-100 / G" oninput="validateScoreInput(this)">
                </td>
            </tr>`;
    });

    cont.innerHTML = `
        <div id="quiz-print" class="print-area">
            <div class="print-header">
                <h2>FENOMENAL FEN BİLİMLERİ DİJİTAL EĞİTİM PORTALI</h2>
                <h3>${grade}. Sınıf (${branchName}) - Quiz</h3>
            </div>
            <div class="print-info">
                <p><b>Şube:</b> ${grade}. Sınıf - ${branchName}</p>
                <p><b>Ünite:</b> ${unit}</p>
                <p><b>Bölüm:</b> ${section}</p>
            </div>
            <div style="overflow-x:auto;">
                <table class="data-table">
                    <thead><tr><th>No</th><th>Ad Soyad</th><th>Quiz Notu</th></tr></thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>
        </div>
        <div style="margin-top:12px; display:flex; gap:8px; flex-wrap:wrap;">
            <button onclick="saveQuiz('${grade}','${branchName}')" class="auth-btn" style="width:auto; padding:8px 14px;">Kaydet</button>
            <button onclick="exportTableToWord('quiz-print','${branchName}_Quiz')" class="auth-btn" style="background:#2563eb; width:auto; padding:8px 14px;">📥 Word</button>
            <button onclick="exportTableToPDF('quiz-print','${branchName}_Quiz')" class="auth-btn" style="background:#dc2626; width:auto; padding:8px 14px;">📄 PDF</button>
        </div>`;
}

async function saveQuiz(grade, branchName) {
    const unit = document.getElementById('quiz-unit-sel').value;
    const section = document.getElementById('quiz-section-sel').value;
    const key = unit + '_' + section;
    const students = fenData[grade].branches[branchName];

    for (let i = 0; i < students.length; i++) {
        const input = document.getElementById('quiz-' + i);
        if (!input) continue;
        let val = input.value.trim().toUpperCase();
        if (val !== 'G' && val !== '') {
            let n = parseFloat(val);
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
    alert('Quiz notları kaydedildi!');
}

// ====================== ÖLÇEKLER ======================
function loadActSections(grade, branchName) {
    const unit = document.getElementById('act-unit-sel').value;
    const sel = document.getElementById('act-section-sel');
    sel.innerHTML = '<option value="">-- Bölüm Seçin --</option>';
    const u = fenData[grade]?.units.find(x => x.name === unit);
    if (u) u.sections.forEach(s => sel.innerHTML += '<option value="' + s + '">' + s + '</option>');
    loadActNames(grade, branchName);
}

function loadActNames(grade, branchName) {
    const unit = document.getElementById('act-unit-sel').value;
    const section = document.getElementById('act-section-sel').value;
    const sel = document.getElementById('act-name-sel');
    sel.innerHTML = '<option value="">-- Etkinlik Seçin --</option>';

    const acts = (fenData[grade]?.activities || []).filter(a => a.unit === unit && a.section === section);
    const bases = new Set();
    acts.forEach(a => {
        const parts = a.name.split(' - ');
        bases.add(parts.length >= 2 ? parts[0] + ' - ' + parts[1] : a.name);
    });
    bases.forEach(b => sel.innerHTML += '<option value="' + b + '">' + b + '</option>');
    loadSubScales(grade, branchName);
}

function loadSubScales(grade, branchName) {
    const unit = document.getElementById('act-unit-sel').value;
    const section = document.getElementById('act-section-sel').value;
    const base = document.getElementById('act-name-sel').value;
    const sel = document.getElementById('sub-scale-sel');
    sel.innerHTML = '<option value="--TUM--">-- Tüm Ölçekler --</option>';

    if (!base) {
        renderActivityTable(grade, branchName);
        return;
    }

    const subs = (fenData[grade]?.activities || []).filter(a =>
        a.unit === unit && a.section === section && (a.name === base || a.name.startsWith(base + ' -'))
    );
    subs.forEach(s => {
        let short = s.name.replace(base, '').replace(/^[\s-]+/, '') || s.name;
        sel.innerHTML += '<option value="' + s.name + '">' + short + '</option>';
    });
    renderActivityTable(grade, branchName);
}

function renderActivityTable(grade, branchName) {
    const unit = document.getElementById('act-unit-sel')?.value;
    const section = document.getElementById('act-section-sel')?.value;
    const base = document.getElementById('act-name-sel')?.value;
    const selected = document.getElementById('sub-scale-sel')?.value;
    const cont = document.getElementById('activity-table-container');
    if (!cont) return;

    if (!base) {
        cont.innerHTML = '<p style="color:#94a3b8; font-size:13px;">Etkinlik seçin.</p>';
        return;
    }

    const allActs = fenData[grade]?.activities || [];
    const subScales = allActs.filter(a => a.unit === unit && a.section === section && (a.name === base || a.name.startsWith(base + ' -')));
    const students = fenData[grade]?.branches[branchName] || [];

    // TEKİL ÖLÇEK
    if (selected && selected !== '--TUM--') {
        const scale = subScales.find(a => a.name === selected);
        if (!scale) return;

        const criteria = scale.criteria || ['1. Kriter','2. Kriter','3. Kriter','4. Kriter'];

        let head = '<th style="width:50px;">No</th><th style="min-width:140px; text-align:left;">Ad Soyad</th>';
        criteria.forEach((c) => {
            head += '<th style="min-width:65px; max-width:90px; font-size:10px; white-space:normal; word-break:break-word; line-height:1.25; vertical-align:middle;">' + c + '</th>';
        });
        head += '<th style="min-width:60px;">Toplam</th>';

        let body = '';
        students.forEach((s, sIdx) => {
            const stored = s.scale?.[selected] || {};
            let cells = '<td style="white-space:nowrap;">' + s.no + '</td><td style="white-space:nowrap; text-align:left;">' + s.name + '</td>';
            criteria.forEach((_, cIdx) => {
                const val = stored[cIdx] !== undefined ? stored[cIdx] : '';
                cells += '<td><input type="text" id="crit-' + sIdx + '-' + cIdx + '" class="auth-input" style="width:45px; padding:5px; text-align:center; font-size:12px;" value="' + val + '" oninput="validateScoreInput(this)"></td>';
            });
            const total = stored.totalScore !== undefined ? stored.totalScore : '-';
            cells += '<td id="total-' + sIdx + '">' + getScaleBadge(total) + '</td>';
            body += '<tr>' + cells + '</tr>';
        });

        cont.innerHTML = `
            <div id="act-print" class="print-area">
                <div class="print-header">
                    <h2>FENOMENAL FEN BİLİMLERİ DİJİTAL EĞİTİM PORTALI</h2>
                    <h3>${grade}. Sınıf (${branchName}) - Tekil Ölçek</h3>
                </div>
                <div class="print-info">
                    <p><b>Şube:</b> ${grade}. Sınıf - ${branchName}</p>
                    <p><b>Ünite:</b> ${unit}</p>
                    <p><b>Bölüm:</b> ${section}</p>
                    <p><b>Ölçek:</b> ${scale.name}</p>
                </div>
                <div style="overflow-x:auto;">
                    <table class="data-table" style="min-width:${180 + criteria.length * 70}px;">
                        <thead><tr>${head}</tr></thead>
                        <tbody>${body}</tbody>
                    </table>
                </div>
            </div>
            <div style="margin-top:12px; display:flex; gap:8px; flex-wrap:wrap;">
                <button onclick="saveSingleScale('${grade}','${branchName}','${selected}',${criteria.length})" class="auth-btn" style="width:auto; padding:8px 14px;">Kaydet</button>
                <button onclick="exportTableToWord('act-print','${branchName}_Tekil_Olcek')" class="auth-btn" style="background:#2563eb; width:auto; padding:8px 14px;">📥 Word</button>
                <button onclick="exportTableToPDF('act-print','${branchName}_Tekil_Olcek')" class="auth-btn" style="background:#dc2626; width:auto; padding:8px 14px;">📄 PDF</button>
            </div>`;
        return;
    }

    // TÜM ÖLÇEKLER
    let head = '<th style="width:50px;">No</th><th style="min-width:140px; text-align:left;">Ad Soyad</th><th style="min-width:60px;">Hızlı</th>';
    subScales.forEach(sc => {
        let short = sc.name.replace(base, '').replace(/^[\s-]+/, '') || sc.name;
        if (short.length > 9) short = short.substring(0,7) + '..';
        head += '<th style="min-width:55px; font-size:11px;">' + short + '</th>';
    });

    let body = '';
    students.forEach((s, sIdx) => {
        const first = subScales[0]?.name;
        const quick = (first && s.scale?.[first]?.totalScore !== undefined) ? s.scale[first].totalScore : '';
        let cells = '<td style="white-space:nowrap;">' + s.no + '</td><td style="white-space:nowrap; text-align:left;">' + s.name + '</td>';
        cells += '<td><input type="text" id="quick-' + sIdx + '" class="auth-input" style="width:55px; padding:5px; text-align:center;" value="' + quick + '" placeholder="85" oninput="validateScoreInput(this); applyQuick(' + sIdx + ',' + subScales.length + ')"></td>';
        subScales.forEach((sc, i) => {
            const val = s.scale?.[sc.name]?.totalScore !== undefined ? s.scale[sc.name].totalScore : '-';
            cells += '<td id="badge-' + sIdx + '-' + i + '">' + getScaleBadge(val) + '</td>';
        });
        body += '<tr>' + cells + '</tr>';
    });

    cont.innerHTML = `
        <div id="act-print" class="print-area">
            <div class="print-header">
                <h2>FENOMENAL FEN BİLİMLERİ DİJİTAL EĞİTİM PORTALI</h2>
                <h3>${grade}. Sınıf (${branchName}) - Tüm Ölçekler</h3>
            </div>
            <div class="print-info">
                <p><b>Şube:</b> ${grade}. Sınıf - ${branchName}</p>
                <p><b>Ünite:</b> ${unit}</p>
                <p><b>Bölüm:</b> ${section}</p>
            </div>
            <div style="overflow-x:auto;">
                <table class="data-table" style="min-width:${200 + subScales.length * 60}px;">
                    <thead><tr>${head}</tr></thead>
                    <tbody>${body}</tbody>
                </table>
            </div>
        </div>
        <div style="margin-top:12px; display:flex; gap:8px; flex-wrap:wrap;">
            <button onclick="saveGroupScales('${grade}','${branchName}','${base}')" class="auth-btn" style="width:auto; padding:8px 14px;">Kaydet</button>
            <button onclick="exportTableToWord('act-print','${branchName}_Tum_Olcekler')" class="auth-btn" style="background:#2563eb; width:auto; padding:8px 14px;">📥 Word</button>
            <button onclick="exportTableToPDF('act-print','${branchName}_Tum_Olcekler')" class="auth-btn" style="background:#dc2626; width:auto; padding:8px 14px;">📄 PDF</button>
        </div>`;
}

function applyQuick(sIdx, count) {
    const val = document.getElementById('quick-' + sIdx)?.value.trim().toUpperCase() || '';
    for (let i = 0; i < count; i++) {
        const el = document.getElementById('badge-' + sIdx + '-' + i);
        if (el) el.innerHTML = getScaleBadge(val);
    }
}

async function saveSingleScale(grade, branchName, scaleName, critCount) {
    const students = fenData[grade].branches[branchName];
    const scaleObj = (fenData[grade].activities || []).find(a => a.name === scaleName);
    const type = scaleObj?.scale_type || '1-4';

    for (let i = 0; i < students.length; i++) {
        const s = students[i];
        if (!s.scale) s.scale = {};
        if (!s.scale[scaleName]) s.scale[scaleName] = {};

        let sum = 0, has = false;
        for (let c = 0; c < critCount; c++) {
            const input = document.getElementById('crit-' + i + '-' + c);
            if (!input) continue;
            const v = input.value.trim();
            if (v === '') continue;
            has = true;
            const n = parseFloat(v) || 0;
            s.scale[scaleName][c] = n;
            sum += n;
        }
        if (has) {
            const max = type === '1-4' ? critCount * 4 : critCount;
            s.scale[scaleName].totalScore = Math.round((sum / max) * 100);
        }
        if (supabaseClient) {
            await supabaseClient.from('students').update({ scale: s.scale })
                .eq('grade', grade).eq('branch', branchName).eq('school_no', s.no);
        }
    }
    await loadAllDataFromSupabase();
    alert('Tekil ölçek kaydedildi!');
    renderActivityTable(grade, branchName);
}

async function saveGroupScales(grade, branchName, baseName) {
    const unit = document.getElementById('act-unit-sel').value;
    const section = document.getElementById('act-section-sel').value;
    const subScales = (fenData[grade].activities || []).filter(a =>
        a.unit === unit && a.section === section && (a.name === baseName || a.name.startsWith(baseName + ' -'))
    );
    const students = fenData[grade].branches[branchName];

    for (let i = 0; i < students.length; i++) {
        const input = document.getElementById('quick-' + i);
        if (!input || input.value === '') continue;
        const valText = input.value.trim().toUpperCase();
        const s = students[i];
        if (!s.scale) s.scale = {};

        subScales.forEach(sc => {
            if (!s.scale[sc.name]) s.scale[sc.name] = {};
            const critCount = sc.criteria?.length || 4;

            if (valText === 'G') {
                for (let c = 0; c < critCount; c++) s.scale[sc.name][c] = 0;
                s.scale[sc.name].totalScore = 'G';
            } else {
                let target = parseFloat(valText);
                if (isNaN(target)) return;
                if (target < 0) target = 0;
                if (target > 100) target = 100;

                if (sc.scale_type === '1-4') {
                    const max = critCount * 4;
                    const score = Math.round((target / 100) * max);
                    const baseVal = Math.floor(score / critCount);
                    const rem = score % critCount;
                    for (let c = 0; c < critCount; c++) {
                        let v = baseVal + (c < rem ? 1 : 0);
                        if (v < 1) v = 1; if (v > 4) v = 4;
                        s.scale[sc.name][c] = v;
                    }
                } else {
                    const score = Math.round((target / 100) * critCount);
                    for (let c = 0; c < critCount; c++) s.scale[sc.name][c] = c < score ? 1 : 0;
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
    alert('Ölçek puanları kaydedildi!');
    renderActivityTable(grade, branchName);
}

// ====================== RAPOR ======================
function loadRepSections(grade, branchName) {
    const unit = document.getElementById('rep-unit-sel').value;
    const sel = document.getElementById('rep-section-sel');
    sel.innerHTML = '<option value="">-- Bölüm Seçin --</option>';
    const u = fenData[grade]?.units.find(x => x.name === unit);
    if (u) u.sections.forEach(s => sel.innerHTML += '<option value="' + s + '">' + s + '</option>');
    renderReport(grade, branchName);
}

async function renderReport(grade, branchName) {
    const unit = document.getElementById('rep-unit-sel')?.value;
    const section = document.getElementById('rep-section-sel')?.value;
    const cont = document.getElementById('report-container');
    if (!cont) return;
    if (!unit || !section) {
        cont.innerHTML = '<p style="color:#94a3b8;">Ünite ve bölüm seçin.</p>';
        return;
    }

    let reportText = 'Bu bölüm için henüz rapor şablonu eklenmemiş.';
    if (supabaseClient) {
        const { data } = await supabaseClient.from('report_templates')
            .select('report_text').eq('grade', grade).eq('unit_name', unit).eq('section_name', section).single();
        if (data?.report_text) reportText = data.report_text;
    }

    const students = fenData[grade]?.branches[branchName] || [];
    const acts = (fenData[grade]?.activities || []).filter(a => a.unit === unit && a.section === section);

    let rows = '';
    let quizSum = 0, quizCnt = 0, scaleSum = 0, scaleCnt = 0, genList = [];

    students.forEach(s => {
        const qKey = unit + '_' + section;
        const rawQ = s.quiz?.[qKey];
        let qVal = '-', qNum = null;
        if (rawQ === 'G') qVal = 'G';
        else if (rawQ !== undefined && rawQ !== '') {
            qNum = parseFloat(rawQ);
            if (!isNaN(qNum)) { qVal = qNum; quizSum += qNum; quizCnt++; }
        }

        let sSum = 0, sCnt = 0;
        acts.forEach(a => {
            const sc = s.scale?.[a.name]?.totalScore;
            if (sc !== undefined && sc !== 'G') {
                const n = parseFloat(sc);
                if (!isNaN(n)) { sSum += n; sCnt++; }
            }
        });
        const scaleAvg = sCnt > 0 ? Math.round(sSum / sCnt) : null;
        if (scaleAvg !== null) { scaleSum += scaleAvg; scaleCnt++; }

        let gen = null;
        if (qNum !== null && scaleAvg !== null) gen = Math.round(qNum * 0.5 + scaleAvg * 0.5);
        else if (qNum !== null) gen = Math.round(qNum);
        else if (scaleAvg !== null) gen = scaleAvg;
        if (gen !== null) genList.push(gen);

        rows += '<tr>' +
            '<td style="white-space:nowrap;">' + s.no + '</td>' +
            '<td style="white-space:nowrap; text-align:left; min-width:140px;">' + s.name + '</td>' +
            '<td>' + getScoreBadge(qVal) + '</td>' +
            '<td>' + (scaleAvg !== null ? getScaleBadge(scaleAvg) : getScoreBadge('-')) + '</td>' +
            '<td>' + (gen !== null ? getScoreBadge(gen) : getScoreBadge('-')) + '</td>' +
            '</tr>';
    });

    const qAvg = quizCnt ? Math.round(quizSum / quizCnt) : '-';
    const sAvg = scaleCnt ? '%' + Math.round(scaleSum / scaleCnt) : '-';
    const low = genList.filter(g => g < 45).length;
    const mid = genList.filter(g => g >= 45 && g < 70).length;
    const high = genList.filter(g => g >= 70).length;

    cont.innerHTML = `
        <div id="report-print" class="print-area">
            <div class="print-header">
                <h2>FENOMENAL FEN BİLİMLERİ DİJİTAL EĞİTİM PORTALI</h2>
                <h3>${grade}. Sınıf (${branchName}) - Analiz Raporu</h3>
            </div>
            <div class="print-info">
                <p><b>Şube:</b> ${grade}. Sınıf - ${branchName}</p>
                <p><b>Ünite:</b> ${unit}</p>
                <p><b>Bölüm:</b> ${section}</p>
                <p><b>Mevcut:</b> ${students.length} | <b>Quiz Ort:</b> ${qAvg} | <b>Ölçek Ort:</b> ${sAvg}</p>
            </div>
            <div style="overflow-x:auto;">
                <table class="data-table">
                    <thead><tr><th>No</th><th>Ad Soyad</th><th>Quiz</th><th>Ölçek</th><th>Genel</th></tr></thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>
        </div>
        <div id="report-page2" class="print-area" style="margin-top:16px;">
            <div style="border:1px solid rgba(255,255,255,0.1); border-radius:8px; padding:14px; background:rgba(15,23,42,0.4);">
                <h4 style="margin:0 0 10px; font-size:14px;">📌 Bölüm Sonu Resmi Değerlendirme Raporu</h4>
                <div style="font-size:13px; line-height:1.5; white-space:pre-wrap;">${reportText}</div>
            </div>
            <div style="display:flex; justify-content:space-around; margin-top:12px; padding:10px; border:1px solid rgba(255,255,255,0.1); border-radius:8px;">
                <span class="badge badge-low">0-45: ${low}</span>
                <span class="badge badge-mid">45-70: ${mid}</span>
                <span class="badge badge-high">70-100: ${high}</span>
            </div>
        </div>
        <div style="margin-top:12px; display:flex; gap:8px; flex-wrap:wrap;">
            <button onclick="exportReportToWord('${branchName}_${section}_Rapor')" class="auth-btn" style="background:#2563eb; width:auto; padding:8px 14px;">📥 Word</button>
            <button onclick="exportFullReportPDF('${branchName}_${section}_Rapor')" class="auth-btn" style="background:#dc2626; width:auto; padding:8px 14px;">📄 PDF</button>
        </div>`;
}

// ====================== WORD EXPORT ======================
function exportTableToWord(elementId, filename) {
    const element = document.getElementById(elementId);
    if (!element) return alert('İçerik bulunamadı!');

    const clone = element.cloneNode(true);
    const originalInputs = element.querySelectorAll('input');
    const clonedInputs = clone.querySelectorAll('input');

    for (let i = 0; i < originalInputs.length; i++) {
        const span = document.createElement('span');
        span.innerText = originalInputs[i].value || '-';
        span.style.color = '#000';
        span.style.fontWeight = 'bold';
        if (clonedInputs[i]) clonedInputs[i].parentNode.replaceChild(span, clonedInputs[i]);
    }
    clone.querySelectorAll('button').forEach(b => b.remove());

    const styles = `
        <style>
            @page { size: A4; margin: 1.5cm; }
            body { font-family: 'Times New Roman', Times, serif; color: #000; }
            table { width: 100%; border-collapse: collapse; margin-top: 10px; }
            th, td { border: 1px solid #000; padding: 6px 4px; font-size: 11px; text-align: center; }
            th { background: #f2f2f2; font-weight: bold; }
            td:nth-child(2) { text-align: left; white-space: nowrap; }
            .print-header { text-align: center; border-bottom: 2px solid #000; margin-bottom: 10px; padding-bottom: 6px; }
            .print-info { border: 1px solid #666; padding: 8px; margin-bottom: 10px; font-size: 12px; }
        </style>`;

    const html = '<html><head><meta charset="utf-8"><title>Rapor</title>' + styles + '</head><body>' + clone.outerHTML + '</body></html>';
    const blob = new Blob(['\ufeff' + html], { type: 'application/msword' });
    saveAs(blob, filename + '.doc');
}

function exportReportToWord(filename) {
    const part1 = document.getElementById('report-print');
    const part2 = document.getElementById('report-page2');
    if (!part1) return alert('İçerik bulunamadı!');

    let reportHtml = '';
    if (part2) {
        const textDiv = part2.querySelector('div[style*="white-space"]') || part2.querySelector('div');
        let rawText = textDiv ? (textDiv.innerText || textDiv.textContent) : '';
        
        const lines = rawText.split(/\n/).map(l => l.trim()).filter(l => l.length > 0);
        
        lines.forEach(line => {
            if (line === line.toUpperCase() && line.length > 8 && !line.startsWith('•') && !line.startsWith('-') && !line.startsWith('*')) {
                reportHtml += `<p style="margin:14px 0 6px 0; font-weight:bold; font-size:13pt;">${line}</p>`;
            }
            else if (line.startsWith('•') || line.startsWith('-') || line.startsWith('*')) {
                reportHtml += `<p style="margin:3px 0 3px 18px; font-size:11pt;">• ${line.replace(/^[•\-\*]\s*/, '')}</p>`;
            }
            else {
                reportHtml += `<p style="margin:6px 0; font-size:11pt; text-align:justify;">${line}</p>`;
            }
        });
    }

    const badges = part2 ? part2.querySelectorAll('.badge') : [];
    let distHtml = '';
    if (badges.length >= 3) {
        distHtml = `
            <p style="margin-top:18px; font-size:11pt;">
                <b>0-45:</b> ${badges[0].innerText.replace('0-45:','').trim()} &nbsp;&nbsp;
                <b>45-70:</b> ${badges[1].innerText.replace('45-70:','').trim()} &nbsp;&nbsp;
                <b>70-100:</b> ${badges[2].innerText.replace('70-100:','').trim()}
            </p>`;
    }

    const styles = `
        <style>
            @page { size: A4; margin: 1.8cm; }
            body { font-family: 'Times New Roman', Times, serif; color: #000; font-size: 11pt; line-height: 1.45; }
            table { width: 100%; border-collapse: collapse; margin: 12px 0; }
            th, td { border: 1px solid #000; padding: 6px 5px; font-size: 10.5pt; text-align: center; }
            th { background: #f0f0f0; font-weight: bold; }
            td:nth-child(2) { text-align: left; }
            h2 { text-align: center; font-size: 14pt; margin: 0 0 4px 0; }
            h3 { text-align: center; font-size: 12pt; margin: 0 0 12px 0; font-weight: normal; }
            .info { border: 1px solid #444; padding: 8px 10px; margin-bottom: 14px; font-size: 10.5pt; }
            .page-break { page-break-before: always; }
        </style>`;

    const tableClone = part1.cloneNode(true);
    tableClone.querySelectorAll('button').forEach(b => b.remove());

    const html = `
        <html>
        <head><meta charset="utf-8"><title>Rapor</title>${styles}</head>
        <body>
            ${tableClone.innerHTML}
            <br class="page-break">
            <h2>📌 Bölüm Sonu Resmi Değerlendirme Raporu</h2>
            ${reportHtml}
            ${distHtml}
        </body>
        </html>`;

    const blob = new Blob(['\ufeff' + html], { type: 'application/msword' });
    saveAs(blob, filename + '.doc');
}

// ====================== PDF (BEYAZ ARKA PLAN) ======================
async function exportTableToPDF(elementId, filename) {
    const el = document.getElementById(elementId);
    if (!el) return alert('İçerik bulunamadı');

    const jsPDF = getJsPDF();
    if (!jsPDF) return alert('jsPDF yüklenemedi');

    const clone = el.cloneNode(true);
    el.querySelectorAll('input').forEach((inp, i) => {
        const span = document.createElement('span');
        span.textContent = inp.value || '-';
        span.style.cssText = 'color:#000;font-weight:bold;';
        const target = clone.querySelectorAll('input')[i];
        if (target) target.parentNode.replaceChild(span, target);
    });
    clone.querySelectorAll('button').forEach(b => b.remove());

    const table = clone.querySelector('table');
    const cols = table ? table.querySelectorAll('th').length : 0;
    const isWide = cols > 5 || filename.includes('Olcek') || filename.includes('Tum');

    const container = document.createElement('div');
    container.style.cssText = 'position:fixed;left:-9999px;top:0;width:' + (isWide ? '1200px' : '850px') + ';background:#ffffff !important;color:#000;padding:20px;font-family:Arial,sans-serif;z-index:99999;';
    
    const style = document.createElement('style');
    style.textContent = `
        * { color: #000 !important; background: #ffffff !important; writing-mode: horizontal-tb !important; }
        body, div, section { background: #ffffff !important; }
        table { width: 100% !important; border-collapse: collapse !important; background: #ffffff !important; }
        th, td { 
            border: 1px solid #222 !important; 
            padding: 7px 5px !important; 
            font-size: 12px !important; 
            text-align: center; 
            color: #000 !important;
            font-weight: 600 !important;
            background: #ffffff !important;
        }
        th { background: #e8e8e8 !important; font-weight: bold !important; }
        td:nth-child(2), th:nth-child(2) { text-align: left !important; white-space: nowrap !important; }
        .badge, span { 
            background: transparent !important; 
            color: #000 !important; 
            font-weight: 700 !important; 
            font-size: 13px !important;
        }
        .print-header { text-align: center; border-bottom: 2px solid #000; margin-bottom: 10px; padding-bottom: 6px; background: #ffffff !important; }
        .print-header h2 { font-size: 15px; margin: 0 0 3px; color: #000 !important; }
        .print-header h3 { font-size: 12px; margin: 0; color: #000 !important; }
        .print-info { border: 1px solid #555; padding: 8px; margin-bottom: 10px; font-size: 11px; background: #f8f8f8 !important; line-height: 1.4; color: #000 !important; }
        .print-area { background: #ffffff !important; }
    `;
    container.appendChild(style);
    container.appendChild(clone);
    document.body.appendChild(container);

    await new Promise(r => setTimeout(r, 400));

    try {
        const canvas = await html2canvas(container, { 
            scale: 2.5, 
            useCORS: true, 
            backgroundColor: '#ffffff', 
            logging: false,
            letterRendering: true
        });
        const pdf = new jsPDF({ orientation: isWide ? 'landscape' : 'portrait', unit: 'mm', format: 'a4' });
        const pw = pdf.internal.pageSize.getWidth();
        const ph = pdf.internal.pageSize.getHeight();
        const margin = 10;
        let imgW = pw - margin * 2;
        let imgH = (canvas.height * imgW) / canvas.width;
        if (imgH > ph - margin * 2) {
            imgH = ph - margin * 2;
            imgW = (canvas.width * imgH) / canvas.height;
        }
        const x = (pw - imgW) / 2;
        const y = (ph - imgH) / 2;
        pdf.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', x, y, imgW, imgH);
        pdf.save(filename + '.pdf');
    } catch (e) {
        console.error(e);
        alert('PDF hatası: ' + e.message);
    } finally {
        document.body.removeChild(container);
    }
}

async function exportFullReportPDF(filename) {
    const p1 = document.getElementById('report-print');
    const p2 = document.getElementById('report-page2');
    if (!p1) return alert('İçerik yok');

    const jsPDF = getJsPDF();
    if (!jsPDF) return alert('jsPDF yok');

    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pw = pdf.internal.pageSize.getWidth();
    const ph = pdf.internal.pageSize.getHeight();
    const margin = 12;
    const usable = ph - margin * 2;

    // 1. SAYFA
    const c1 = document.createElement('div');
    c1.style.cssText = 'position:fixed;left:-9999px;width:850px;background:#ffffff !important;padding:20px;font-family:Arial;z-index:99999;';
    c1.innerHTML = `
        <style>
            * { color: #000 !important; background: #ffffff !important; }
            body, div, section { background: #ffffff !important; }
            table { width: 100%; border-collapse: collapse; background: #ffffff !important; }
            th, td { border: 1px solid #333; padding: 5px; font-size: 10px; text-align: center; color: #000 !important; font-weight: 600; background: #ffffff !important; }
            th { background: #e8e8e8 !important; }
            td:nth-child(2) { text-align: left; white-space: nowrap; }
            .print-header { text-align: center; border-bottom: 2px solid #000; margin-bottom: 8px; background: #ffffff !important; }
            .print-info { border: 1px solid #666; padding: 7px; margin-bottom: 8px; font-size: 10px; background: #f8f8f8 !important; }
            .print-area { background: #ffffff !important; }
            .badge { background: transparent !important; color: #000 !important; font-weight: 700; }
        </style>`;
    c1.appendChild(p1.cloneNode(true));
    document.body.appendChild(c1);
    await new Promise(r => setTimeout(r, 350));

    const canvas1 = await html2canvas(c1, { 
        scale: 2.5, 
        backgroundColor: '#ffffff', 
        logging: false, 
        letterRendering: true 
    });
    let imgW = pw - margin * 2;
    let imgH = (canvas1.height * imgW) / canvas1.width;
    if (imgH > usable) {
        const sc = usable / imgH;
        pdf.addImage(canvas1.toDataURL('image/jpeg', 0.95), 'JPEG', margin, margin, imgW * sc, usable);
    } else {
        pdf.addImage(canvas1.toDataURL('image/jpeg', 0.95), 'JPEG', margin, margin, imgW, imgH);
    }
    document.body.removeChild(c1);

    // 2. SAYFA
    if (p2) {
        pdf.addPage();
        const c2 = document.createElement('div');
        c2.style.cssText = 'position:fixed;left:-9999px;width:850px;background:#ffffff !important;padding:20px;font-family:Arial;z-index:99999;';
        c2.innerHTML = `
            <style>
                * { color: #000 !important; background: #ffffff !important; }
                body, div, section { background: #ffffff !important; }
                h4 { font-size: 13px; margin: 0 0 8px; color: #000 !important; }
                p, div { font-size: 11px; line-height: 1.45; color: #000 !important; background: #ffffff !important; }
                .print-area { background: #ffffff !important; }
                .badge { background: transparent !important; color: #000 !important; font-weight: 700; }
            </style>`;
        c2.appendChild(p2.cloneNode(true));
        document.body.appendChild(c2);
        await new Promise(r => setTimeout(r, 350));

        const canvas2 = await html2canvas(c2, { 
            scale: 2.5, 
            backgroundColor: '#ffffff', 
            logging: false, 
            letterRendering: true 
        });
        imgH = (canvas2.height * imgW) / canvas2.width;
        if (imgH > usable) {
            const sc = Math.min(0.88, usable / imgH);
            pdf.addImage(canvas2.toDataURL('image/jpeg', 0.95), 'JPEG', (pw - imgW * sc) / 2, margin, imgW * sc, imgH * sc);
        } else {
            pdf.addImage(canvas2.toDataURL('image/jpeg', 0.95), 'JPEG', margin, margin, imgW, imgH);
        }
        document.body.removeChild(c2);
    }
    pdf.save(filename + '.pdf');
}

// ====================== GLOBAL YÖNETİM ======================
function globalAddUnit() {
    openModal('Ünite Ekle', `
        <select id="m-grade" class="auth-input">
            <option value="5">5. Sınıf</option><option value="6">6. Sınıf</option>
            <option value="7">7. Sınıf</option><option value="8">8. Sınıf</option>
        </select>
        <input type="text" id="m-unit" class="auth-input" placeholder="Ünite adı">
    `, async () => {
        const g = document.getElementById('m-grade').value;
        const name = document.getElementById('m-unit').value.trim();
        if (!name) return;
        if (supabaseClient) await supabaseClient.from('units_sections').insert([{ grade: g, unit_name: name, section_name: 'Genel' }]);
        await loadAllDataFromSupabase();
        closeModal();
        alert('Ünite eklendi');
    });
}

function globalAddSection() {
    openModal('Bölüm Ekle', `
        <select id="m-grade" class="auth-input" onchange="fillModalUnits(this.value)">
            <option value="5">5. Sınıf</option><option value="6" selected>6. Sınıf</option>
            <option value="7">7. Sınıf</option><option value="8">8. Sınıf</option>
        </select>
        <select id="m-unit" class="auth-input"><option value="">Ünite seçin</option></select>
        <input type="text" id="m-section" class="auth-input" placeholder="Bölüm adı">
    `, async () => {
        const g = document.getElementById('m-grade').value;
        const u = document.getElementById('m-unit').value;
        const s = document.getElementById('m-section').value.trim();
        if (!u || !s) return alert('Ünite ve bölüm girin');
        if (supabaseClient) await supabaseClient.from('units_sections').insert([{ grade: g, unit_name: u, section_name: s }]);
        await loadAllDataFromSupabase();
        closeModal();
        alert('Bölüm eklendi');
    });
    fillModalUnits('6');
}

function fillModalUnits(grade) {
    const sel = document.getElementById('m-unit');
    if (!sel) return;
    sel.innerHTML = '<option value="">Ünite seçin</option>';
    (fenData[grade]?.units || []).forEach(u => sel.innerHTML += '<option value="' + u.name + '">' + u.name + '</option>');
}

function globalAddActivity() {
    openModal('Excel Ölçek Yükle', `
        <select id="m-grade" class="auth-input" onchange="fillModalUnitsAct(this.value)">
            <option value="5">5. Sınıf</option><option value="6" selected>6. Sınıf</option>
            <option value="7">7. Sınıf</option><option value="8">8. Sınıf</option>
        </select>
        <select id="m-unit" class="auth-input" onchange="fillModalSectionsAct()"><option value="">Ünite</option></select>
        <select id="m-section" class="auth-input"><option value="">Bölüm</option></select>
        <input type="file" id="m-file" class="auth-input" accept=".xlsx,.xls">
    `, () => {
        const g = document.getElementById('m-grade').value;
        const u = document.getElementById('m-unit').value;
        const s = document.getElementById('m-section').value;
        const file = document.getElementById('m-file').files[0];
        if (!u || !s || !file) return alert('Tüm alanları doldurun');

        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
                let count = 0;
                for (const sheet of wb.SheetNames) {
                    const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheet], { header: 1 });
                    let title = sheet.trim();
                    let type = '1-4';
                    let crits = [];
                    for (const row of rows) {
                        if (!row) continue;
                        for (const cell of row) {
                            if (typeof cell === 'string') {
                                if (cell.includes('RUBRİK') || cell.includes('1-4')) type = '1-4';
                                if (cell.includes('KONTROL') || cell.includes('VAR')) type = 'var-yok';
                                if (cell.includes('FORMU') || cell.includes('EVET')) type = 'evet-hayir';
                                if (cell.includes('RUBRİK') || cell.includes('FORMU') || cell.includes('ÖLÇEĞİ')) {
                                    title = sheet + ' - ' + cell.trim();
                                }
                            }
                        }
                        if (row.some(c => c && (String(c).includes('Okul No') || String(c).includes('Adı Soyadı')))) {
                            crits = row.filter(c => c && !String(c).includes('Okul No') && !String(c).includes('Adı Soyadı') && !String(c).includes('TOPLAM') && !String(c).includes('BAŞARI'));
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
                alert(count + ' ölçek yüklendi');
            } catch (err) {
                alert('Hata: ' + err.message);
            }
        };
        reader.readAsArrayBuffer(file);
    });
    fillModalUnitsAct('6');
}

function fillModalUnitsAct(grade) {
    const sel = document.getElementById('m-unit');
    if (!sel) return;
    sel.innerHTML = '<option value="">Ünite</option>';
    (fenData[grade]?.units || []).forEach(u => sel.innerHTML += '<option value="' + u.name + '">' + u.name + '</option>');
    fillModalSectionsAct();
}

function fillModalSectionsAct() {
    const g = document.getElementById('m-grade')?.value;
    const u = document.getElementById('m-unit')?.value;
    const sel = document.getElementById('m-section');
    if (!sel) return;
    sel.innerHTML = '<option value="">Bölüm</option>';
    const unit = fenData[g]?.units.find(x => x.name === u);
    if (unit) unit.sections.forEach(s => sel.innerHTML += '<option value="' + s + '">' + s + '</option>');
}

function globalAddReportTemplate() {
    openModal('Rapor Şablonu Ekle', `
        <select id="r-grade" class="auth-input" onchange="fillRepUnits(this.value)">
            <option value="5">5. Sınıf</option><option value="6">6. Sınıf</option>
            <option value="7" selected>7. Sınıf</option><option value="8">8. Sınıf</option>
        </select>
        <select id="r-unit" class="auth-input" onchange="fillRepSections()"><option value="">Ünite</option></select>
        <select id="r-section" class="auth-input"><option value="">Bölüm</option></select>
        <textarea id="r-text" class="auth-input" style="height:120px;" placeholder="Rapor metni..."></textarea>
    `, async () => {
        const g = document.getElementById('r-grade').value;
        const u = document.getElementById('r-unit').value;
        const s = document.getElementById('r-section').value;
        const t = document.getElementById('r-text').value.trim();
        if (!u || !s || !t) return alert('Tüm alanları doldurun');
        if (supabaseClient) {
            await supabaseClient.from('report_templates').insert([{ grade: g, unit_name: u, section_name: s, report_text: t }]);
        }
        closeModal();
        alert('Rapor şablonu kaydedildi');
    });
    fillRepUnits('7');
}

function fillRepUnits(grade) {
    const sel = document.getElementById('r-unit');
    if (!sel) return;
    sel.innerHTML = '<option value="">Ünite</option>';
    (fenData[grade]?.units || []).forEach(u => sel.innerHTML += '<option value="' + u.name + '">' + u.name + '</option>');
}

function fillRepSections() {
    const g = document.getElementById('r-grade')?.value;
    const u = document.getElementById('r-unit')?.value;
    const sel = document.getElementById('r-section');
    if (!sel) return;
    sel.innerHTML = '<option value="">Bölüm</option>';
    const unit = fenData[g]?.units.find(x => x.name === u);
    if (unit) unit.sections.forEach(s => sel.innerHTML += '<option value="' + s + '">' + s + '</option>');
}

function globalDeleteManagement() {
    openModal('Silme Yönetimi', `
        <select id="d-grade" class="auth-input" onchange="fillDelUnits(this.value)">
            <option value="5">5. Sınıf</option><option value="6" selected>6. Sınıf</option>
            <option value="7">7. Sınıf</option><option value="8">8. Sınıf</option>
        </select>
        <select id="d-type" class="auth-input" onchange="toggleDel()">
            <option value="unit">Ünite Sil</option>
            <option value="section">Bölüm Sil</option>
            <option value="activity">Etkinlik Sil</option>
            <option value="report">Rapor Sil</option>
        </select>
        <div id="d-unit-box"><select id="d-unit" class="auth-input" onchange="fillDelSections()"><option value="">Ünite</option></select></div>
        <div id="d-sec-box" style="display:none;"><select id="d-section" class="auth-input"><option value="">Bölüm</option></select></div>
        <div id="d-act-box" style="display:none;"><select id="d-act" class="auth-input"><option value="">Etkinlik</option></select></div>
    `, async () => {
        const g = document.getElementById('d-grade').value;
        const type = document.getElementById('d-type').value;
        if (type === 'unit') {
            const u = document.getElementById('d-unit').value;
            if (!u || !confirm('Ünite ve bağlı her şey silinsin mi?')) return;
            if (supabaseClient) {
                await supabaseClient.from('units_sections').delete().eq('grade', g).eq('unit_name', u);
                await supabaseClient.from('activities').delete().eq('grade', g).eq('unit_name', u);
                await supabaseClient.from('report_templates').delete().eq('grade', g).eq('unit_name', u);
            }
        } else if (type === 'section') {
            const u = document.getElementById('d-unit').value;
            const s = document.getElementById('d-section').value;
            if (!u || !s || !confirm('Bölüm silinsin mi?')) return;
            if (supabaseClient) {
                await supabaseClient.from('units_sections').delete().eq('grade', g).eq('unit_name', u).eq('section_name', s);
                await supabaseClient.from('activities').delete().eq('grade', g).eq('unit_name', u).eq('section_name', s);
                await supabaseClient.from('report_templates').delete().eq('grade', g).eq('unit_name', u).eq('section_name', s);
            }
        } else if (type === 'activity') {
            const a = document.getElementById('d-act').value;
            if (!a || !confirm('Etkinlik silinsin mi?')) return;
            if (supabaseClient) {
                await supabaseClient.from('activities').delete().eq('grade', g).eq('activity_name', a);
                await supabaseClient.from('activities').delete().eq('grade', g).ilike('activity_name', a + ' -%');
            }
        } else if (type === 'report') {
            const u = document.getElementById('d-unit').value;
            const s = document.getElementById('d-section').value;
            if (!u || !s || !confirm('Rapor silinsin mi?')) return;
            if (supabaseClient) {
                await supabaseClient.from('report_templates').delete().eq('grade', g).eq('unit_name', u).eq('section_name', s);
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
    const sel = document.getElementById('d-unit');
    if (!sel) return;
    sel.innerHTML = '<option value="">Ünite</option>';
    (fenData[grade]?.units || []).forEach(u => sel.innerHTML += '<option value="' + u.name + '">' + u.name + '</option>');
}

function fillDelSections() {
    const g = document.getElementById('d-grade')?.value;
    const u = document.getElementById('d-unit')?.value;
    const sel = document.getElementById('d-section');
    if (!sel) return;
    sel.innerHTML = '<option value="">Bölüm</option>';
    const unit = fenData[g]?.units.find(x => x.name === u);
    if (unit) unit.sections.forEach(s => sel.innerHTML += '<option value="' + s + '">' + s + '</option>');

    const actSel = document.getElementById('d-act');
    if (actSel) {
        actSel.innerHTML = '<option value="">Etkinlik</option>';
        const acts = (fenData[g]?.activities || []).filter(a => a.unit === u);
        const bases = new Set();
        acts.forEach(a => {
            const p = a.name.split(' - ');
            bases.add(p.length >= 2 ? p[0] + ' - ' + p[1] : a.name);
        });
        bases.forEach(b => actSel.innerHTML += '<option value="' + b + '">' + b + '</option>');
    }
}

function toggleDel() {
    const type = document.getElementById('d-type')?.value;
    document.getElementById('d-sec-box').style.display = (type === 'section' || type === 'activity' || type === 'report') ? 'block' : 'none';
    document.getElementById('d-act-box').style.display = type === 'activity' ? 'block' : 'none';
}

// ====================== ÖĞRENCİ PANELİ ======================
function renderStudentPanelView(grade, branch, student, push = true) {
    if (push) saveState({ type: 'student', grade: grade, branch: branch, student: student });

    document.getElementById('auth-screen').style.display = 'none';
    document.getElementById('teacher-panel').style.display = 'none';
    document.getElementById('grade-detail-panel').style.display = 'none';
    const panel = document.getElementById('student-panel');
    panel.style.display = 'flex';

    const units = fenData[grade]?.units || [];
    let quizRows = '', qSum = 0, qCnt = 0;
    units.forEach(u => {
        (u.sections || []).forEach(sec => {
            const key = u.name + '_' + sec;
            if (student.quiz?.[key] !== undefined && student.quiz[key] !== '') {
                const sc = student.quiz[key];
                quizRows += '<tr><td style="text-align:left; line-height:1.35;"><b>' + u.name + '</b><br><span style="font-size:12px; color:#94a3b8;">' + sec + '</span></td><td>' + getScoreBadge(sc) + '</td></tr>';
                if (sc !== 'G') { qSum += parseFloat(sc); qCnt++; }
            }
        });
    });
    const qAvg = qCnt ? Math.round(qSum / qCnt) : 0;

    let scaleRows = '', sSum = 0, sCnt = 0;
    units.forEach(u => {
        (u.sections || []).forEach(sec => {
            const acts = (fenData[grade]?.activities || []).filter(a => a.unit === u.name && a.section === sec);
            let sum = 0, cnt = 0;
            acts.forEach(a => {
                const sc = student.scale?.[a.name]?.totalScore;
                if (sc !== undefined && sc !== 'G') { sum += parseFloat(sc); cnt++; }
            });
            if (cnt) {
                const avg = Math.round(sum / cnt);
                scaleRows += '<tr><td style="text-align:left; line-height:1.35;"><b>' + u.name + '</b><br><span style="font-size:12px; color:#94a3b8;">' + sec + '</span></td><td>' + getScaleBadge(avg) + '</td></tr>';
                sSum += avg; sCnt++;
            }
        });
    });
    const sAvg = sCnt ? Math.round(sSum / sCnt) : 0;
    let gen = 0;
    if (qCnt && sCnt) gen = Math.round(qAvg * 0.5 + sAvg * 0.5);
    else if (qCnt) gen = qAvg;
    else if (sCnt) gen = sAvg;

    const safeName = (student.name || 'Ogrenci').replace(/\s+/g, '_');

    // Motivasyon Rozeti
    let badgeTitle = '';
    let badgeEmoji = '';
    let badgeColor = '';

    if (gen >= 90) {
        badgeTitle = 'Fen Yıldızı';
        badgeEmoji = '🌟';
        badgeColor = '#fbbf24';
    } else if (gen >= 80) {
        badgeTitle = 'Bilim Meraklısı';
        badgeEmoji = '🔬';
        badgeColor = '#34d399';
    } else if (gen >= 70) {
        badgeTitle = 'İyi Gidiyorsun';
        badgeEmoji = '📘';
        badgeColor = '#60a5fa';
    } else if (gen >= 50) {
        badgeTitle = 'Gelişiyor';
        badgeEmoji = '💪';
        badgeColor = '#a78bfa';
    } else {
        badgeTitle = 'Desteklenmeli';
        badgeEmoji = '🌱';
        badgeColor = '#f87171';
    }

    let plusBadge = '';
    if (student.plus >= 5) {
        plusBadge = `
            <div style="margin-top:8px;">
                <span style="display:inline-block; background:#166534; color:#86efac; padding:4px 12px; border-radius:20px; font-size:12px; font-weight:600;">
                    ⭐ Aktif Katılımcı (+${student.plus})
                </span>
            </div>`;
    }

    panel.innerHTML = `
        <header class="teacher-header">
            <div class="header-brand"><h1>${student.name}</h1></div>
            <button onclick="logoutStudent()" class="logout-btn">Çıkış</button>
        </header>
        <section class="dashboard-content" style="max-width:700px; margin:0 auto;">
            <div id="student-print" class="print-area">
                <div class="print-header">
                    <h2>FENOMENAL FEN BİLİMLERİ DİJİTAL EĞİTİM PORTALI</h2>
                    <h3>Öğrenci Karnesi</h3>
                </div>
                <div class="print-info">
                    <p><b>Ad:</b> ${student.name}</p>
                    <p><b>No / Şube:</b> ${student.no} | ${grade}. Sınıf - ${branch}</p>
                    <p><b>Quiz Ort:</b> ${qCnt ? qAvg : '-'}</p>
                    <p><b>Ölçek Ort:</b> ${sCnt ? '%' + sAvg : '-'}</p>
                    <p><b>Genel:</b> ${getScoreBadge(gen)}</p>
                    <p><b>Artı / Eksi:</b> ${student.plus} / ${student.minus}</p>

                    <div style="margin-top:12px;">
                        <span style="display:inline-flex; align-items:center; gap:8px; background:rgba(255,255,255,0.07); padding:7px 14px; border-radius:20px; border:1px solid ${badgeColor};">
                            <span style="font-size:20px;">${badgeEmoji}</span>
                            <span style="font-weight:600; color:${badgeColor}; font-size:14px;">${badgeTitle}</span>
                        </span>
                    </div>
                    ${plusBadge}
                </div>

                <h4 style="margin:16px 0 6px; font-size:14px;">Quiz Sonuçları</h4>
                <table class="data-table">
                    <thead>
                        <tr>
                            <th style="text-align:left;">Ünite / Bölüm</th>
                            <th>Not</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${quizRows || '<tr><td colspan="2">Yok</td></tr>'}
                    </tbody>
                </table>

                <h4 style="margin:18px 0 6px; font-size:14px;">Ölçek Ortalamaları</h4>
                <table class="data-table">
                    <thead>
                        <tr>
                            <th style="text-align:left;">Ünite / Bölüm</th>
                            <th>Ort</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${scaleRows || '<tr><td colspan="2">Yok</td></tr>'}
                    </tbody>
                </table>
            </div>

            <div style="text-align:center; margin-top:18px; display:flex; gap:10px; justify-content:center; flex-wrap:wrap;">
                <button onclick="exportTableToWord('student-print', '${safeName}_Karne')" class="auth-btn" style="background:#2563eb; width:auto; padding:10px 18px;">
                    📥 Word
                </button>
                <button onclick="exportTableToPDF('student-print', '${safeName}_Karne')" class="auth-btn" style="background:#dc2626; width:auto; padding:10px 18px;">
                    📄 PDF
                </button>
            </div>
        </section>`;
}

// ====================== BAŞLANGIÇ ======================
document.addEventListener('DOMContentLoaded', async () => {
    await loadAllDataFromSupabase();
    const gradeSel = document.getElementById('student-grade');
    if (gradeSel) {
        gradeSel.addEventListener('change', updateStudentBranches);
        updateStudentBranches();
    }
    ['teacher-email', 'teacher-password'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('keydown', e => { if (e.key === 'Enter') teacherLogin(); });
    });

    restoreStateFromSession();
});
